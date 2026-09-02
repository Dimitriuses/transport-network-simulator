// A conflict must stay something two real operators would do.
//
// The constraint exists because every failing-gate pressure in this project
// points the same way: make the conflict bigger. `C-coordinate-offset` costs
// nothing until 260 m and 27 minutes at 500 m, so a gate measured on journey
// time can always be passed by cranking it — and a world where two agencies
// place one stop half a kilometre apart is not teaching integration any more,
// it is teaching that the map is broken.
//
// `SWEEPS` carries a plausible ceiling and the reason for it. These tests keep
// the committed world inside it, so the pressure has nowhere to go.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { SWEEPS, isPlausible } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

test("every declared setting is one two real operators could disagree by", { skip }, () => {
  const world = loadWorld(worldPath);
  for (const op of world.manifest.operators) {
    const bag = op.manifest as Record<string, Record<string, unknown>>;
    for (const sweep of SWEEPS) {
      const value = bag[sweep.group]?.[sweep.key];
      if (value === undefined || value === sweep.off) continue;
      assert.ok(
        isPlausible(sweep, value),
        `${op.id} publishes ${sweep.group}.${sweep.key}=${String(value)}, stronger than ` +
          `${String(sweep.plausible?.max)} — ${sweep.plausible?.because}. A conflict past that ` +
          `stops describing two operators disagreeing.`,
      );
    }
  }
});

test("a plausible ceiling names the real cause that produces it", () => {
  for (const sweep of SWEEPS) {
    if (!sweep.plausible) continue;
    assert.ok(
      sweep.plausible.because.length > 20,
      `${sweep.conflict} has a ceiling with no stated provenance. A number nobody can ` +
        `argue with is a number nobody can correct.`,
    );
  }
});

test("the ceilings actually bind — some tested settings are beyond them", () => {
  // If every value the probe tries is plausible, the ceiling is decorative and
  // would not stop anyone cranking a conflict to pass a gate.
  const beyond = SWEEPS.flatMap((s) => s.values.filter((v) => !isPlausible(s, v)));
  assert.ok(beyond.length > 0, "no swept setting is beyond its plausible ceiling");
});
