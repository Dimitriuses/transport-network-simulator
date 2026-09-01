import { test } from "node:test";
import assert from "node:assert/strict";

import { parseEpoch, renderSimTime, parseSimTime } from "../src/index.ts";

const anchor = parseEpoch("2031-04-07T00:00:00+03:00");

test("tau renders as RFC 3339 with an explicit offset", () => {
  assert.equal(renderSimTime(anchor, 0), "2031-04-07T00:00:00+03:00");
  assert.equal(renderSimTime(anchor, 8 * 3600), "2031-04-07T08:00:00+03:00");
  assert.equal(renderSimTime(anchor, 8 * 3600 + 754), "2031-04-07T08:12:34+03:00");
});

test("a service day extending past midnight rolls the date", () => {
  // Internally this is just τ = 25h10m. There is no `25:10:00` anywhere in the
  // model — past-midnight service is a *rendering* concern, and rendering
  // happens exactly once, here (TIME-MODEL.md §8).
  assert.equal(renderSimTime(anchor, 25 * 3600 + 10 * 60), "2031-04-08T01:10:00+03:00");
});

test("rendering round-trips through parsing", () => {
  for (const tau of [0, 1, 59, 3600, 86399, 86400, 200_000, 1_000_000]) {
    assert.equal(parseSimTime(anchor, renderSimTime(anchor, tau)), tau);
  }
});

test("a player may legally answer in a different offset", () => {
  // 08:00 local (+03:00) is 05:00 UTC. Both denote the same instant, so both
  // must parse to the same tau.
  assert.equal(parseSimTime(anchor, "2031-04-07T05:00:00+00:00"), 8 * 3600);
});

test("the epoch must be midnight with an explicit offset", () => {
  assert.throws(() => parseEpoch("2031-04-07T06:00:00+03:00"), /midnight/);
  assert.throws(() => parseEpoch("2031-04-07T00:00:00"), /explicit offset/);
});
