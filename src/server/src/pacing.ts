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
  /** The mode now. It may change during a run (P2M8); the header records the one it began in. */
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
   * is being issued. In `virtual` this moves the clock, and is late only after
   * a switch from a wall-driven mode left τ ahead of the queue. In the
   * wall-driven modes it sleeps until τ reaches `target`, or returns at once
   * with the lag if a slow handler has already carried τ past it.
   *
   * `interrupted`, polled while sleeping, lets a pause or a change of speed
   * land without waiting out the sleep: the wait returns `null` and the caller
   * waits again once the change is made.
   */
  waitFor(target: number, interrupted?: () => boolean): Promise<number | null>;
  /**
   * How long a request may run, in wall milliseconds. `virtual` allows the
   * guard, because response speed cannot touch the world there. The wall-driven
   * modes allow the guard or the wall time left before τ passes the request's
   * simulated deadline, whichever is shorter: an answer later than its deadline
   * is not an answer, and the traveller acts without it (TIME-MODEL.md §4).
   */
  timeoutMs(deadline: number, guardMs: number): number;
  /**
   * Change mode or speed mid-run (P2M8), without τ jumping: whatever τ reads at
   * the moment of the change is where the new mode starts counting from.
   */
  retime(mode: TimeMode, speed: number | undefined): void;
  /** A manual pause: τ stands still, and the wall time it lasts is not counted. */
  hold(): void;
  release(): void;
  readonly held: boolean;
}

/** Wall milliseconds between `sleepMs` calls while waiting, so an interruption lands promptly. */
const WAIT_SLICE_MS = 100;

function factorFor(mode: TimeMode, speed: number | undefined): number {
  if (mode === "virtual") return 1;
  if (mode === "realtime" && speed !== undefined && speed !== 1) {
    throw new Error(
      `\`realtime\` runs at 1× by definition, not ${speed}×; ask for \`scaled\` to run at another speed (TIME-MODEL.md §2)`,
    );
  }
  const factor = mode === "realtime" ? 1 : (speed ?? Number.NaN);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new Error(`\`scaled\` needs a positive speed, got ${String(speed)} (TIME-MODEL.md §2)`);
  }
  return factor;
}

export function makePacer(
  initialMode: TimeMode,
  clock: Clock,
  initialSpeed: number | undefined,
  timer: WallTimer,
): Pacer {
  let mode = initialMode;
  let factor = factorFor(mode, initialSpeed);
  // Wall-driven state: τ = startTau + (wall since anchor) × factor.
  let startTau = clock.now();
  let anchorMs: number | null = null;
  let started = false;
  let heldAt: { tau: number; ms: number } | null = null;

  const elapsedMs = (): number => (anchorMs === null ? 0 : timer.nowMs() - anchorMs);
  const wallTau = (): number => startTau + Math.floor((elapsedMs() * factor) / 1000);
  const tau = (): number => {
    if (heldAt) return heldAt.tau;
    return mode === "virtual" ? clock.now() : wallTau();
  };
  /** Wall milliseconds after the anchor at which τ first reads `t`. */
  const wallMsAt = (t: number): number => ((t - startTau) * 1000) / factor;

  return {
    get mode() {
      return mode;
    },
    get speed() {
      return mode === "virtual" ? 1 : factor;
    },
    get pausesForHandlers() {
      return mode === "virtual";
    },
    get held() {
      return heldAt !== null;
    },
    start() {
      if (started) return;
      started = true;
      if (mode !== "virtual") {
        startTau = clock.now();
        anchorMs = timer.nowMs();
      }
    },
    tau,
    async waitFor(target, interrupted) {
      if (mode === "virtual") {
        const now = clock.now();
        if (target >= now) {
          clock.advanceTo(target);
          return 0;
        }
        return now - target;
      }
      if (!started) throw new Error("the pacer has not started: call start() when the run begins");
      for (;;) {
        if (interrupted?.()) return null;
        const now = wallTau();
        if (now >= target) {
          clock.advanceTo(target);
          return now - target;
        }
        const remaining = Math.max(1, Math.ceil(wallMsAt(target) - elapsedMs()));
        await timer.sleepMs(interrupted ? Math.min(remaining, WAIT_SLICE_MS) : remaining);
      }
    },
    timeoutMs(deadline, guardMs) {
      if (mode === "virtual") return guardMs;
      // `deadline` is the last simulated second an answer still counts in, so
      // the budget runs until τ would read the second after it.
      return Math.max(0, Math.min(guardMs, wallMsAt(deadline + 1) - elapsedMs()));
    },
    retime(nextMode, nextSpeed) {
      const nextFactor = factorFor(nextMode, nextSpeed);
      const now = tau();
      mode = nextMode;
      factor = nextFactor;
      if (nextMode === "virtual") {
        // The clock only moves at events; bring it to where wall time had got.
        if (now > clock.now()) clock.advanceTo(now);
        anchorMs = null;
      } else {
        startTau = Math.max(now, clock.now());
        anchorMs = started ? timer.nowMs() : null;
      }
      if (heldAt) heldAt = { tau: tau(), ms: heldAt.ms };
    },
    hold() {
      if (heldAt) return;
      heldAt = { tau: tau(), ms: timer.nowMs() };
    },
    release() {
      if (!heldAt) return;
      const pausedMs = timer.nowMs() - heldAt.ms;
      if (mode !== "virtual" && anchorMs !== null) anchorMs += pausedMs;
      heldAt = null;
    },
  };
}
