// The scheduler that paces `realtime` and `scaled`, tested without waiting on
// the wall.
//
// Specification: TIME-MODEL.md §2, §2.3, §4.

import { test } from "node:test";
import assert from "node:assert/strict";

import { makeVirtualClock } from "@tns/core";
import type { RunRecord } from "@tns/schema";
import { makePacer, type WallTimer } from "../src/pacing.ts";
import { hashLog } from "../src/harness.ts";

/** A wall clock that only moves when the scheduler sleeps or a test says so. */
function fakeTimer(): WallTimer & { advance(ms: number): void; slept: number[] } {
  let now = 1_000_000;
  const slept: number[] = [];
  return {
    slept,
    nowMs: () => now,
    sleepMs: async (ms) => {
      slept.push(ms);
      now += ms;
    },
    advance(ms) {
      now += ms;
    },
  };
}

test("virtual jumps to each event, pauses for handlers and never waits on the wall", async () => {
  const timer = fakeTimer();
  const clock = makeVirtualClock(28_800);
  const pacer = makePacer("virtual", clock, undefined, timer);
  pacer.start();

  assert.equal(pacer.pausesForHandlers, true);
  assert.equal(await pacer.waitFor(30_000), 0);
  assert.equal(pacer.tau(), 30_000);
  assert.equal(clock.now(), 30_000);
  assert.deepEqual(timer.slept, [], "virtual slept on the wall clock");
  assert.equal(pacer.timeoutMs(30_020, 30_000), 30_000, "virtual must allow the whole guard");
});

test("realtime tracks the wall one to one and waits for each event", async () => {
  const timer = fakeTimer();
  const pacer = makePacer("realtime", makeVirtualClock(28_800), undefined, timer);
  pacer.start();

  assert.equal(pacer.pausesForHandlers, false);
  assert.equal(pacer.speed, 1);
  timer.advance(5_500);
  assert.equal(pacer.tau(), 28_805, "τ counts whole seconds of wall time");

  assert.equal(await pacer.waitFor(28_860), 0, "an event reached by waiting is on time");
  assert.equal(pacer.tau(), 28_860);
});

test("scaled runs at its speed", async () => {
  const timer = fakeTimer();
  const pacer = makePacer("scaled", makeVirtualClock(0), 60, timer);
  pacer.start();

  timer.advance(1_000);
  assert.equal(pacer.tau(), 60);
  await pacer.waitFor(600);
  assert.equal(pacer.tau(), 600);
  assert.ok(timer.slept.reduce((a, b) => a + b, 0) <= 9_001, "slept far longer than 540 s at 60× needs");
});

test("an event a slow handler has already passed is issued at once, with its lag", async () => {
  const timer = fakeTimer();
  const pacer = makePacer("realtime", makeVirtualClock(0), undefined, timer);
  pacer.start();

  timer.advance(100_000);
  assert.equal(await pacer.waitFor(40), 60);
  assert.deepEqual(timer.slept, [], "waited for an event that was already due");
});

test("a request's wall budget is its guard or its simulated deadline, whichever comes first", () => {
  const timer = fakeTimer();
  const realtime = makePacer("realtime", makeVirtualClock(0), undefined, timer);
  realtime.start();
  // Answers still count at τ = 20; the budget runs out as τ reaches 21.
  assert.equal(realtime.timeoutMs(20, 30_000), 21_000);
  assert.equal(realtime.timeoutMs(100, 30_000), 30_000, "the guard still caps a distant deadline");

  const scaled = makePacer("scaled", makeVirtualClock(0), 60, timer);
  scaled.start();
  assert.equal(Math.round(scaled.timeoutMs(20, 30_000)), 350, "20 simulated seconds at 60× is 350 ms");

  timer.advance(60_000);
  assert.equal(realtime.timeoutMs(20, 30_000), 0, "a deadline already passed leaves no budget");
});

test("realtime refuses another speed, scaled requires one, and neither runs before it starts", async () => {
  assert.throws(() => makePacer("realtime", makeVirtualClock(0), 60, fakeTimer()), /1×/);
  assert.throws(() => makePacer("scaled", makeVirtualClock(0), undefined, fakeTimer()), /positive speed/);
  assert.throws(() => makePacer("scaled", makeVirtualClock(0), 0, fakeTimer()), /positive speed/);

  const unstarted = makePacer("realtime", makeVirtualClock(0), undefined, fakeTimer());
  await assert.rejects(unstarted.waitFor(10), /not started/);
});

test("the golden hash ignores a record's lag, as it ignores its latency", () => {
  const base: RunRecord = {
    kind: "obligation",
    obligation: "plan",
    requestId: "req-g001",
    travellerRef: "trv-g001",
    issuedAt: 28_800,
    deadline: 28_820,
    outcome: "ok",
    latencyMs: 3,
    itinerary: null,
  };
  // A lag is wall-derived, so two runs differing only in it decided the same things.
  assert.equal(hashLog([base]), hashLog([{ ...base, lagS: 7 }]));
  assert.equal(hashLog([base]), hashLog([{ ...base, latencyMs: 90 }]));
  // And a real difference still shows.
  assert.notEqual(hashLog([base]), hashLog([{ ...base, outcome: "declined" }]));
});
