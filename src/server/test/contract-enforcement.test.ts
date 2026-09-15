// The contract items the simulator had specified and never done, done (P2M8):
// the run token, the version header, capability gating, adaptive tick cadence,
// the brief digest and budgets, the consecutive-failure abort, and a wall guard
// breached in `virtual` making the run invalid.
//
// Specification: PLAYER-CONTRACT.md §3, §4, §5.2, §5.6, §5.7, §6.1, §8;
// TIME-MODEL.md §9; KNOWN-ISSUES.md #72.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { scoreRun } from "@tns/scoring";
import type { RunRecord } from "@tns/schema";
import { ABORT_AFTER_CONSECUTIVE_FAILURES, ContractMismatch, runOpenLoop, type HarnessOptions } from "../src/harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

type Obligation = Extract<RunRecord, { kind: "obligation" }>;
const obligations = (log: RunRecord[]) => log.filter((r): r is Obligation => r.kind === "obligation");

interface Seen {
  path: string;
  body: Record<string, unknown>;
  headers: IncomingMessage["headers"];
}

/** A player whose answers a test writes. Declines plans unless told otherwise. */
async function scriptedPlayer(
  port: number,
  script: {
    identity?: Record<string, unknown>;
    plan?: (body: Record<string, unknown>, n: number) => Promise<{ status: number; body: unknown }>;
    tick?: (body: Record<string, unknown>) => unknown;
  },
) {
  const seen: Seen[] = [];
  let plans = 0;
  const reply = (res: ServerResponse, status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      void (async () => {
        const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const path = req.url ?? "/";
        seen.push({ path, body, headers: req.headers });
        if (path === "/v1/health") return reply(res, 200, { status: "ready" });
        if (path === "/v1/identity") {
          return reply(res, 200, {
            name: "scripted",
            version: "1",
            contract_versions: ["0.3"],
            capabilities: ["plan", "replan"],
            ...script.identity,
          });
        }
        if (path === "/v1/plan" || path === "/v1/replan") {
          const n = plans++;
          const requests = body["requests"] as { request_id: string }[];
          if (script.plan) {
            const r = await script.plan(body, n);
            return reply(res, r.status, r.body);
          }
          return reply(res, 200, { results: requests.map((q) => ({ request_id: q.request_id, status: "declined", itinerary: null })) });
        }
        if (path === "/v1/tick") return reply(res, 200, script.tick ? script.tick(body) : { status: "ok" });
        return reply(res, 200, {});
      })();
    });
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r()));
  return { seen, close: () => new Promise<void>((r) => server.close(() => r())) };
}

function withPorts(base: number): Pick<HarnessOptions, "playerBaseUrl" | "operatorPort" | "controlPort"> {
  return { playerBaseUrl: `http://127.0.0.1:${base + 10}`, operatorPort: base, controlPort: base + 9 };
}

test("a run with a token sends it, and the control API refuses a caller without it or without the version", { skip }, async () => {
  const world = loadWorld(worldPath);
  const token = "t0ken-for-this-run";
  const player = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", join(repoRoot, "src", "refplayer", "scripts", "serve.ts")], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, TNS_PLAYER_PORT: "8510", TNS_CONTROL_URL: "http://127.0.0.1:8509", TNS_PLAYER_MODE: "naive", TNS_TOKEN: token },
  });
  const probes: Record<string, number> = {};
  let log: RunRecord[];
  try {
    log = await runOpenLoop({
      world,
      ...withPorts(8500),
      token,
      onState: (s) => {
        if (s !== "running" || probes["none"]) return;
        probes["none"] = -1;
        void (async () => {
          probes["none"] = (await fetch("http://127.0.0.1:8509/v1/brief")).status;
          probes["wrongToken"] = (await fetch("http://127.0.0.1:8509/v1/clock", { headers: { authorization: "Bearer nope", "X-TNS-Contract": "0.3" } })).status;
          probes["noVersion"] = (await fetch("http://127.0.0.1:8509/v1/clock", { headers: { authorization: `Bearer ${token}` } })).status;
          probes["good"] = (await fetch("http://127.0.0.1:8509/v1/clock", { headers: { authorization: `Bearer ${token}`, "X-TNS-Contract": "0.3" } })).status;
        })();
      },
    });
  } finally {
    player.kill();
  }
  // The reference player refuses a caller without the token, so a run that
  // planned anything at all is a run whose simulator sent it.
  assert.ok(obligations(log).some((o) => o.obligation === "plan" && o.outcome === "ok"), "no plan was answered");
  assert.deepEqual(probes, { none: 401, wrongToken: 401, noVersion: 400, good: 200 });
});

test("a player speaking another contract version never sees the run start", { skip }, async () => {
  const player = await scriptedPlayer(8530, { identity: { contract_versions: ["9.9"] } });
  try {
    await assert.rejects(runOpenLoop({ world: loadWorld(worldPath), ...withPorts(8520) }), ContractMismatch);
    assert.ok(!player.seen.some((s) => s.path === "/v1/run-start"), "run-start was sent across a version mismatch");
    assert.ok(player.seen.every((s) => s.headers["x-tns-contract"] === "0.3"), "a request went without X-TNS-Contract");
  } finally {
    await player.close();
  }
});

