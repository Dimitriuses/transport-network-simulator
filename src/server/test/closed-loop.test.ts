// P2M2: travellers on the clock, the app-user fraction, and replay.
//
// Specification: SCORING.md §12, REFERENCE-POLICY.md §3, KNOWN-ISSUES.md #66.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { scoreRun } from "@tns/scoring";
import type { RunRecord } from "@tns/schema";
import { runOpenLoop, selectAppUsers, type HarnessOptions } from "../src/harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

type Traveller = Extract<RunRecord, { kind: "traveller" }>;
type Obligation = Extract<RunRecord, { kind: "obligation" }>;

async function runClosed(
  ports: { operator: number; control: number; player: number },
  extra: Partial<HarnessOptions> = {},
): Promise<RunRecord[]> {
  const world = loadWorld(worldPath);
  const player = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        TNS_PLAYER_PORT: String(ports.player),
        TNS_CONTROL_URL: `http://127.0.0.1:${ports.control}`,
        TNS_PLAYER_MODE: "naive",
      },
    },
  );
  try {
    return await runOpenLoop({
      world,
      playerBaseUrl: `http://127.0.0.1:${ports.player}`,
      operatorPort: ports.operator,
      controlPort: ports.control,
      loop: "closed",
      ...extra,
    });
  } finally {
    player.kill();
  }
}

test("the app users at a smaller fraction are among those at a larger one", () => {
  const ids = Array.from({ length: 98 }, (_, i) => `q${String(i).padStart(3, "0")}`);
  const quarter = selectAppUsers(ids, 0.25, 481516);
  const half = selectAppUsers(ids, 0.5, 481516);
  assert.equal(quarter.size, 25);
  assert.equal(half.size, 49);
  for (const id of quarter) assert.ok(half.has(id), `${id} uses the app at 0.25 and not at 0.5`);

  // Independent of the order the ids arrive in, and of nothing but the seed.
  assert.deepEqual([...selectAppUsers([...ids].reverse(), 0.5, 481516)].sort(), [...half].sort());
  assert.notDeepEqual([...selectAppUsers(ids, 0.5, 7)].sort(), [...half].sort());

  assert.equal(selectAppUsers(ids, 0, 1).size, 0);
  assert.equal(selectAppUsers(ids, 1, 1).size, 98);
  assert.throws(() => selectAppUsers(ids, 1.5, 1));
});

test("an open-loop run refuses an app-user fraction", { skip }, async () => {
  await assert.rejects(
    runOpenLoop({
      world: loadWorld(worldPath),
      playerBaseUrl: "http://127.0.0.1:1",
      operatorPort: 9280,
      controlPort: 9289,
      appUserFraction: 0.5,
    }),
    /closed-loop/,
  );
});

test("in closed loop a replan is asked when the traveller reaches the break", { skip }, async () => {
  const log = await runClosed({ operator: 9280, control: 9289, player: 8280 });

  const header = log.find((r) => r.kind === "run_header") as Extract<RunRecord, { kind: "run_header" }>;
  assert.equal(header.loop, "closed");
  assert.equal(header.appUserFraction, 1);

  // Open loop walks a journey when its plan is answered, so its replans are
  // logged before their own plan and ahead of the clock (#66). On the clock,
  // every obligation is handled in τ order.
  const obligations = log.filter((r): r is Obligation => r.kind === "obligation");
  const replans = obligations.filter((o) => o.obligation === "replan");
  assert.ok(replans.length > 0, "no plan broke, so nothing was asked on the clock");
  for (let i = 1; i < obligations.length; i++) {
    assert.ok(
      obligations[i]!.issuedAt >= obligations[i - 1]!.issuedAt,
      `${obligations[i]!.requestId} at τ ${obligations[i]!.issuedAt} was handled after τ ${obligations[i - 1]!.issuedAt}`,
    );
  }
  // And each replan is asked after the plan it replans.
  const planAt = new Map(obligations.filter((o) => o.obligation === "plan").map((o, i) => [o.requestId, i]));
  for (const r of replans) {
    const base = r.requestId.replace(/-r\d+$/, "");
    assert.ok((planAt.get(base) ?? Infinity) < obligations.indexOf(r), `${r.requestId} preceded its plan`);
  }

  const travellers = log.filter((r): r is Traveller => r.kind === "traveller");
  assert.equal(travellers.length, 98);
  assert.ok(travellers.every((t) => t.appUser === true));

  const card = scoreRun(log);
  assert.equal(card.comparable, false);
  assert.match(card.notComparableBecause ?? "", /closed-loop/);
  assert.equal(card.service.travellers, 98);
});

test("outside the app-user fraction nobody is asked, and nobody is scored", { skip }, async () => {
  const log = await runClosed({ operator: 9290, control: 9299, player: 8290 }, { appUserFraction: 0.5 });
  const travellers = log.filter((r): r is Traveller => r.kind === "traveller");
  const users = travellers.filter((t) => t.appUser);
  const others = travellers.filter((t) => t.appUser === false);
  assert.equal(travellers.length, 98, "the log holds the whole population");
  assert.equal(users.length, 49);

  const asked = new Set(
    log
      .filter((r): r is Obligation => r.kind === "obligation" && r.obligation !== "tick")
      .map((o) => o.travellerRef),
  );
  for (const t of others) {
    assert.ok(!asked.has(t.travellerRef), `${t.travellerRef} is outside the app and was asked about`);
    // The reference policy's own journey, exactly.
    assert.equal(t.journeyS, t.referenceJourneyS);
    assert.equal(t.forgone, false);
  }

  const card = scoreRun(log);
  assert.equal(card.service.travellers, 49);
  assert.equal(card.service.outsideApp, 49);

  // SCORING.md §12, Q19: replayed on its own answers, with no player at all, the
  // run decides every traveller and every obligation as it did.
  const replayed = await runOpenLoop({
    world: loadWorld(worldPath),
    playerBaseUrl: "http://127.0.0.1:1",
    operatorPort: 9370,
    controlPort: 9379,
    loop: "closed",
    appUserFraction: 0.5,
    replay: log,
  });
  const decided = (records: RunRecord[]) =>
    records
      .filter((r) => r.kind === "traveller" || r.kind === "obligation")
      .map((r) => (r.kind === "obligation" ? { ...r, latencyMs: null } : r));
  assert.deepEqual(decided(replayed), decided(log));
  assert.equal(scoreRun(replayed).service.capture, card.service.capture);

  // A replay that is asked something the recorded run never was has diverged.
  await assert.rejects(
    runOpenLoop({
      world: loadWorld(worldPath),
      playerBaseUrl: "http://127.0.0.1:1",
      operatorPort: 9370,
      controlPort: 9379,
      loop: "closed",
      appUserFraction: 0.75,
      replay: log,
    }),
    /replay diverged/,
  );
});
