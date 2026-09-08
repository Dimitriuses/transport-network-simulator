// The difficulty ladder, as one ordered list.
//
// Specification: CORECONCEPT.md §7, ROADMAP.md P1M5, KNOWN-ISSUES.md #48.
//
// **A rung is an entry in a list; a tier is its index.** Until P1M5 the ladder
// was six tables keyed by the literals `0`–`5` — which sections a tier
// activates, how many settings it draws from each, whether it is texture only,
// how dense it is, and what clearing it takes — plus seventeen places on the
// Python side iterating `range(6)`. Adding a rung meant editing all of them and
// hoping nothing was missed, and *deciding what five other tables should say at
// 2.5* is not a question anybody should have to answer.
//
// So the tables became views over this list. Inserting a rung between two
// others is one entry, and every view follows.
//
// **A rung's id travels with a result; its index does not.**
//
// The numbering is expected to move — a six-rung ladder may become nine when
// intermediate rungs are wanted — and a score recorded against "tier 4" means
// nothing afterwards if tier 4 has become tier 6. Every rung therefore carries
// a stable id, a world bundle records that id and `LADDER_VERSION` beside the
// numeric tier, and a result stays interpretable across a renumbering.
//
// Without it this would be `KNOWN-ISSUES.md` #20 in a new place: a number
// ratified against one scale and reused after the scale moved. That mistake has
// been made twice here — the clearance table when `capture`'s denominator
// changed, and Gate 3's threshold when its metric did.
//
// **What a rung does not yet carry is its world.** `P1M6` gives each one its
// size, its operator roster and their modes; the ids below already name the
// world each rung intends, so that milestone fills them in rather than renaming
// anything (`ROADMAP.md`, Phase 1 reopened).

import type { CatalogueSection } from "./catalogue.ts";

/**
 * Increment when the ladder changes in a way that makes recorded results
 * incomparable: a rung added, removed, renumbered, or given different content.
 *
 * Not for tuning a quota by one, which the content hash of a world already
 * captures. This is for "the tier in that scorecard does not mean what it means
 * now".
 */
export const LADDER_VERSION = 1;

/** One rung: what a tier declares about a world. */
export interface Rung {
  /**
   * Stable identity, and the thing to quote. Never reused for a different rung
   * and never changed to match a new position.
   */
  readonly id: string;
  /** What this rung is, in words, for a report to print. */
  readonly name: string;
  /** Which catalogue sections it activates (`CORECONCEPT.md` §7). */
  readonly sections: readonly CatalogueSection[];
  /** Section A appears as texture and nothing else. */
  readonly cosmeticOnly?: boolean;
  /** How many settings from each section a dirty operator departs on. */
  readonly quota: Readonly<Record<CatalogueSection, number>>;
  /**
   * Roughly how many settings each operator departs on.
   *
   * The crudest lever on difficulty, kept because the quota fixes composition
   * and this still scales how much of it lands on a small operator.
   */
  readonly density: number;
  /** What clearing this rung takes, as a position between two references. */
  readonly clearance: {
    readonly from: string;
    readonly to: string;
    readonly at: number;
    readonly because: string;
  };
}

/**
 * The ladder.
 *
 * Sections E and F — protocol behaviour and documentation — arrive in Phase 3
 * with something able to measure them, and are absent here rather than declared
 * and unimplemented.
 */
export const LADDER: readonly Rung[] = [
  {
    id: "clean",
    name: "a world that publishes honestly",
    sections: [],
    quota: { A: 0, B: 0, C: 0, D: 0 },
    density: 0,
    clearance: {
      from: "null",
      to: "blind",
      at: 0,
      because: "turn up — answer at all, rather than decline every obligation",
    },
  },
  {
    id: "small-town",
    name: "texture only: the same facts, spelled differently",
    sections: ["A"],
    cosmeticOnly: true,
    quota: { A: 2, B: 0, C: 0, D: 0 },
    density: 1,
    clearance: {
      from: "null",
      to: "blind",
      at: 1,
      because: "match a solution that reconciles nothing and ignores realtime",
    },
  },
  {
    id: "metro-town",
    name: "the first conflicts that mean something",
    sections: ["A", "B", "C"],
    quota: { A: 3, B: 1, C: 1, D: 0 },
    density: 0.55,
    clearance: {
      from: "blind",
      to: "naive",
      at: 1,
      because: "beat a lazy integrator: reconcile the feeds, however crudely",
    },
  },
  {
    id: "metro-city",
    name: "realtime joins in, and starts lying",
    sections: ["A", "B", "C", "D"],
    quota: { A: 3, B: 1, C: 1, D: 2 },
    density: 0.6,
    clearance: {
      from: "naive",
      to: "competent",
      at: 0.5,
      because: "get halfway from a lazy integration to one that does the job",
    },
  },
  {
    id: "towns-and-rail",
    name: "more of everything, and further to go",
    sections: ["A", "B", "C", "D"],
    quota: { A: 4, B: 1, C: 2, D: 2 },
    density: 0.7,
    clearance: {
      from: "naive",
      to: "competent",
      at: 1,
      because: "match a solution written by people who had seen the world",
    },
  },
  {
    id: "region",
    name: "the whole catalogue, at strength",
    sections: ["A", "B", "C", "D"],
    quota: { A: 4, B: 1, C: 2, D: 3 },
    density: 0.8,
    clearance: {
      from: "naive",
      to: "competent",
      at: 1.25,
      because: "beat it — the top of the ladder must sit above our own answer key",
    },
  },
];

// --------------------------------------------------------------- the views
//
// Functions of a ladder rather than of *the* ladder, which is what makes the
// one-entry claim testable: a test inserts a rung into a copy and requires
// every view to follow, without a second file changing.

/** Which sections each tier activates, keyed by index. */
export const sectionsByTier = (
  ladder: readonly Rung[],
): Record<number, readonly CatalogueSection[]> =>
  Object.fromEntries(ladder.map((r, i) => [i, r.sections]));

/** Each tier's per-section quota, keyed by index. */
export const quotaByTier = (
  ladder: readonly Rung[],
): Record<number, Readonly<Record<CatalogueSection, number>>> =>
  Object.fromEntries(ladder.map((r, i) => [i, r.quota]));

/** The tiers that are texture and nothing else. */
export const cosmeticOnlyTiers = (ladder: readonly Rung[]): readonly number[] =>
  ladder.flatMap((r, i) => (r.cosmeticOnly ? [i] : []));

/** Each tier's density, keyed by index. */
export const densityByTier = (ladder: readonly Rung[]): Record<number, number> =>
  Object.fromEntries(ladder.map((r, i) => [i, r.density]));

/** The rung at a tier, or `null` — never a default, which would hide a typo. */
export const rungAt = (tier: number, ladder: readonly Rung[] = LADDER): Rung | null =>
  ladder[tier] ?? null;

/** The rung with an id, for reading a result recorded before a renumbering. */
export const rungById = (id: string, ladder: readonly Rung[] = LADDER): Rung | null =>
  ladder.find((r) => r.id === id) ?? null;

/** Where a rung sits now, or `-1` if this ladder no longer has it. */
export const tierOfRung = (id: string, ladder: readonly Rung[] = LADDER): number =>
  ladder.findIndex((r) => r.id === id);
