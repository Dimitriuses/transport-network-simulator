// Both sides of a subtraction must be averaged over the same journeys.
//
// `calibrate` already refuses to average in a rescue. When `P2rt` produces no
// workable plan the traveller is charged `P1`'s outcome — right for scoring, a
// failed integration layer leaves you travelling as if there were none, and
// ruinous for attribution, because `P1` is frequently better than what `P2rt`
// manages by trying. So the gap is taken over the journeys where it planned for
// itself.
//
// That solves the problem inside one world and recreates it across two. The
// conflicted world's survivors are not the honest world's: at the merged top
// rung the declared run gave up on a quarter of the set and the honest run on
// almost none, so `ablate` was subtracting a mean over one population from a
// mean over another (`KNOWN-ISSUES.md` #56).
//
// `CLAUDE.md` states the rule and applies it to the entity set — *varying data
// quality also varies how much data there is, and a comparison that changes
// both cannot attribute to either.* The population is the same rule one level
// up.
//
// **Each test below was checked against the behaviour it names**, by restoring
// that behaviour alone and requiring this file to fail. One to one, with no
// test firing on a change it does not describe:
//
//   1. the honest side averaged over its own survivors  -> test 1 only
//   2. headroom taken over the whole query set          -> test 2 only
//   3. seeds pooled before intersecting                 -> test 3 only
//
// The third is a refactor nobody has written rather than a defect that
// happened; it is here because pooling looks like a harmless optimisation and
// silently empties the intersection.

import { test } from "node:test";
import assert from "node:assert/strict";

import { pairedCost, type QueryGaps } from "../src/index.ts";

/** A calibration carrying only what `pairedCost` reads. */
function calibrationOf(rows: readonly Partial<QueryGaps>[]) {
  const perQuery = rows.map((r) => ({
    queryId: r.queryId ?? "q",
    p0: r.p0 ?? 0,
    p1: r.p1 ?? 0,
    p2: r.p2 ?? 0,
    p2FellBack: r.p2FellBack ?? false,
    p2rt: r.p2rt ?? 0,
    p0a: r.p0a ?? 0,
    p2rtFellBack: r.p2rtFellBack ?? false,
    p0aFellBack: r.p0aFellBack ?? false,
  }));
  // Only `perQuery` is read; the aggregates exist to satisfy the shape.
  return { perQuery } as unknown as Parameters<typeof pairedCost>[0][number];
}

test("the cost is measured where both runs planned, not where either did", () => {
  // **The case the old code got wrong.** One journey both runs planned, and two
  // the conflicts destroyed. On the shared journey the conflicts cost 60 s. The
  // honest run also loses 30 s on each of the two the conflicted run never
  // reached — polling cadence, nothing to do with any conflict.
  const honest = calibrationOf([
    { queryId: "shared", p0a: 100, p2rt: 100, p1: 200, p0: 100 },
    { queryId: "lost-a", p0a: 100, p2rt: 130, p1: 200, p0: 100 },
    { queryId: "lost-b", p0a: 100, p2rt: 130, p1: 200, p0: 100 },
  ]);
  const declared = calibrationOf([
    { queryId: "shared", p0a: 100, p2rt: 160, p1: 200, p0: 100 },
    { queryId: "lost-a", p0a: 100, p2rt: 200, p1: 200, p0: 100, p2rtFellBack: true },
    { queryId: "lost-b", p0a: 100, p2rt: 200, p1: 200, p0: 100, p2rtFellBack: true },
  ]);

  const paired = pairedCost([declared], [honest]);

  assert.equal(paired.matched, 1, "only one journey was planned by both runs");
  assert.equal(paired.withS, 60, "the conflicted run's shortfall on the shared journey");
  assert.equal(paired.withoutS, 0, "the honest run's shortfall on that same journey");
  assert.equal(
    paired.costS,
    60,
    "the conflicts cost 60s on the journey both runs planned. Averaging the honest " +
      "run over all three instead gives 20s and a cost of 40s — a number belonging " +
      "to no journey (KNOWN-ISSUES.md #56).",
  );

  // The old, unmatched arithmetic, stated so the difference cannot be waved
  // away as rounding: it is a third of the answer.
  const unmatchedHonest = (0 + 30 + 30) / 3;
  assert.equal(60 - unmatchedHonest, 40);
  assert.notEqual(paired.costS, 40);
});

test("the headroom divided by comes from the same journeys as the cost", () => {
  // A ratio of a numerator over one population and a denominator over another
  // is not a share of anything. The journey both runs planned has 40s of
  // headroom; the one only the honest run reached has 400s, and including it
  // would flatter the denominator tenfold.
  const honest = calibrationOf([
    { queryId: "shared", p0: 100, p1: 140, p0a: 100, p2rt: 100 },
    { queryId: "lost", p0: 100, p1: 500, p0a: 100, p2rt: 100 },
  ]);
  const declared = calibrationOf([
    { queryId: "shared", p0: 100, p1: 140, p0a: 100, p2rt: 120 },
    { queryId: "lost", p0: 100, p1: 500, p0a: 100, p2rt: 500, p2rtFellBack: true },
  ]);

  const paired = pairedCost([declared], [honest]);
  assert.equal(paired.headroomS, 40, "headroom on the journey the cost was measured on");
  assert.equal(paired.costS, 20);
  assert.equal(paired.costS / paired.headroomS, 0.5);
});

test("seeds are paired, and each seed matches its own population", () => {
  // The whole-score figure already pairs by seed so the day cancels out of the
  // difference. The population has to be matched *within* each seed for the
  // same reason: which journeys survive is a property of the day as well as of
  // the conflicts.
  const honest = [
    calibrationOf([
      { queryId: "a", p0a: 100, p2rt: 100 },
      { queryId: "b", p0a: 100, p2rt: 100 },
    ]),
    calibrationOf([
      { queryId: "a", p0a: 100, p2rt: 100 },
      { queryId: "b", p0a: 100, p2rt: 100 },
    ]),
  ];
  const declared = [
    // seed 1: only "a" survives, and it costs 60
    calibrationOf([
      { queryId: "a", p0a: 100, p2rt: 160 },
      { queryId: "b", p0a: 100, p2rt: 999, p2rtFellBack: true },
    ]),
    // seed 2: only "b" survives, and it costs 20
    calibrationOf([
      { queryId: "a", p0a: 100, p2rt: 999, p2rtFellBack: true },
      { queryId: "b", p0a: 100, p2rt: 120 },
    ]),
  ];

  const paired = pairedCost(declared, honest);
  assert.equal(paired.matched, 1, "one journey survived per seed");
  assert.equal(paired.costS, 40, "the mean of 60 and 20, each on its own seed's population");
});
