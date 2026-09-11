// Is this world a rung, and if it is not, which way does it miss?
//
// Specification: PHASES.md Gate 1b and Gate 3, KNOWN-ISSUES.md #56, #57.
//
// **One place for the three bars and which side of each is a pass**, because
// two copies had already disagreed. `npm run gates` held Gate 1b's two ends and
// Gate 3's floor. `npm run wall`, written to screen the same verdict cheaply,
// held its own copy of two of them and left the third out — so a world where a
// lazy integrator captured 0.571, trivial by Gate 1b, was labelled a rung. And
// the copies did not agree on the one they shared: Gate 3 passed at `> 0.2` in
// the gates and at `>= 0.2` in the screen, opposite verdicts at exactly the
// ratified bar.
//
// `CLAUDE.md`: *two numbers that decide something together must live in one
// place.* Here there were three, in two places, compared by nothing.
//
// **A rung has to clear all three**, and a world can miss more than one way:
//
//   WALL   a lazy integrator loses more than integrating perfectly could win.
//   easy   a lazy integrator has already won — Gate 1b's other end.
//   thin   the declared conflicts cost under 20 % of the headroom — Gate 3.
//
// The gates decide Gate 1b before the ablation that measures Gate 3 has run, so
// the bars are exported one at a time as well as composed; either way the
// comparison is written once, here.
//
// Negative capture is not a miss. Phase 0's world ran its references at −0.232
// and passed; a world where lazy integration is mildly harmful is a good hard
// world.

/** Gate 1b, not trivial: a lazy integrator capturing this much has already won. */
export const LAZY_TRIVIAL_AT = 0.5;

/**
 * Gate 1b, not a wall. `capture` is `(P1 − player) / (P1 − P0a)`, so −1 is where
 * integrating lazily loses exactly as much as integrating perfectly would win.
 */
export const LAZY_LOSS_LIMIT = -1;

/** Gate 3, as ratified: the declared conflicts cost *at least* this share of the headroom. */
export const MATERIALITY_FLOOR = 0.2;

/** Gate 1b's upper end: a lazy integrator must not already win. */
export function isNotTrivial(lazyCapture: number): boolean {
  return lazyCapture < LAZY_TRIVIAL_AT;
}

/** Gate 1b's lower end: it must not lose more than the whole prize. */
export function isNotAWall(lazyCapture: number): boolean {
  return lazyCapture >= LAZY_LOSS_LIMIT;
}

/** Gate 3's floor, on the ratified side: at least 20 % of the headroom passes. */
export function isMaterial(conflictShare: number): boolean {
  return conflictShare >= MATERIALITY_FLOOR;
}

export interface RungVerdict {
  readonly notTrivial: boolean;
  readonly notAWall: boolean;
  readonly material: boolean;
  /** `rung`, `WALL`, `easy`, `thin`, `easy, thin`, or `n/a` for a rung with no semantic conflict. */
  readonly label: string;
}

export function rungVerdict(
  lazyCapture: number,
  conflictShare: number,
  carriesConflict: boolean,
): RungVerdict {
  const notTrivial = isNotTrivial(lazyCapture);
  const notAWall = isNotAWall(lazyCapture);
  const material = isMaterial(conflictShare);

  let label: string;
  if (!carriesConflict) {
    label = "n/a";
  } else if (!notAWall) {
    label = "WALL";
  } else {
    const misses = [...(notTrivial ? [] : ["easy"]), ...(material ? [] : ["thin"])];
    label = misses.length === 0 ? "rung" : misses.join(", ");
  }
  return { notTrivial, notAWall, material, label };
}
