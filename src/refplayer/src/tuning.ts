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
// its answers are exact rather than estimated. On any other world of the same
// tier the operator ids are the same and the answers are wrong, so it applies a
// confident correction to the wrong data — which is what memorisation looks
// like when the exam changes.
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
}

export interface Tuning {
  /** The world this key was taken from, so a mismatch is legible in a report. */
  readonly world: string;
  readonly operators: Readonly<Record<string, OperatorTuning>>;
}

export function readTuning(path: string): Tuning {
  return JSON.parse(readFileSync(path, "utf8")) as Tuning;
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
