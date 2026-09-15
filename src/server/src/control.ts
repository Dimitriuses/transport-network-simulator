// Driving a run from outside it: pause, resume, a change of speed, stop.
//
// Specification: TIME-MODEL.md §3 (two kinds of pause), §2.3; PLAYER-CONTRACT.md
// §6.2, §6.4; ROADMAP.md P2M8.
//
// **Every change lands at a boundary** — between one obligation and the next,
// never inside a handler (decided 2026-09-15). A request already with the
// player finishes as it would have, its operator calls served from the frozen
// snapshot as any handler's are; then the world stops. So no guard timer ever
// runs through a manual pause, and a pause cannot turn an answer into a timeout.
//
// While the world is manually paused, operator calls **queue**, FIFO, and are
// served against the world as it stands after resume; past `pauseQueueDepth`
// waiting calls, a call is refused with `503`. `/v1/clock` never queues.

export type TimeModeName = "virtual" | "realtime" | "scaled";

export type ControlRequest =
  | { readonly action: "pause" }
  | { readonly action: "resume" }
  | { readonly action: "retime"; readonly timeMode: TimeModeName; readonly speed?: number }
  | { readonly action: "stop" };

/** The contract's default: how many operator calls may wait out one pause (PLAYER-CONTRACT.md §6.4). */
export const PAUSE_QUEUE_DEPTH = 256;

export class RunControl {
  readonly pauseQueueDepth: number;
  #pending: ControlRequest[] = [];
  #paused = false;
  #stopped = false;
  #queued = 0;
  #resumed: (() => void)[] = [];
  #requested: (() => void)[] = [];

  constructor(pauseQueueDepth = PAUSE_QUEUE_DEPTH) {
    this.pauseQueueDepth = pauseQueueDepth;
  }

  /** Ask for a change. It lands at the run's next boundary. */
  request(r: ControlRequest): void {
    if (this.#stopped) return;
    this.#pending.push(r);
    for (const wake of this.#requested.splice(0)) wake();
  }

  /** Whether a change is waiting for a boundary — polled by the pacer while it sleeps. */
  get pending(): boolean {
    return this.#pending.length > 0;
  }

  get paused(): boolean {
    return this.#paused;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  /** Operator calls waiting out the pause right now. */
  get queued(): number {
    return this.#queued;
  }

  /**
   * The run is at a boundary: apply what was asked, in order, and if that
   * leaves the world paused, wait here until it is resumed or stopped.
   * `apply` is told each change that actually changes something.
   */
  async boundary(apply: (r: ControlRequest) => void): Promise<"continue" | "stop"> {
    for (;;) {
      while (this.#pending.length > 0) {
        const r = this.#pending.shift()!;
        if (r.action === "pause") {
          if (this.#paused) continue;
          this.#paused = true;
          apply(r);
        } else if (r.action === "resume") {
          if (!this.#paused) continue;
          this.#paused = false;
          apply(r);
          for (const wake of this.#resumed.splice(0)) wake();
        } else if (r.action === "retime") {
          apply(r);
        } else {
          this.#stopped = true;
          this.#paused = false;
          apply(r);
          for (const wake of this.#resumed.splice(0)) wake();
          return "stop";
        }
      }
      if (!this.#paused) return "continue";
      await new Promise<void>((wake) => this.#requested.push(wake));
    }
  }

  /**
   * An operator call arrives. Served at once unless the world is manually
   * paused; then it waits, in arrival order, and is refused when the queue is
   * full. `false` means refuse with `503`.
   */
  async admit(): Promise<boolean> {
    if (!this.#paused) return true;
    if (this.#queued >= this.pauseQueueDepth) return false;
    this.#queued++;
    await new Promise<void>((wake) => this.#resumed.push(wake));
    this.#queued--;
    return true;
  }
}
