// Boarding and alighting must decode a published time the same way.
//
// Specification: KNOWN-ISSUES.md #44, and #35 before it.
//
// The naive player built its boarding times with one expression and its
// arrival times with another. While every numeric feed published `epoch_s` the
// two agreed and nothing noticed. The moment one published `epoch_ms` they
// disagreed by three orders of magnitude, arrivals landed *before* the
// departures that produced them, and a label relaxation with negative edges
// does not terminate — the player hung outright on a generated world.
//
// These are about the property rather than the arithmetic: **the same value
// decodes to the same instant however it arrives, and a later stop on a trip is
// never earlier than the one before it.**

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseEpoch, parseSimTime } from "@tns/schema";

import { wallClockSeconds } from "../src/index.ts";

/** The committed world's offset: +03:00. */
const OFFSET = 3 * 3600;

test("seconds and milliseconds of the same instant decode alike", () => {
  // The property the two expressions violated. `epoch_ms` is `epoch_s` times a
  // thousand and describes the same moment; a player that reads one correctly
  // and the other three orders out is not reading a unit, it is guessing.
  for (const secs of [0, 3600, 21600, 45296, 79200]) {
    assert.equal(
      wallClockSeconds(secs * 1000, OFFSET),
      wallClockSeconds(secs, OFFSET),
      `${secs}s and ${secs * 1000}ms decoded differently`,
    );
  }
});

test("the offset is applied after the unit is known, not before", () => {
  // `toSeconds(v + offsetS)` adds a count of seconds to a count of
  // milliseconds. For 10_800_000 ms that is the difference between 10811 and
  // the correct answer, and it is where the negative edges came from.
  const ms = 10_800_000;
  assert.equal(wallClockSeconds(ms, OFFSET), (10_800 + OFFSET) % 86_400);
  assert.notEqual(wallClockSeconds(ms, OFFSET), 10_811);
});

test("a trip's stops stay in order after decoding", () => {
  // The invariant the search depends on. If a later stop decodes earlier than
  // an earlier one, the relaxation has a negative edge, the `prev` chain can
  // cycle, and the path reconstruction never ends.
  //
  // Checked across the encodings the catalogue offers for a numeric feed,
  // because the failure was *specific to one of them*.
  for (const scale of [1, 1000]) {
    let previous = Number.NEGATIVE_INFINITY;
    for (const secs of [21_600, 21_900, 22_500, 23_400, 25_200]) {
      const t = wallClockSeconds(secs * scale, 0);
      assert.ok(
        t > previous,
        `at scale ${scale}, ${secs}s decoded to ${t}, not after ${previous}`,
      );
      previous = t;
    }
  }
});

test("a string with no offset is read as UTC, as the scoring baseline reads it", () => {
  // The intended defect, decided 2026-09-11 (KNOWN-ISSUES.md #58): local time
  // published with no offset is read as UTC, which in this +03:00 world puts it
  // three hours late. This player used to read it as world-local, which is
  // correct, and was accidentally competent at local_naive while the baseline
  // paid for it. Held to the baseline rule rather than to a number alone.
  const epoch = parseEpoch("2031-04-07T00:00:00+03:00");
  const iso = "2031-04-07T06:00:00";
  const tau = parseSimTime(epoch, `${iso}+00:00`);
  assert.equal(wallClockSeconds(iso, OFFSET), ((tau % 86_400) + 86_400) % 86_400);
  assert.equal(wallClockSeconds(iso, OFFSET), 9 * 3600, "06:00 read as UTC is 09:00 here");
});

test("an honest offset leaves the reading where it was", () => {
  // The world's own offset, stated: nothing to believe differently, so a feed
  // that tells the truth decodes exactly as it did before offsets were read.
  assert.equal(wallClockSeconds("2031-04-07T08:15:00+03:00", OFFSET), 8 * 3600 + 15 * 60);
});

test("a stated offset is believed exactly as the scoring baseline believes it", () => {
  // **Two lazy readers, one rule** (`KNOWN-ISSUES.md` #58). `P2rt` decodes an
  // offset-bearing string with `parseSimTime`; this player used to take the
  // wall-clock reading and ignore the suffix, so `B-dst-offset` cost the one
  // 44.83m and the other nothing. Compared against the baseline's own function
  // rather than against a number, so the two cannot drift apart again.
  //
  // Before the fix every claim other than +03:00 fails here: the player returned
  // 08:15 whatever the suffix said.
  const epoch = parseEpoch("2031-04-07T00:00:00+03:00");
  for (const claimed of ["+03:00", "+02:00", "+04:00", "-01:00"]) {
    const iso = `2031-04-07T08:15:00${claimed}`;
    const tau = parseSimTime(epoch, iso);
    assert.equal(
      wallClockSeconds(iso, OFFSET),
      ((tau % 86_400) + 86_400) % 86_400,
      `a feed claiming ${claimed} decoded differently from the scoring baseline`,
    );
  }
});

test("decoding is stable across the day boundary", () => {
  // `% 86400` wraps, so a value past midnight comes back small. That is
  // correct for a within-day comparison and is the reason the search compares
  // times rather than instants — recorded here so a future change notices.
  assert.equal(wallClockSeconds(86_400, 0), 0);
  assert.equal(wallClockSeconds(86_400 + 60, 0), 60);
});