test("what a player does not claim, it is not asked — and its travellers count as forgone", { skip }, async () => {
  const player = await scriptedPlayer(8550, { identity: { capabilities: [] } });
  try {
    const log = await runOpenLoop({ world: loadWorld(worldPath), ...withPorts(8540) });
    assert.ok(!player.seen.some((s) => s.path === "/v1/plan"), "an unclaimed plan was sent");
    const plans = obligations(log).filter((o) => o.obligation === "plan");
    assert.equal(plans.length, 98);
    assert.ok(plans.every((o) => o.outcome === "unclaimed" && o.unsent === true));
    const card = scoreRun(log);
    assert.equal(card.service.forgone, 98);
  } finally {
    await player.close();
  }
});

test(`${ABORT_AFTER_CONSECUTIVE_FAILURES} failures in a row and the day carries on without the player, scored as player_failure`, { skip }, async () => {
  const player = await scriptedPlayer(8570, { plan: () => Promise.resolve({ status: 500, body: {} }) });
  try {
    const log = await runOpenLoop({ world: loadWorld(worldPath), ...withPorts(8560) });
    const plans = obligations(log).filter((o) => o.obligation === "plan");
    const sent = plans.filter((o) => !o.unsent);
    assert.equal(sent.length, ABORT_AFTER_CONSECUTIVE_FAILURES, "the player was asked past the abort threshold");
    assert.equal(player.seen.filter((s) => s.path === "/v1/plan").length, ABORT_AFTER_CONSECUTIVE_FAILURES);
    assert.equal(log.filter((r) => r.kind === "traveller").length, 98, "the day did not carry on to its end");
    const end = log.find((r) => r.kind === "run_end") as Extract<RunRecord, { kind: "run_end" }>;
    assert.equal(end.reason, "player_failure");
    const card = scoreRun(log);
    assert.equal(card.verdict, "scored");
    assert.match(card.verdictReason ?? "", /player_failure/);
  } finally {
    await player.close();
  }
});

test("a wall guard breached in virtual makes the run invalid, not a bad score", { skip }, async () => {
  const player = await scriptedPlayer(8590, {
    plan: async (body, n) => {
      if (n === 0) await new Promise((r) => setTimeout(r, 1500));
      const requests = body["requests"] as { request_id: string }[];
      return { status: 200, body: { results: requests.map((q) => ({ request_id: q.request_id, status: "declined", itinerary: null })) } };
    },
  });
  try {
    const log = await runOpenLoop({ world: loadWorld(worldPath), ...withPorts(8580), guardWallS: 1 });
    assert.equal(obligations(log).filter((o) => o.outcome === "player_timeout").length, 1);
    const end = log.find((r) => r.kind === "run_end") as Extract<RunRecord, { kind: "run_end" }>;
    assert.equal(end?.reason, "invalid");
    assert.equal(scoreRun(log).verdict, "invalid");
  } finally {
    await player.close();
  }
});

test("a tick response can move the next tick, and the log says it did", { skip }, async () => {
  const player = await scriptedPlayer(8610, {
    identity: { capabilities: ["plan", "replan", "tick"], tick: { interval_sim_s: 60 } },
    tick: () => ({ status: "ok", next_interval_sim_s: 900 }),
  });
  try {
    const log = await runOpenLoop({ world: loadWorld(worldPath), ...withPorts(8600) });
    const ticks = obligations(log).filter((o) => o.obligation === "tick");
    assert.ok(ticks.length > 2);
    assert.ok(ticks.every((t) => t.nextIntervalS === 900));
    const gaps = ticks.slice(1).map((t, i) => t.issuedAt - ticks[i]!.issuedAt);
    assert.ok(gaps.every((g) => g === 900), `ticks were ${[...new Set(gaps)].join(", ")} s apart, not 900`);
  } finally {
    await player.close();
  }
});

test("run-start carries a digest of the brief a player reads, and the brief states its budgets", { skip }, async () => {
  const player = await scriptedPlayer(8630, {});
  let brief: Record<string, unknown> | null = null;
  try {
    await runOpenLoop({
      world: loadWorld(worldPath),
      ...withPorts(8620),
      onState: (s) => {
        if (s === "running" && !brief) {
          brief = {};
          void fetch("http://127.0.0.1:8629/v1/brief").then(async (r) => (brief = (await r.json()) as Record<string, unknown>));
        }
      },
    });
    const start = player.seen.find((s) => s.path === "/v1/run-start")!;
    const served = brief as unknown as Record<string, Record<string, unknown>>;
    assert.equal(start.body["brief_digest"], createHash("sha256").update(JSON.stringify(served)).digest("hex"));
    assert.equal(served["run"]!["wall_budget_s"], 3600);
    assert.equal(served["run"]!["abort_after_consecutive_failures"], ABORT_AFTER_CONSECUTIVE_FAILURES);
    assert.equal((served["preparation"] as Record<string, unknown>)["wall_budget_s"], 300);
    const end = player.seen.find((s) => s.path === "/v1/run-end")!;
    assert.equal(end.body["reason"], "completed");
  } finally {
    await player.close();
  }
});
