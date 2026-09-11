// A memorised answer key that is wrong must produce a worse plan, not a hang.
//
// Specification: KNOWN-ISSUES.md #45, PHASES.md §284.
//
// `tuned` decodes every timestamp with an encoding baked from one world. Taken
// to another world where that operator publishes differently, every decode
// returns NaN — which is deliberate: a solution that noticed its key was wrong
// and re-derived would be a generalising solution, and we already have one.
//
// What was not deliberate is what NaN did to the planner. NaN fails every
// comparison, so `existing.arriveS <= arriveS` was false however many times a
// label was revisited; the label set stopped being a tree, the predecessor
// chain gained a cycle, and reconstruction walked it forever. One player burned
// 21 minutes of CPU and 1.5 GB before it was killed, and the transfer run it
// was part of never produced a verdict.
//
// **The test is that the two keys give different answers**, not that either
// terminates — a termination-only assertion passes on a planner that returns
// null for everything.

import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCompetentModel, planCompetently } from "../src/competent-model.ts";
import type { Tuning } from "../src/index.ts";

const OFFSET = 3 * 3600;

/** Three stops on a line, one trip calling at all three, published local-naive. */
const timetable = {
  operator: "nordline",
  operator_name: "Nordline Transit",
  stops: [
    { stop_id: "a", stop_name: "A", lat: 50.45, lon: 30.52 },
    { stop_id: "b", stop_name: "B", lat: 50.45, lon: 30.53 },
    { stop_id: "c", stop_name: "C", lat: 50.45, lon: 30.54 },
  ],
  routes: [{ route_id: "r1", route_name: "R1" }],
  trips: [
    {
      trip_id: "t1",
      route_id: "r1",
      heading: "C",
      stop_times: [
        { stop_id: "a", seq: 0, arrive: "2031-04-07T07:10:00", depart: "2031-04-07T07:10:00" },
        { stop_id: "b", seq: 1, arrive: "2031-04-07T07:20:00", depart: "2031-04-07T07:20:00" },
        { stop_id: "c", seq: 2, arrive: "2031-04-07T07:30:00", depart: "2031-04-07T07:30:00" },
      ],
    },
  ],
};

const key = (encoding: Tuning["operators"][string]["encoding"]): Tuning => ({
  world: "test",
  operators: { "Transit#0": { dLat: 0, dLon: 0, encoding } },
});

const planAtoC = (tuning?: Tuning): { legs: unknown[] } | null =>
  planCompetently(
    buildCompetentModel([timetable], OFFSET, tuning),
    { lat: 50.45, lon: 30.52 },
    { lat: 50.45, lon: 30.54 },
    7 * 3600,
  );

test("a key finds its operator under another name", () => {
  // `KNOWN-ISSUES.md` #59. Filed by id, a renamed operator was one the answer
  // key had never heard of: `tuned` skipped its feed and planned nothing, on a
  // world where the right answer was in the key all along. Filed by kind and
  // rank it finds the operator whatever the seed called it.
  const renamed = { ...timetable, operator: "verbovaline", operator_name: "Verbovaline Transit" };
  const plan = planCompetently(
    buildCompetentModel([renamed], OFFSET, key("local_naive")),
    { lat: 50.45, lon: 30.52 },
    { lat: 50.45, lon: 30.54 },
    7 * 3600,
  );
  assert.ok(plan, "the same kind and service under a new name must still resolve");
  assert.equal(plan.legs.length, 1);
});

test("the right key plans the journey", () => {
  const right = planAtoC(key("local_naive"));
  assert.ok(right, "a key that matches the feed should plan exactly as inference does");
  assert.equal(right.legs.length, 1);
});

test("a key from another world plans nothing, and returns", () => {
  // Undecodable, so unboardable. The distinction that matters is between this
  // and the right key above: if both answered the same the fixture would be
  // measuring nothing.
  assert.equal(planAtoC(key("epoch_ms")), null);
});

test("inference and a matching key agree", () => {
  const inferred = planAtoC();
  const memorised = planAtoC(key("local_naive"));
  assert.deepEqual(inferred, memorised);
});
