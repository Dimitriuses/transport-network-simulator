import { test } from "node:test";
import assert from "node:assert/strict";

import { EventQueue, makeRng, makeVirtualClock } from "../src/index.ts";

test("the event queue pops in (tau, insertion) order", () => {
  const q = new EventQueue<string>();
  q.push(30, "c");
  q.push(10, "a");
  q.push(20, "b1");
  q.push(20, "b2");
  q.push(10, "a2");

  const seen: string[] = [];
  for (;;) {
    const e = q.pop();
    if (!e) break;
    seen.push(e.payload);
  }

  // Equal timestamps resolve by insertion sequence, never by heap accident.
  // Without this, event order at equal τ is an implementation detail and
  // reproducibility is gone.
  assert.deepEqual(seen, ["a", "a2", "b1", "b2", "c"]);
});

test("the seeded PRNG reproduces exactly from its seed", () => {
  const a = makeRng(481516);
  const b = makeRng(481516);
  const c = makeRng(481517);

  const first = Array.from({ length: 8 }, () => a());
  const second = Array.from({ length: 8 }, () => b());
  const other = Array.from({ length: 8 }, () => c());

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, other);
});

test("the virtual clock is monotonic and refuses to go backwards", () => {
  const clock = makeVirtualClock(1000);
  assert.equal(clock.now(), 1000);

  clock.advanceTo(1500);
  assert.equal(clock.now(), 1500);

  assert.throws(() => clock.advanceTo(1400), /may not go backwards/);
});

test("a paused clock does not advance", () => {
  const clock = makeVirtualClock(100);
  clock.pause();
  clock.advanceTo(500);

  // The pause is what makes a run independent of machine speed. It is safe
  // only because operator responses are pure functions of τ, so a player
  // gains nothing by polling while it holds (TIME-MODEL.md §3).
  assert.equal(clock.now(), 100);
  assert.equal(clock.paused, true);

  clock.resume();
  clock.advanceTo(500);
  assert.equal(clock.now(), 500);
});
