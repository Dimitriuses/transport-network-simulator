// A world is a rung only if it misses none of three bars — and the screen and the
// gates must agree about which.
//
// `npm run wall` checked Gate 1b's wall end and Gate 3's floor and never the not-
// trivial end, so it called a world where a lazy integrator captured 0.571 a rung.
// And it passed Gate 3 at exactly 20 % where `npm run gates` failed it. The cases
// below are the worlds the ladder actually produced, and the first one is the case
// the old screen got wrong.

import { test } from "node:test";
import assert from "node:assert/strict";

import { LAZY_LOSS_LIMIT, LAZY_TRIVIAL_AT, MATERIALITY_FLOOR, rungVerdict } from "../src/index.ts";

test("a lazy integrator that has already won is not a rung, however much the conflicts cost", () => {
  // C3b, `metro-city`: lazy 0.571 at 26 % of headroom. Material, not a wall, and
  // trivial by Gate 1b. The old screen printed "rung".
  const v = rungVerdict(0.571, 0.26, true);
  assert.equal(v.notTrivial, false);
  assert.equal(v.label, "easy");
});

test("the worlds the ladder produced, as the gates would read them", () => {
  const cases: [string, number, number, string][] = [
    ["Phase 0's committed world", 0.186, 0.44, "rung"],
    ["towns-and-rail, three local_naive operators", 0.057, 0.61, "rung"],
    ["towns-and-rail, none", 0.618, 0.09, "easy, thin"],
    ["metro-town, the calibrated world", 0.732, 0.08, "easy, thin"],
    ["towns-and-rail with B-dst-offset drawn", -5.672, 5.02, "WALL"],
  ];
  for (const [name, lazy, share, label] of cases) {
    assert.equal(rungVerdict(lazy, share, true).label, label, name);
  }
});

test("each bar sits where the gates put it, and on the ratified side of it", () => {
  // "At least 20 %": exactly 20 % is material. The gates used to fail it.
  assert.equal(rungVerdict(0, MATERIALITY_FLOOR, true).material, true);
  assert.equal(rungVerdict(0, MATERIALITY_FLOOR - 1e-9, true).material, false);
  // Capture of exactly -1 loses as much as perfect integration wins: not yet a wall.
  assert.equal(rungVerdict(LAZY_LOSS_LIMIT, 1, true).notAWall, true);
  assert.equal(rungVerdict(LAZY_LOSS_LIMIT - 1e-9, 1, true).label, "WALL");
  // Not trivial means strictly under 0.5.
  assert.equal(rungVerdict(LAZY_TRIVIAL_AT, 1, true).notTrivial, false);
});

test("a rung with no semantic conflict answers neither question", () => {
  // `small-town` is texture by design; a lazy integrator doing well there is the
  // rung working (KNOWN-ISSUES.md #52).
  assert.equal(rungVerdict(0.877, 0, false).label, "n/a");
});
