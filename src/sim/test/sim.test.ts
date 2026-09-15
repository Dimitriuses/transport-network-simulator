// P2M8's exit, through the server's own API: start a session against a world,
// connect a solution with a token, watch it, pause it, change its speed, stop
// it — and find every control action in the run log.
//
// Specification: ROADMAP.md P2M8.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { scoreRun } from "@tns/scoring";
import type { RunRecord } from "@tns/schema";
import { readRunLog } from "@tns/server";
import { startSimServer } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const skip = existsSync(join(repoRoot, "worlds", "m1.world.db")) ? false : "no world bundle";

const ADMIN = "admin-token-for-tests";
let BASE = "http://127.0.0.1:8650";

async function api(path: string, token: string | null, method = "GET", body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, any> };
}

async function until(predicate: () => Promise<boolean>, timeoutMs: number, what: string): Promise<void> {
  const started = Date.now();
  while (!(await predicate())) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

const stateOf = async () => (await api("/api/state", ADMIN)).body["clock"]?.["state"] as string | undefined;

test("a session runs a solution end to end, and each audience sees what it may", { skip }, async () => {
  const runDir = mkdtempSync(join(tmpdir(), "tns-sim-"));
  const sim = await startSimServer({ port: 8650, repoRoot, runDir, adminToken: ADMIN, ports: { api: 8660, referencePlayer: 8670 } });
  try {
    // Nobody without a token, for the pages or the API.
    assert.equal((await fetch(`${BASE}/`)).status, 401);
    assert.equal((await api("/api/state", null)).status, 401);
    assert.equal((await api("/api/state", "wrong")).status, 401);

    const created = await api("/api/session", ADMIN, "POST", { world: "worlds/m1.world.db", loop: "open", timeMode: "virtual", disclosure: "attributed" });
    assert.equal(created.status, 201);
    const solution = await api("/api/solutions", ADMIN, "POST", { reference: "naive" });
    assert.equal(solution.status, 201);
    const token = solution.body["token"] as string;

    // Open loop takes one solution.
    assert.equal((await api("/api/solutions", ADMIN, "POST", { baseUrl: "http://127.0.0.1:9" })).status, 400);

    // The solution's own token opens its view, and changes nothing.
    const view = await api("/api/state", token);
    assert.equal(view.status, 200);
    assert.equal(view.body["role"], "player");
    assert.equal(view.body["session"]["world"]["file"], undefined, "a player was told the world's file");
    assert.equal((await api("/api/start", token, "POST")).status, 403);
    assert.equal((await api("/api/map", token)).status, 403, "the map was shown below full disclosure");

    // Registering brings the APIs up and prepares: Start is refused until the player is ready.
    await until(async () => (await stateOf()) === "ready", 90_000, "the reference player to be ready");
    const ready = (await api("/api/state", ADMIN)).body;
    assert.deepEqual(ready["session"]["identity"]["contractVersions"], ["0.3"]);
    assert.equal((await api("/api/start", ADMIN, "POST")).status, 202);
    await until(async () => (await stateOf()) === "ended", 120_000, "the run to end");

    const state = (await api("/api/state", ADMIN)).body;
    const runPath = state["session"]["runPath"] as string;
    assert.ok(runPath && existsSync(runPath), "no run file was written");
    const log = readRunLog(runPath);
    assert.equal(log.filter((r) => r.kind === "traveller").length, 98);
    assert.equal(state["live"]["obligations"]["total"], log.filter((r) => r.kind === "obligation").length, "the dashboard counted differently from the log");
    assert.equal(scoreRun(log).verdict, "scored");

    // The live stream speaks the same snapshot.
    const events = await fetch(`${BASE}/api/events`, { headers: { authorization: `Bearer ${ADMIN}` } });
    const reader = events.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    await reader.cancel();
    assert.match(first, /^data: \{/);
  } finally {
    await sim.close();
    rmSync(runDir, { recursive: true, force: true });
  }
});

test("a scaled session pauses with τ still, changes speed, stops, and its log says so", { skip }, async () => {
  const runDir = mkdtempSync(join(tmpdir(), "tns-sim-"));
  BASE = "http://127.0.0.1:8680";
  const sim = await startSimServer({ port: 8680, repoRoot, runDir, adminToken: ADMIN, ports: { api: 8690, referencePlayer: 8700 } });
  try {
    await api("/api/session", ADMIN, "POST", { world: "worlds/m1.world.db", loop: "open", timeMode: "scaled", speed: 600, disclosure: "full" });
    await api("/api/solutions", ADMIN, "POST", { reference: "naive" });
    await until(async () => (await stateOf()) === "ready", 90_000, "the reference player to be ready");
    await api("/api/start", ADMIN, "POST");
    await until(async () => (await stateOf()) === "running", 60_000, "the run to start");

    // Controls are the administrator's.
    assert.equal((await api("/api/map", ADMIN)).status, 200);
    await new Promise((r) => setTimeout(r, 500));
    assert.equal((await api("/api/pause", ADMIN, "POST")).status, 202);
    await until(async () => (await stateOf()) === "paused", 10_000, "the pause to land");
    const tauA = (await api("/api/state", ADMIN)).body["clock"]["tau"];
    await new Promise((r) => setTimeout(r, 700));
    const tauB = (await api("/api/state", ADMIN)).body["clock"]["tau"];
    assert.equal(tauB, tauA, "τ moved while paused");

    await api("/api/resume", ADMIN, "POST");
    await until(async () => (await stateOf()) === "running", 10_000, "the resume to land");
    assert.equal((await api("/api/speed", ADMIN, "POST", { timeMode: "scaled", speed: 1200 })).status, 202);
    await until(async () => ((await api("/api/state", ADMIN)).body["clock"]["speed"] as number) === 1200, 10_000, "the speed to change");
    await api("/api/stop", ADMIN, "POST");
    await until(async () => (await stateOf()) === "ended", 30_000, "the stop to land");

    const log = readRunLog((await api("/api/state", ADMIN)).body["session"]["runPath"]);
    const actions = log.filter((r): r is Extract<RunRecord, { kind: "control" }> => r.kind === "control").map((r) => r.action);
    assert.deepEqual(actions, ["pause", "resume", "retime", "stop"]);
    assert.equal((log.find((r) => r.kind === "run_end") as { reason: string }).reason, "aborted");
    const card = scoreRun(log);
    assert.equal(card.verdict, "invalid");
    assert.equal(card.comparable, false);

    // A finished session cannot be started twice.
    assert.equal((await api("/api/start", ADMIN, "POST")).status, 400);
  } finally {
    await sim.close();
    rmSync(runDir, { recursive: true, force: true });
  }
});
