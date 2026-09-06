// What it takes to clear a tier, expressed in terms that survive a change of scale.
//
// Specification: SCORING.md, CORECONCEPT.md §7, ROADMAP.md P1M4.
//
// **A bar is a position between two named reference solutions, not a decimal.**
//
// The old `CLEARANCE` table held `{ 0: 0.0, 1: 0.1, 2: 0.25, ... }`, chosen
// while `capture` normalised against the clairvoyant `P0`. When the denominator
// moved to `P0a` on 2026-09-04 every score rescaled by about 2.6 and the table
// did not — so every tier silently became far harder to clear than the number
// had been chosen to mean. Nobody noticed, because a decimal cannot say what it
// intended.
//
// A bar of "must beat the lazy integrator" survives that. It survives a change
// of world size, of penalty, of profile weighting, and of denominator, because
// the anchors move with the scale. It also *states its intent*, which is the
// second reason to prefer it: "better than a lazy integrator" is a claim anyone
// can check, and `0.25` is a number nobody can argue with.
//
// **The bar therefore cannot be evaluated from one run.** It needs the
// reference solutions' scores *on that world*, which means running them — so
// clearance moved out of `scoreRun` and into `npm run clearance`. A scorecard
// reports what a solution achieved; deciding whether that clears a tier is a
// separate judgement needing separate evidence.

/** A tier's bar, as a position between two reference solutions. */
export interface ClearanceBar {
  readonly tier: number;
  /** The lower anchor: a reference solution's name. */
  readonly from: string;
  /** The upper anchor. */
  readonly to: string;
  /**
   * Where between them the bar sits. 0 is level with `from`, 1 with `to`.
   *
   * Values above 1 are deliberate and mean "past the best reference solution we
   * have" — the top of the ladder should be somewhere our own worked example
   * does not reach, or the ladder has no room above the answer key.
   */
  readonly at: number;
  /** What the bar is asking for, in words. */
  readonly because: string;
}

/**
 * The ladder (`CORECONCEPT.md` §7).
 *
 * The anchors are the four reference solutions `npm run gates` already runs:
 * `null` declines everything, `blind` ignores realtime, `naive` integrates
 * lazily, `competent` does the job. They are ordered and they move with any
 * change of scale, which is the whole point.
 */
export const CLEARANCE_LADDER: readonly ClearanceBar[] = [
  {
    tier: 0,
    from: "null",
    to: "blind",
    at: 0,
    because: "turn up — answer at all, rather than decline every obligation",
  },
  {
    tier: 1,
    from: "null",
    to: "blind",
    at: 1,
    because: "match a solution that reconciles nothing and ignores realtime",
  },
  {
    tier: 2,
    from: "blind",
    to: "naive",
    at: 1,
    because: "beat a lazy integrator: reconcile the feeds, however crudely",
  },
  {
    tier: 3,
    from: "naive",
    to: "competent",
    at: 0.5,
    because: "get halfway from a lazy integration to one that does the job",
  },
  {
    tier: 4,
    from: "naive",
    to: "competent",
    at: 1,
    because: "match a solution written by people who had seen the world",
  },
  {
    tier: 5,
    from: "naive",
    to: "competent",
    at: 1.25,
    because: "beat it — the top of the ladder must sit above our own answer key",
  },
];

/**
 * Does this headline clear that bar?
 *
 * **Strictly greater, and that matters at every rung.** Tier 2's bar *is* the
 * lazy integrator's score, and the rung asks you to *beat* one — so a lazy
 * integrator must not clear the tier it anchors. The same holds at tier 1 for
 * `blind` and at tier 4 for `competent`: an anchor never clears its own bar.
 *
 * Here rather than at each call site because a comparison operator is a rule,
 * and this project has spent two milestones on rules that lived in several
 * places and drifted (`KNOWN-ISSUES.md` #19, #35).
 */
export function clears(headline: number, bar: number): boolean {
  return headline > bar;
}

/**
 * The bar for a tier, given what the reference solutions scored on this world.
 *
 * Returns `null` when an anchor is missing, rather than substituting a default:
 * a clearance decision made against an anchor nobody measured is exactly the
 * kind of number this module exists to abolish.
 */
export function clearanceBar(
  tier: number,
  referenceScores: Readonly<Record<string, number>>,
): { readonly bar: number; readonly spec: ClearanceBar } | null {
  const spec = CLEARANCE_LADDER.find((b) => b.tier === tier);
  if (!spec) return null;
  const from = referenceScores[spec.from];
  const to = referenceScores[spec.to];
  if (from === undefined || to === undefined) return null;
  return { bar: from + spec.at * (to - from), spec };
}
