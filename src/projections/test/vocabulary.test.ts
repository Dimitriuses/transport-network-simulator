// The two conflicts that widened the catalogue at its strong end.
//
// Specification: KNOWN-ISSUES.md #48, CORECONCEPT.md §2.1 B and C.
//
// Tier 5 asked for one setting from section B, which held one, and two from
// section C, whose third is almost always excluded — so the top of the ladder
// drew the same conflicts every time and a memorised answer key transferred
// between two worlds of it. `B-dst-offset` and `C-cancellation-token` are the
// choices that rung did not have.
//
// **Each test names the case it must reject**, because both settings are the
// kind that look present from the manifest and can be absent from the feed.

import { test } from "node:test";
import assert from "node:assert/strict";

import { publishedTime } from "../src/index.ts";

const ISO = "2031-04-07T08:15:00+03:00";

test("a shifted offset moves the claim and not the clock", () => {
  // The whole conflict in one assertion: a passenger reading the platform
  // display is told the truth, and a consumer converting to an instant is not.
  const shifted = publishedTime("iso_offset", ISO, 0, -3600);
  assert.equal(shifted, "2031-04-07T08:15:00+02:00");
  assert.equal(String(shifted).slice(0, 19), ISO.slice(0, 19), "the local reading moved");
});

test("it shifts in both directions, and formats the way a feed would", () => {
  assert.equal(publishedTime("iso_offset", ISO, 0, 3600), "2031-04-07T08:15:00+04:00");
  // Half-hour zones exist, so the minutes field has to be real arithmetic
  // rather than a whole number of hours pasted in.
  assert.equal(publishedTime("iso_offset", ISO, 0, -1800), "2031-04-07T08:15:00+02:30");
});

test("an encoding with no offset has none to be wrong about", () => {
  // The catalogue makes these mutually exclusive; this is what would happen if
  // that ever stopped being true, and it must be "nothing".
  assert.equal(publishedTime("epoch_s", ISO, 1234, -3600), 1234);
  assert.equal(publishedTime("local_naive", ISO, 0, -3600), "2031-04-07T08:15:00");
  assert.equal(publishedTime("iso_offset", ISO, 0, 0), ISO, "an unshifted feed must be untouched");
});
