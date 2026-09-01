// The M1 exit condition, as an executable test.
//
// ROADMAP.md M1: "builds the world, runs the simulation, calls a player and
// prints a score. Twice, with identical output."

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { score } from "@tns/scoring";
import type { RunRecord } from "@tns/schema";
import { runOpenLoop, hashLog } from "../src/harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");

const hasWorld = existsSync(worldPath);
const skip = hasWorld ? false : "no world bundle; run: npm run world:build";

async function runOnce(ports: { operator: number; control: number; player: number }) {
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
        TNS_OPERATOR_URL: `http://127.0.0.1:${ports.operator}`,
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
  const log = await runOnce({ operator: 9201, control: 9202, player: 8201 });

  const kinds = new Set(log.map((r) => r.kind));
  // schema -> world bundle -> core -> projection -> operator API -> contract
  // -> run log -> score. Each of these records is evidence one seam held.
  assert.ok(kinds.has("run_header"), "no run header");
  assert.ok(kinds.has("obligation"), "the player was never asked anything");
  assert.ok(kinds.has("ingestion"), "the player never called the operator API");
  assert.ok(kinds.has("traveller"), "no traveller outcomes were produced");
});

test("the run is byte-identical when repeated", { skip }, async () => {
  const first = await runOnce({ operator: 9203, control: 9204, player: 8203 });
  const second = await runOnce({ operator: 9205, control: 9206, player: 8205 });

  // hashLog deliberately excludes wall-clock diagnostics: latencyMs differs on
  // every run by design, and hashing it would make this test fail for the one
  // reason that proves the time model is working.
  assert.equal(hashLog(first), hashLog(second));
});

test("no traveller beats perfect information", { skip }, async () => {
  const log = await runOnce({ operator: 9207, control: 9208, player: 8207 });
  const card = score(log);

  // Strictly stronger than `capture > 1`, which cannot be formed at all when
  // P0 and P1 coincide — as they do in a single-operator world with no
  // declared conflicts. This check holds regardless of headroom.
  assert.deepEqual(
    card.impossibleTravellers,
    [],
    "a traveller arrived sooner than the oracle, which is impossible",
  );
});

test("M1 has no headroom, and the scorer says so rather than dividing by zero", { skip }, async () => {
  const log: RunRecord[] = await runOnce({ operator: 9209, control: 9210, player: 8209 });
  const card = score(log);

  // One operator and no declared conflicts means the reference policy can do
  // everything the oracle can. There is nothing for an integration layer to
  // capture, and saying so is a true statement about the world rather than a
  // bug (docs/PHASES.md Phase 0, Gate 2).
  assert.equal(card.capture, null);
  assert.match(card.captureNote ?? "", /no headroom/);
  assert.equal(card.meanJourneyS, card.meanOracleS);
});
