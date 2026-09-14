// Pacing: when the harness may issue the next event, and what τ the world reads
// in the meantime.
//
// Specification: TIME-MODEL.md §1, §2, §2.3, §4; PLAYER-CONTRACT.md §9.
//
// **Wall time decides *when* τ advances, and never *what* happens.** That is
// the whole of the rule, and this module is the only place in the harness that
// reads a wall clock to move τ. In `virtual` it reads none: τ jumps from event
// to event and stops while the player answers. In `realtime` and `scaled` τ is
// wall time since the run began, multiplied by a speed, and nothing downstream
// can tell how it was obtained — which is what keeps a second and third mode
// from weakening the first.
//
// One scheduler serves both wall-driven modes, because `realtime` is `scaled` at
// 1×. The timer is injected so the scheduler can be tested without waiting on
// the wall.

import type { Clock, TimeMode } from "@tns/core";

export interface WallTimer {
  /** Milliseconds from an arbitrary origin. Must never go backwards. */
  nowMs(): number;
  sleepMs(ms: number): Promise<void>;
}

/** `performance.now()`, not `Date.now()`: a system clock adjustment must not move τ backwards. */
export const systemTimer: WallTimer = {
  nowMs: () => performance.now(),
  sleepMs: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface Pacer {
  readonly mode: TimeMode;
  /** Simulated seconds per wall second. Reported as 1 in `virtual`, where it means nothing. */
  readonly speed: number;
  /**
   * Whether the clock stops while a handler runs. `virtual` only: it is what
   * makes `virtual` machine-independent, and it is safe only because operator
   * responses are pure functions of τ (TIME-MODEL.md §3).
   */
  readonly pausesForHandlers: boolean;
  /** Begin counting wall time. Until then τ stands at the first event. */
  start(): void;
  /** The τ the world reads now — the operator and control APIs read this. */
  tau(): number;
  /**
   * Bring τ to `target` and report how many simulated seconds late the event
   * is being issued. In `virtual` this moves the clock and is never late. In
   * the wall-driven modes it sleeps until τ reaches `target`, or returns at
   * once with the lag if a slow handler has already carried τ past it.
   */
  waitFor(target: number): Promise<number>;
  /**
   * How long a request may run, in wall milliseconds. `virtual` allows the
   * guard, because response speed cannot touch the world there. The wall-driven
   * modes allow the guard or the wall time left before τ passes the request's
   * simulated deadline, whichever is shorter: an answer later than its deadline
   * is not an answer, and the traveller acts without it (TIME-MODEL.md §4).
   */
  timeoutMs(deadline: number, guardMs: number): number;
}

export function makePacer(
  mode: TimeMode,
  clock: Clock,
  speed: number | undefined,
  timer: WallTimer,
): Pacer {
  if (mode === "virtual") {
    return {
      mode,
      speed: 1,
      pausesForHandlers: true,
      start() {},
      tau: () => clock.now(),
      waitFor(target) {
        clock.advanceTo(target);
        return Promise.resolve(0);
      },
      timeoutMs: (_deadline, guardMs) => guardMs,
    };
  }

  if (mode === "realtime" && speed !== undefined && speed !== 1) {
    throw new Error(
      `\`realtime\` runs at 1× by definition, not ${speed}×; ask for \`scaled\` to run at another speed (TIME-MODEL.md §2)`,
    );
  }
  const factor = mode === "realtime" ? 1 : (speed ?? Number.NaN);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`\`scaled\` needs a positive speed, got ${String(speed)} (TIME-MODEL.md §2)`);
  }

  const startTau = clock.now();
  let anchorMs: number | null = null;
  const elapsedMs = (): number => (anchorMs === null ? 0 : timer.nowMs() - anchorMs);
  const tau = (): number => startTau + Math.floor((elapsedMs() * factor) / 1000);
  /** Wall milliseconds after the start at which τ first reads `t`. */
  const wallMsAt = (t: number): number => ((t - startTau) * 1000) / factor;

  return {
    mode,
    speed: factor,
    pausesForHandlers: false,
    start() {
      if (anchorMs === null) anchorMs = timer.nowMs();
    },
    tau,
    async waitFor(target) {
      if (anchorMs === null) {
        throw new Error("the pacer has not started: call start() when the run begins");
      }
      for (;;) {
        const now = tau();
        if (now >= target) {
          clock.advanceTo(target);
          return now - target;
        }
        await timer.sleepMs(Math.max(1, Math.ceil(wallMsAt(target) - elapsedMs())));
      }
    },
    timeoutMs(deadline, guardMs) {
      // `deadline` is the last simulated second an answer still counts in, so
      // the budget runs until τ would read the second after it.
      return Math.max(0, Math.min(guardMs, wallMsAt(deadline + 1) - elapsedMs()));
    },
  };
}
