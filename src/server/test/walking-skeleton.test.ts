// The P0M1 exit condition, as an executable test.
//
// ROADMAP.md P0M1: "builds the world, runs the simulation, calls a player and
// prints a score. Twice, with identical output."

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { scoreRun } from "@tns/scoring";
import type { RunRecord } from "@tns/schema";
import { runOpenLoop, hashLog } from "../src/harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");

// Each run starts one API per operator from `operator` upward, plus a control
// API and a player. Blocks are spaced by ten so adding operators cannot make
// two concurrent runs collide.
const hasWorld = existsSync(worldPath);
const skip = hasWorld ? false : "no world bundle; run: npm run world:build";

async function runOnce(
  ports: { operator: number; control: number; player: number },
  mode: "naive" | "null" = "naive",
) {
  const world = loadWorld(worldPath);
  const player = spawn(
    process.execPath,
    [join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        TNS_PLAYER_PORT: String(ports.player),
        TNS_CONTROL_URL: `http://127.0.0.1:${ports.control}`,
        TNS_PLAYER_MODE: mode,
      },
    },
  );
  try {
    return await runOpenLoop({
      world,
      playerBaseUrl: `http://127.0.0.1:${ports.player}`,
      operatorPort: ports.operator,
      controlPort: ports.control,
    });
  } finally {
    player.kill();
  }
}

test("the walking skeleton crosses every layer", { skip }, async () => {
  const log = await runOnce({ operator: 9220, control: 9229, player: 8220 });

  const kinds = new Set(log.map((r) => r.kind));
  // schema -> world bundle -> core -> projection -> operator API -> contract
  // -> run log -> score. Each of these records is evidence one seam held.
  assert.ok(kinds.has("run_header"), "no run header");
  assert.ok(kinds.has("obligation"), "the player was never asked anything");
  assert.ok(kinds.has("ingestion"), "the player never called the operator API");
  assert.ok(kinds.has("traveller"), "no traveller outcomes were produced");
});

test("the run is byte-identical when repeated", { skip }, async () => {
  const first = await runOnce({ operator: 9230, control: 9239, player: 8230 });
  const second = await runOnce({ operator: 9240, control: 9249, player: 8240 });

  // hashLog deliberately excludes wall-clock diagnostics: latencyMs differs on
  // every run by design, and hashing it would make this test fail for the one
  // reason that proves the time model is working.
  assert.equal(hashLog(first), hashLog(second));
});

test("no traveller beats perfect information", { skip }, async () => {
  const log = await runOnce({ operator: 9250, control: 9259, player: 8250 });
  const card = scoreRun(log);

  // Strictly stronger than `capture > 1`, which cannot be formed at all when
  // P0 and P1 coincide — as they do in a single-operator world with no
  // declared conflicts. This check holds regardless of headroom.
  assert.deepEqual(
    card.impossibleTravellers,
    [],
    "a traveller arrived sooner than the oracle, which is impossible",
  );
});

test("a player that answers nothing scores exactly 0.0", { skip }, async () => {
  const log: RunRecord[] = await runOnce({ operator: 9260, control: 9269, player: 8260 }, "null");
  const card = scoreRun(log);

  // The zero point of the capture scale, demonstrated end to end rather than
  // asserted. Every obligation is declined, every traveller falls back to the
  // reference policy, and the player is charged for exactly that — so it lands
  // on 0.0 by construction, not by coincidence (REFERENCE-POLICY.md §8).
  assert.equal(card.obligations["declined"], world().queries.length);
  assert.equal(card.service.capture, 0);
  assert.equal(card.service.meanJourneyS, card.service.meanReferenceS);

  // And it is not rewarded for the tidiness: every one is recorded as forgone.
  const forgone = log.filter((r) => r.kind === "traveller" && r.forgone).length;
  assert.equal(forgone, world().queries.length);
});

test("a naive player is now actively harmful", { skip }, async () => {
  const log = await runOnce({ operator: 9270, control: 9279, player: 8270 });
  const card = scoreRun(log);

  // At P0M2 this test asserted `capture > 0` — a naive player still helped,
  // because a coordinate matcher reconciled a conflict-free world perfectly.
  // P0M3 declared real conflicts and the same player went **negative**: it now
  // routes travellers into journeys worse than they would have found alone.
  //
  // That is the negative region of the capture scale doing exactly what
  // SCORING.md §2 designed it for, and it is the clearest single piece of
  // evidence that the conflicts are not decorative.
  assert.notEqual(card.service.capture, null);
  assert.ok(
    card.service.capture! < 0,
    `naive player captured ${card.service.capture} — it is still helping, so the ` +
      `conflicts are not biting the way P0M3 intends`,
  );
  assert.ok(card.service.capture! < 1, `naive player matched the oracle (${card.service.capture})`);
});

function world() {
  return loadWorld(worldPath);
}
