// One world's answer key, and the player that memorises it.
//
// Specification: PHASES.md §284, ROADMAP.md P1M4, KNOWN-ISSUES.md #24.
//
// **A deliberately overfitted reference solution, and it exists to fail.**
//
// The Phase 1 exit asks for *"non-memorisable tasks of equal difficulty — and
// it is not satisfied by matching conflict lists alone"*. The half usually
// quoted is "a solution built for one world performs comparably on the other",
// and on its own that half is satisfiable by cheating: make two worlds nearly
// identical and anything transfers. The other half needs a solution that
// **should not** transfer, and every reference we had generalises — `competent`
// infers each operator's displacement and detects its time encoding from a
// sample, so it does not care which world it is given.
//
// This one does care. It is `competent` with its two inferences replaced by a
// table baked from one specific world:
//
//   * each operator's systematic geometry displacement, instead of estimating
//     it against a reference operator;
//   * each operator's time encoding, instead of detecting it from a sample.
//
// On the world it was tuned for it is at least as good as `competent`, because
// its answers are exact rather than estimated. On another world of the same rung
// it finds the same roles — the key files each operator's answers by its kind and
// rank, not by the id the seed renames (`@tns/schema` operatorKeys) — and applies
// the home world's answers to them: a confident correction to the wrong data,
// which is what memorisation looks like when the exam changes.
//
// **Filed by operator id until 2026-09-11, and that made it measure nothing**
// (`KNOWN-ISSUES.md` #59). Since P1M6 no two worlds of a rung share an operator
// id, so on any genuinely different world the key resolved against nothing, this
// read no feed at all and scored like `null`, and `npm run transfer` certified
// two worlds identical except for their operators' names as non-memorisable.
//
// **The two-sided test:**
//
//   `competent` transfers          -> the worlds are equally hard
//   `tuned` collapses              -> the worlds are non-memorisable
//   `tuned` *also* transfers       -> the worlds are too alike, and the
//                                     generator's variety is not doing its job
//
// The third row is the one worth having. It is the only thing that would catch
// a calibration search over-converging, now that `npm run calibrate:tier`
// selects draws near a median.
//
// **This is not `cheat`.** `cheat` opens the bundle and plans with the oracle's
// knowledge of the day, which no contract permits; it exists so the
// information-set audit has a known leak to catch. `tuned` knows nothing about
// the day that any player could not know. It knows about *this world's
// conflicts*, which is not cheating — it is study.

import { readFileSync } from "node:fs";

/** What one operator publishes, as memorised from a particular world. */
export interface OperatorTuning {
  /** Systematic latitude displacement of published positions, in degrees. */
  readonly dLat: number;
  readonly dLon: number;
  /** The encoding this operator used, in the world this was baked from. */
  readonly encoding: "iso_offset" | "local_naive" | "epoch_s" | "epoch_ms";
  /**
   * The word this operator used for a cancellation, and the unit it used for a
   * delay.
   *
   * **Added at P2M0, because a key that holds two things can only test two
   * things** (`KNOWN-ISSUES.md` #48). At Tier 3 geometry and time carry most of
   * what a solver must work out, so a key holding those collapsed convincingly
   * when it was carried to another world. At Tier 5 they do not: two calibrated
   * Tier-5 worlds differed in section B and the memorised decoder was *right on
   * both anyway*, because `local_naive` and an `iso_offset` feed claiming the
   * wrong zone decode identically for any reader that ignores the claim — which
   * is what a correct reader does.
   *
   * These two are inferred by `competent` from the feed (a vocabulary, and a
   * magnitude), so baking them is memorisation in exactly the sense the fixture
   * means, and they are where a Tier-5 world keeps its difficulty.
   */
  readonly cancelledToken?: string;
  readonly delayUnit?: "seconds" | "minutes";
}

export interface Tuning {
  /** The world this key was taken from, so a mismatch is legible in a report. */
  readonly world: string;
  /** Filed by `operatorKeys` — `Kind#rank` — and never by operator id. */
  readonly operators: Readonly<Record<string, OperatorTuning>>;
}

export function readTuning(path: string): Tuning {
  return JSON.parse(readFileSync(path, "utf8")) as Tuning;
}

/**
 * Read a realtime feed with a memorised vocabulary instead of an inferred one.
 *
 * `competent` recognises the states that mean *running* and treats everything
 * else as trouble, and works the delay unit out from magnitude. This does
 * neither: it matches one remembered word and applies one remembered unit.
 *
 * On the world it was baked from that is exact. On another it is a solution
 * looking for `cancelled` in a feed that says `3`, finding nothing, and
 * concluding that every service is running — **deliberately unguarded, for the
 * reason the module comment gives: a fallback would defeat the fixture.**
 */
export function tunedRealtimeReader(
  tuning: OperatorTuning,
): (
  operator: string,
  updates: readonly { trip_id: string; status: string; delay?: number }[],
  previouslySeen: ReadonlySet<string>,
) => { cancelled: Set<string>; delayed: Map<string, number> } {
  const token = tuning.cancelledToken ?? "cancelled";
  const unit = tuning.delayUnit ?? "seconds";
  return (operator, updates, previouslySeen) => {
    const cancelled = new Set<string>();
    const delayed = new Map<string, number>();
    const present = new Set<string>();

    for (const u of updates) {
      const key = `${operator}:${u.trip_id}`;
      present.add(key);
      if (u.status === token) {
        cancelled.add(key);
        continue;
      }
      if (u.status === "delayed") {
        const seconds = unit === "minutes" ? (u.delay ?? 0) * 60 : (u.delay ?? 0);
        if (seconds > 0) delayed.set(key, seconds);
      }
    }

    // A trip that has vanished has still gone: this much is not memorised,
    // because it is not something the answer key could hold.
    for (const key of previouslySeen) {
      if (key.startsWith(`${operator}:`) && !present.has(key)) cancelled.add(key);
    }

    return { cancelled, delayed };
  };
}

/**
 * A decoder built from a memorised encoding rather than from a sample.
 *
 * Deliberately unguarded: when the memorised encoding does not match what the
 * feed actually publishes, this returns `NaN` rather than falling back to
 * detection. **A fallback would defeat the fixture** — a solution that notices
 * its answer key is wrong and re-derives is a generalising solution, which is
 * the one we already have.
 */
export function tunedDecoder(
  tuning: OperatorTuning,
  worldOffsetS: number,
): (v: string | number) => number {
  const { encoding } = tuning;
  return (v) => {
    if (encoding === "epoch_s" || encoding === "epoch_ms") {
      if (typeof v !== "number") return Number.NaN;
      const seconds = encoding === "epoch_ms" ? Math.round(v / 1000) : v;
      return seconds + worldOffsetS;
    }
    if (typeof v !== "string") return Number.NaN;
    const d = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(v);
    if (!d) return Number.NaN;
    const local =
      (Number(d[3]) - 7) * 86400 + Number(d[4]) * 3600 + Number(d[5]) * 60 + Number(d[6]);
    if (encoding === "local_naive") return local;
    const m = /([+-])(\d{2}):(\d{2})$/.exec(v);
    if (!m) return Number.NaN;
    const offset = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
    return local - (offset - worldOffsetS);
  };
}
