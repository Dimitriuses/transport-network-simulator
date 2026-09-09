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
// **And since P1M6 a rung carries its world**: how many arms, how long, how many
// quays at the hub, and who runs it. A tier declared which conflicts a world
// held and nothing else, so every generated world at every tier was the same
// city with the same three operators under the same hard-coded names — the root
// of `KNOWN-ISSUES.md` #43, #47 and #48 alike.

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

/**
 * The city a rung asks for.
 *
 * **A tier used to declare which conflicts a world held and nothing else**, so
 * every generated world — tier 0 through 5, every seed — was the same 59 sites,
 * 60 quays and 13 lines run by the same three operators under the same
 * hard-coded names (`KNOWN-ISSUES.md` #48). Difficulty by structure is the one
 * axis the realism constraint does not cap: a bigger network with more
 * operators is harder without any conflict being less plausible.
 */
export interface RungWorld {
  /** Radial arms out of the hub. Even, so opposite arms pair into through lines. */
  readonly arms: number;
  /** Sites along each arm, at increasing radius. */
  readonly sitesPerArm: number;
  /** Quays at the hub. More than one, always. */
  readonly hubQuays: number;
  /** Chord lines bypassing the hub, on the ring operators. */
  readonly chords: number;
  /** Lines on the regional operators. */
  readonly regionalLines: number;
  /** Lines on the metro operators, each running through the centre. */
  readonly metroLines: number;
  /**
   * Who runs it, by role, in order.
   *
   * `radial` runs the star, `ring` the orbital and the chords *and its own
   * stops a short walk from the radials* — that walk is the headroom — and
   * `regional` is fast, infrequent and deliberately low-reach. A world needs a
   * radial and a ring or it has no undeclared interchange to find.
   *
   * **The ids are generated from the world's seed**, so two worlds of one rung
   * share no operator identity.
   */
  readonly roster: readonly string[];
  /**
   * The largest share of line-stops any one operator may serve.
   *
   * Scales with the roster, because it must: two operators cannot both be under
   * a half, and a cap nobody can satisfy is a generator that always throws.
   * `#38` is about one operator carrying *most* of a city while also collecting
   * most of its conflicts, which two equal companies do not do.
   */
  readonly maxReachShare: number;
}

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
  /** The city this rung asks for. */
  readonly world: RungWorld;
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
    world: { arms: 6, sitesPerArm: 3, hubQuays: 2, chords: 2, regionalLines: 0, metroLines: 0, roster: ["radial", "ring"], maxReachShare: 0.62 },
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
    world: { arms: 6, sitesPerArm: 3, hubQuays: 2, chords: 2, regionalLines: 0, metroLines: 0, roster: ["radial", "ring"], maxReachShare: 0.62 },
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
    world: { arms: 8, sitesPerArm: 3, hubQuays: 2, chords: 3, regionalLines: 0, metroLines: 2, roster: ["radial", "ring", "metro"], maxReachShare: 0.55 },
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
    world: { arms: 8, sitesPerArm: 4, hubQuays: 2, chords: 4, regionalLines: 3, metroLines: 2, roster: ["radial", "ring", "metro", "regional"], maxReachShare: 0.5 },
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
    // **The top of the ladder, and it is one rung because measurement said so.**
    //
    // There used to be a `region` above this, with six operators against five
    // and a 0.4 reach cap against 0.45 — more of everything, and *easier*:
    // `competent` read 0.352 there against 0.277 here, about two and a half
    // sigma apart (`KNOWN-ISSUES.md` #51). The quota is per operator, so
    // spreading it over more operators leaves each feed as bad while making
    // each feed matter less, and a bigger network offers more ways round any
    // one of them.
    //
    // So the two merged, keeping the harder half of each: this rung's roster
    // and reach cap, and the old top rung's quota, density and clearance bar.
    // **A tier that is easier than the tier below it is not a rung.**
    //
    // What the old top rung was *for* — a region of towns rather than one city
    // — is a shape rather than a rung, and `shape.ts` now offers three of them:
    // towns joined by rail, by bus, or by both.
    id: "towns-and-rail",
    name: "the whole catalogue, at strength, over a region",
    sections: ["A", "B", "C", "D"],
    world: {
      arms: 12,
      sitesPerArm: 4,
      hubQuays: 3,
      chords: 5,
      regionalLines: 4,
      metroLines: 3,
      roster: ["radial", "ring", "radial", "metro", "regional"],
      maxReachShare: 0.45,
    },
    // **`D: 2`, not the 3 the merge intended.** Section D holds three settings
    // and `D-no-delays` excludes `C-delay-unit`, which this rung's `C: 2` draws
    // on every dirty operator — so D delivers two whatever it declares, every
    // time (`KNOWN-ISSUES.md` #54, and `#47` for why the section is that thin).
    // A quota that cannot be met is a declaration that is false, which is `#30`
    // one level up: *declared and undeliverable* rather than declared and
    // absent.
    quota: { A: 4, B: 1, C: 2, D: 2 },
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
