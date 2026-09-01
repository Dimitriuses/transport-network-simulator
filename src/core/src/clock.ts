// The virtual clock.
//
// Specification: TIME-MODEL.md §1, §2, §8.
//
// Simulated time is the only clock that governs anything in the model. Wall
// time governs nothing in it: no quantity that affects a score may derive from
// it. Reading the wall clock is banned in this package by lint.
//
// τ is a monotonic integer count of seconds from the world epoch. Local time,
// offsets, DST and past-midnight service days are *rendering*, handled once at
// the contract boundary by @tns/schema's simtime module.

export type TimeMode = "virtual" | "realtime" | "scaled";

export interface Clock {
  /** Current simulated time, in seconds from the world epoch. */
  now(): number;
  /** Advance to `tau`. Never backwards — the clock is monotonic by contract. */
  advanceTo(tau: number): void;
  readonly mode: TimeMode;
  readonly paused: boolean;
  /**
   * Freeze the clock for the duration of an obligation handler.
   *
   * Safe only because operator responses are pure functions of τ: while paused,
   * repeated calls return identical bytes, so a player gains nothing by
   * polling inside a handler. Without that rule this pause would let a player
   * assemble a perfectly fresh, perfectly consistent snapshot of the whole
   * world for free, and catalogue §2.1 D would collapse (TIME-MODEL.md §3).
   */
  pause(): void;
  resume(): void;
}

export function makeVirtualClock(startTau: number): Clock {
  let tau = startTau;
  let paused = false;

  return {
    mode: "virtual",

    get paused() {
      return paused;
    },

    now() {
      return tau;
    },

    advanceTo(next: number) {
      if (next < tau) {
        throw new Error(
          `simulated time may not go backwards: ${tau} -> ${next}. ` +
            `τ is monotonic by construction (TIME-MODEL.md §8).`,
        );
      }
      if (paused) return;
      tau = next;
    },

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
    },
  };
}
