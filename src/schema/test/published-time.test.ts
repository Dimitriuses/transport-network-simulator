// Seconds or milliseconds, and the rule that must not be restated.
//
// Specification: CORECONCEPT.md §2.1 B, KNOWN-ISSUES.md #35.
//
// `B-time-encoding` offers `epoch_s` and `epoch_ms` and no field says which.
// Three separate consumers of a published feed each wrote "a number is epoch
// seconds", and all three were wrong the same way:
//
//   * `scoring/baselines.ts` — the lazy integration baseline. `P2` could not
//     board anything on the affected operator and gave up on 158 of 200
//     journeys; `P1 − P2` went negative.
//   * `refplayer/player.ts` — the naive player, which then took the result
//     modulo a day. `10800000 % 86400` is exactly 0, so this one did not fail
//     loudly; it produced plausible-looking wrong times.
//   * `refplayer/competent.ts` — the competent player, same statement again.
//
// The rule lives in one place now. These tests are about the rule; the tests
// that matter for the *consumers* are that none of them restates it, which is
// checked at the bottom.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { publishedEpochSeconds, MILLISECOND_CUTOFF_S } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

test("a plausible departure in seconds is left alone", () => {
  // A timetable spans days. Every one of these is a real departure offset.
  for (const s of [0, 3600, 21600, 86_399, 86_400, 7 * 86_400]) {
    assert.equal(publishedEpochSeconds(s), s, `${s} s was rewritten`);
  }
});

test("the same feed published in milliseconds decodes to the same seconds", () => {
  // The property that actually matters: the two encodings of one departure must
  // agree after decoding, because that is the whole claim being made.
  for (const s of [0, 3600, 21600, 86_399, 7 * 86_400]) {
    assert.equal(
      publishedEpochSeconds(s * 1000),
      s,
      `${s} s and ${s * 1000} ms decoded differently`,
    );
  }
});

test("the failure that started this decodes correctly", () => {
  // 10800000 ms is three hours. Read as seconds it is 125 days; taken modulo a
  // day, as the naive player does, it is exactly zero — midnight, and entirely
  // plausible. That is why nothing caught it.
  assert.equal(publishedEpochSeconds(10_800_000), 10_800);
  assert.notEqual(10_800_000 % 86_400, 10_800);
  assert.equal(10_800_000 % 86_400, 0, "the silent-failure arithmetic changed");
});

test("the cutoff sits far from any real value, on both sides", () => {
  // The gap between "too large for seconds" and "plausible as milliseconds" is
  // a factor of a thousand, so the threshold is not a tuned constant.
  const longestPlausibleFeedS = 30 * 24 * 3600;
  assert.ok(
    MILLISECOND_CUTOFF_S >= longestPlausibleFeedS,
    "the cutoff would rewrite a departure a real feed could publish in seconds",
  );
  // A one-second departure in milliseconds is 1000, far below the cutoff — so
  // very small millisecond values are indistinguishable and stay as seconds.
  // That is accepted: they are within a second of each other either way.
  assert.equal(publishedEpochSeconds(1000), 1000);
});

test("no consumer restates the rule", () => {
  // The point of #35 is not that one function was wrong; it is that three
  // independent copies of one rule will eventually disagree, and did. This
  // fails if a fourth appears.
  const files = [
    "src/scoring/src/baselines.ts",
    "src/refplayer/src/player.ts",
    "src/refplayer/src/competent.ts",
  ];
  for (const rel of files) {
    const source = readFileSync(join(repoRoot, rel), "utf8");
    assert.ok(
      source.includes("publishedEpochSeconds"),
      `${rel} decodes published times without the shared rule`,
    );
    // A local cutoff constant is the shape the duplication took last time.
    assert.ok(
      !/const\s+\w*MILLISECOND\w*\s*=/.test(source),
      `${rel} declares its own millisecond cutoff`,
    );
  }
});
