// The golden trajectory.
//
// ROADMAP.md P0M4 exit condition. TECHNICAL-RESEARCH.md §4: regenerate a known
// seed and compare a hash of the event log, so any unintended change to the
// engine breaks the build immediately rather than surfacing much later as
// scores that no longer reproduce.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld, generateDisruptions, trajectoryFingerprint } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

test("the same seed produces the same day", () => {
  const journeys = Array.from({ length: 400 }, (_, i) => ({
    id: `j-${String(i).padStart(4, "0")}`,
    startS: 6 * 3600 + i * 90,
  }));

  const a = generateDisruptions(journeys, 481516);
  const b = generateDisruptions(journeys, 481516);
  const other = generateDisruptions(journeys, 481517);

  assert.equal(trajectoryFingerprint(a), trajectoryFingerprint(b));
  assert.notEqual(trajectoryFingerprint(a), trajectoryFingerprint(other));
});

test("journey order does not affect the day", () => {
  // Disruptions are drawn over a sorted journey list, so a change in load
  // order cannot shift the stream — the kind of thing that reproduces on one
  // machine and diverges on another.
  const journeys = Array.from({ length: 200 }, (_, i) => ({
    id: `j-${String(i).padStart(4, "0")}`,
    startS: 6 * 3600 + i * 120,
  }));

  const forward = generateDisruptions(journeys, 99);
  const backward = generateDisruptions([...journeys].reverse(), 99);

  assert.equal(trajectoryFingerprint(forward), trajectoryFingerprint(backward));
});

test("GOLDEN: the committed world's trajectory is unchanged", { skip }, () => {
  const world = loadWorld(worldPath);
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);

  // If this fails, either the world changed or the engine did. Both are
  // legitimate — but both invalidate every score computed before the change,
  // so the new value must be pasted in deliberately, never automatically.
  assert.equal(trajectoryFingerprint(disruptions), "681b1b84a5823ae4");
});
