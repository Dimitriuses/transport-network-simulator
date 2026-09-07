// What a competent reader does with a feed that uses its own words.
//
// Specification: KNOWN-ISSUES.md #48, CORECONCEPT.md §2.1 B and C.
//
// Two conflicts were added to the strong end of the catalogue at P2M0, and a
// conflict with no answer makes a world unfair rather than hard
// (`PHASES.md` Gate 1a). These are the answers:
//
//   * a published offset that contradicts the brief is wrong, and the local
//     reading it carries is not;
//   * the word for "this service will not run" belongs to the operator, so
//     recognise the states that mean *running* and treat the rest as trouble.
//
// Both are stated as *discriminating* tests: the honest feed and the defective
// one must produce different answers, or the reader is not reading anything.

import { test } from "node:test";
import assert from "node:assert/strict";

import { detectTimeDecoder, readRealtime, type Timetable } from "../src/competent.ts";

const OFFSET = 3 * 3600;

/** A one-trip timetable whose single departure claims `offset`. */
const feedClaiming = (offset: string): Timetable =>
  ({
    operator: "op",
    stops: [],
    routes: [],
    trips: [
      {
        trip_id: "t",
        route_id: "r",
        heading: "x",
        stop_times: [
          {
            stop_id: "s",
            seq: 0,
            arrive: `2031-04-07T08:15:00${offset}`,
            depart: `2031-04-07T08:15:00${offset}`,
          },
        ],
      },
    ],
  }) as unknown as Timetable;

test("an offset that agrees with the brief is used", () => {
  const decode = detectTimeDecoder(feedClaiming("+03:00"), OFFSET);
  assert.equal(decode("2031-04-07T08:15:00+03:00"), 8 * 3600 + 15 * 60);
});

test("an offset that contradicts the brief is discarded, not applied", () => {
  // The city runs +03:00 and this feed says +02:00. Trusting it moves every
  // departure an hour, and the feed stays perfectly self-consistent while it
  // does — which is why the check is against another *published fact* rather
  // than against the data looking wrong.
  const decode = detectTimeDecoder(feedClaiming("+02:00"), OFFSET);
  assert.equal(
    decode("2031-04-07T08:15:00+02:00"),
    8 * 3600 + 15 * 60,
    "the local reading is the true one; the claim is the defect",
  );

  // And the case this must reject: believing the suffix.
  assert.notEqual(decode("2031-04-07T08:15:00+02:00"), 9 * 3600 + 15 * 60);
});

// --------------------------------------------------------------- vocabulary

const seen = new Set<string>();

test("a cancellation is recognised whatever it is called", () => {
  for (const token of ["cancelled", "CANCELLED", "C", "3"]) {
    const view = readRealtime("op", [{ trip_id: "t1", status: token }], seen);
    assert.ok(
      view.cancelled.has("op:t1"),
      `a trip published as ${JSON.stringify(token)} was read as running`,
    );
  }
});

test("a running service is not mistaken for a cancelled one", () => {
  // The other half, and the one that stops "treat everything unknown as
  // cancelled" from being a free pass: a reader that avoided every service
  // would satisfy the test above and be useless.
  const view = readRealtime(
    "op",
    [
      { trip_id: "fine", status: "on_time" },
      { trip_id: "late", status: "delayed", delay: 240 },
    ],
    seen,
  );
  assert.equal(view.cancelled.size, 0, "a running service was treated as cancelled");
  assert.equal(view.delayed.get("op:late"), 240);
});

test("a vanished trip is still a cancellation", () => {
  // The pre-existing rule, asserted here because the vocabulary change rewrote
  // the loop it lives in.
  const previously = new Set(["op:gone", "op:here"]);
  const view = readRealtime("op", [{ trip_id: "here", status: "on_time" }], previously);
  assert.ok(view.cancelled.has("op:gone"));
  assert.ok(!view.cancelled.has("op:here"));
});
