// Inserting a rung must be one entry, and a rung's id must outlive its number.
//
// Specification: ROADMAP.md P1M5, KNOWN-ISSUES.md #48.
//
// The ladder was six tables keyed by the literals 0-5 — sections, quota,
// cosmetic-only, density, clearance, and seventeen `range(6)` loops in Python.
// Adding a rung meant editing all of them, and the question "what should the
// other five say at 2.5" has no good answer.
//
// These tests state the two properties that replacing them was for.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LADDER,
  LADDER_VERSION,
  cosmeticOnlyTiers,
  densityByTier,
  quotaByTier,
  rungAt,
  rungById,
  sectionsByTier,
  tierOfRung,
  type Rung,
} from "../src/ladder.ts";
import { clearanceLadderOf, CLEARANCE_LADDER } from "../src/clearance.ts";

/** A rung to slot in between two others. Deliberately unlike its neighbours. */
const INTERMEDIATE: Rung = {
  id: "test-intermediate",
  name: "a rung inserted by a test",
  sections: ["A", "B"],
  world: {
    arms: 6,
    sitesPerArm: 3,
    hubQuays: 2,
    chords: 2,
    regionalLines: 1,
    metroLines: 0,
    roster: ["radial", "ring"],
    maxReachShare: 0.62,
  },
  quota: { A: 1, B: 1, C: 0, D: 0 },
  density: 0.42,
  clearance: { from: "blind", to: "naive", at: 0.5, because: "halfway" },
};

test("inserting a rung moves every view, and only by one", () => {
  // Between `metro-town` (2) and `metro-city` (3). **One entry, one list.**
  const widened = [...LADDER.slice(0, 3), INTERMEDIATE, ...LADDER.slice(3)];

  assert.equal(widened.length, LADDER.length + 1);

  // Below the insertion: untouched.
  assert.deepEqual(sectionsByTier(widened)[2], sectionsByTier(LADDER)[2]);
  assert.deepEqual(quotaByTier(widened)[2], quotaByTier(LADDER)[2]);
  assert.equal(densityByTier(widened)[2], densityByTier(LADDER)[2]);

  // At the insertion: the new rung.
  assert.deepEqual(sectionsByTier(widened)[3], ["A", "B"]);
  assert.equal(densityByTier(widened)[3], 0.42);
  assert.equal(clearanceLadderOf(widened)[3]?.because, "halfway");

  // Above it: shifted by exactly one, in every view at once. This is the
  // property — five tables that used to be edited by hand now follow.
  for (let tier = 3; tier < LADDER.length; tier++) {
    assert.deepEqual(sectionsByTier(widened)[tier + 1], sectionsByTier(LADDER)[tier]);
    assert.deepEqual(quotaByTier(widened)[tier + 1], quotaByTier(LADDER)[tier]);
    assert.equal(densityByTier(widened)[tier + 1], densityByTier(LADDER)[tier]);
    assert.equal(
      clearanceLadderOf(widened)[tier + 1]?.because,
      clearanceLadderOf(LADDER)[tier]?.because,
    );
  }

  // And a cosmetic-only rung below the insertion keeps its index.
  assert.deepEqual(cosmeticOnlyTiers(widened), cosmeticOnlyTiers(LADDER));
});

test("an insertion below a cosmetic-only rung moves it too", () => {
  // The case the test above cannot see: `cosmeticOnlyTiers` is the one view
  // that reports *indices* rather than being keyed by them, so it is the one
  // most likely to be left behind by a renumbering.
  const widened = [LADDER[0]!, INTERMEDIATE, ...LADDER.slice(1)];
  assert.deepEqual(cosmeticOnlyTiers(LADDER), [1]);
  assert.deepEqual(cosmeticOnlyTiers(widened), [2]);
});

test("a rung's id outlives its number", () => {
  const widened = [...LADDER.slice(0, 3), INTERMEDIATE, ...LADDER.slice(3)];

  // The point of an id: a result recorded as `metro-city` is still readable
  // after `metro-city` stops being tier 3.
  assert.equal(tierOfRung("metro-city", LADDER), 3);
  assert.equal(tierOfRung("metro-city", widened), 4);
  assert.equal(rungById("metro-city", widened)?.name, rungById("metro-city", LADDER)?.name);

  // A rung this ladder no longer has is reported missing, not defaulted.
  assert.equal(tierOfRung("no-such-rung"), -1);
  assert.equal(rungById("no-such-rung"), null);
});

test("ids are unique and stable-looking, and the version is declared", () => {
  const ids = LADDER.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "two rungs share an id");
  for (const id of ids) {
    assert.match(id, /^[a-z][a-z0-9-]*$/, `${id} is not a stable-looking id`);
  }
  assert.ok(Number.isInteger(LADDER_VERSION) && LADDER_VERSION >= 1);
});

test("a tier off the ladder is null rather than a default", () => {
  // A default here would let a world declare a rung nobody defined and be
  // graded against something plausible — the failure the whole module is
  // written against.
  assert.equal(rungAt(0)?.id, "clean");
  assert.equal(rungAt(LADDER.length), null);
  assert.equal(rungAt(-1), null);
});

test("the shipped ladder still says what the six tables said", () => {
  // The refactor's own regression check, in the smallest form that can fail:
  // the values are quoted here rather than derived, so a change to the ladder
  // that was meant to be a change of *form* shows up as a change of content.
  assert.deepEqual(
    LADDER.map((r) => r.quota),
    [
      { A: 0, B: 0, C: 0, D: 0 },
      { A: 2, B: 0, C: 0, D: 0 },
      { A: 3, B: 1, C: 1, D: 0 },
      { A: 3, B: 1, C: 1, D: 2 },
      { A: 4, B: 1, C: 2, D: 3 },
    ],
  );
  assert.deepEqual(
    LADDER.map((r) => r.density),
    [0, 1, 0.55, 0.6, 0.8],
  );
  // The scale, which is the ordered axis: every rung is at least as large as
  // the one below it, and the roster never shrinks.
  for (let i = 1; i < LADDER.length; i++) {
    const below = LADDER[i - 1]!.world;
    const here = LADDER[i]!.world;
    assert.ok(here.arms >= below.arms, `rung ${i} has fewer arms than ${i - 1}`);
    assert.ok(
      here.arms * here.sitesPerArm >= below.arms * below.sitesPerArm,
      `rung ${i} is a smaller city than ${i - 1}`,
    );
    assert.ok(
      here.roster.length >= below.roster.length,
      `rung ${i} has fewer operators than ${i - 1}`,
    );
  }
  assert.deepEqual(
    CLEARANCE_LADDER.map((b) => `${b.from}->${b.to}@${b.at}`),
    [
      "null->blind@0",
      "null->blind@1",
      "blind->naive@1",
      "naive->competent@0.5",
      "naive->competent@1.25",
    ],
  );
});
