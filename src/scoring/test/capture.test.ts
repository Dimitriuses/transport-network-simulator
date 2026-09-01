// The capture scale, at its defining points.
//
// Specification: SCORING.md §2.
//
//     capture = ( m(P1) − m(player) ) / ( m(P1) − m(P0) )

import { test } from "node:test";
import assert from "node:assert/strict";

import type { RunRecord, TravellerOutcome } from "@tns/schema";
import { score } from "../src/index.ts";

const header: RunRecord = {
  kind: "run_header",
  runId: "t",
  worldSeed: 1,
  engineVersion: "0",
  scorerVersion: "0",
  contractVersion: "0.3",
  timeMode: "virtual",
  latencyMode: "none",
  referenceCompetence: "timetable",
  hardwareProfile: null,
};

function traveller(journeyS: number, oracle: number, reference: number): TravellerOutcome {
  return {
    kind: "traveller",
    travellerRef: `trv-${journeyS}`,
    queryId: `q-${journeyS}`,
    departAfter: 0,
    arrived: true,
    journeyS,
    waitS: 0,
    transfers: 0,
    failureReason: null,
    forgone: false,
    oracleJourneyS: oracle,
    referenceJourneyS: reference,
  };
}

const scoreOf = (...ts: TravellerOutcome[]) => score([header, ...ts]);

test("matching the oracle captures all of the headroom", () => {
  const card = scoreOf(traveller(600, 600, 900), traveller(1200, 1200, 1500));
  assert.equal(card.capture, 1);
});

test("matching the reference policy captures none of it", () => {
  // This is what a player that answers nothing scores: its travellers fall
  // back to P1, so it lands exactly on the zero point (REFERENCE-POLICY.md §8).
  const card = scoreOf(traveller(900, 600, 900), traveller(1500, 1200, 1500));
  assert.equal(card.capture, 0);
});

test("being worse than no integration at all scores negative", () => {
  const card = scoreOf(traveller(1200, 600, 900));
  assert.equal(card.capture, -1);
});

test("landing halfway captures half", () => {
  const card = scoreOf(traveller(750, 600, 900));
  assert.equal(card.capture, 0.5);
});

test("beating the oracle is flagged, not scored", () => {
  // Impossible by construction. The per-traveller check fires regardless of
  // whether headroom exists to form the ratio (SCORING.md §11).
  const card = scoreOf(traveller(300, 600, 900));
  assert.equal(card.impossibleTravellers.length, 1);
  assert.match(card.impossibleTravellers[0]!, /300s < oracle 600s/);
});

test("with no headroom the scorer reports rather than dividing by zero", () => {
  const card = scoreOf(traveller(700, 600, 600));
  assert.equal(card.capture, null);
  assert.match(card.captureNote ?? "", /no headroom/);
});
