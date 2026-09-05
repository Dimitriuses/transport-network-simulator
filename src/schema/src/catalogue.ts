// The semantic-conflict catalogue, as data.
//
// Specification: CORECONCEPT.md §2.1.
//
// **One source of truth for three consumers**, which until P1M1 were three
// copies that had already drifted:
//
//   * `tools/worldbuild/build.py` held `DEFAULTS` and `CONFLICT_NAMES` — what a
//     conflict-free operator publishes, and what to call each departure from it.
//   * `src/scoring/src/probe.ts` held `SWEEPS` — the same settings again, plus
//     the values worth sweeping, the plausibility ceilings and the
//     cosmetic/structural labels.
//   * the projection generator needs all of it, in Python.
//
// The labels are not decoration. Each one was established by measurement during
// Phase 0 and each changes what a generator may do:
//
//   `cosmetic`     texture an adapter settles once. It must exist — a world
//                  where every operator formats ids identically is not
//                  recognisable as the real problem — and it must never carry
//                  difficulty. Measured at exactly zero, always.
//   `structural`   changes *which entities exist* rather than their values.
//                  Held constant when attributing conflict cost, because a
//                  comparison that changes the amount of data changes the
//                  opportunity set and the difficulty together.
//   `plausible`    the strongest setting two real operators could differ by,
//                  and the cause that produces it. A conflict past this stops
//                  teaching integration and starts describing a broken map.
//
// Emitted to `contract/catalogue.json` by `npm run contract:generate`, which CI
// checks for drift.

/** Which section of `CORECONCEPT.md` §2.1 a setting belongs to. */
export type CatalogueSection = "A" | "B" | "C" | "D";

export interface CatalogueSetting {
  /** Catalogue name, e.g. `C-coordinate-offset`. */
  readonly conflict: string;
  readonly section: CatalogueSection;
  /** Manifest group and key, e.g. `geometry` / `offset_m`. */
  readonly group: string;
  readonly key: string;
  /** What a conflict-free operator publishes. */
  readonly off: string | number | boolean;
  /** Texture rather than content. Must exist; must not carry difficulty. */
  readonly cosmetic?: boolean;
  /** Changes which entities exist, not their values. */
  readonly structural?: boolean;
  /**
   * The strongest setting that still describes two real operators disagreeing,
   * with the cause. Absent means categorical: it happens or it does not, and
   * every listed value is something a real operator does.
   */
  readonly plausible?: { readonly max: string | number; readonly because: string };
  /**
   * Settings a generator may choose from, weakest first, all of them things a
   * real operator does. **Every value here must be plausible** — the probe
   * sweeps beyond the ceiling for diagnosis, a generator never does.
   */
  readonly generate: readonly (string | number | boolean)[];
  /**
   * Conflicts this one makes unmeasurable, and may not be generated beside.
   *
   * **A conflict that masks another wastes it and teaches one lesson instead
   * of two.** Found at P1M1: the generator gave one operator a lat/lon swap
   * together with a 130 m offset and 3-decimal truncation, and the swap moved
   * its stops 2,200 km — at which point the offset and the truncation are not
   * subtle defects, they are invisible. The declared world claimed three
   * geometry conflicts and contained one.
   *
   * Exclusion is symmetric: the generator skips a setting if it excludes, or is
   * excluded by, one already placed on that operator.
   */
  readonly excludes?: readonly string[];
}

export const CATALOGUE: readonly CatalogueSetting[] = [
  // --- A: identity and reference ------------------------------------------
  {
    conflict: "A-granularity",
    section: "A",
    group: "identity",
    key: "granularity",
    off: "quay",
    structural: true,
    generate: ["site"],
  },
  {
    conflict: "A-id-scheme",
    section: "A",
    group: "identity",
    key: "id_scheme",
    off: "prefixed",
    cosmetic: true,
    generate: ["bare_int"],
  },
  {
    conflict: "A-naming",
    section: "A",
    group: "naming",
    key: "variant",
    off: "official",
    cosmetic: true,
    generate: ["abbreviated", "colloquial"],
  },
  {
    conflict: "A-coordinate-precision",
    section: "A",
    group: "geometry",
    key: "precision",
    off: 6,
    // 4 dp is ~11 m and common in older exports; 3 dp is ~110 m, rare but real.
    // 2 dp is ~1.1 km, which no transit feed ships.
    plausible: { max: 3, because: "3 dp is ~110 m; 2 dp is ~1.1 km and no feed ships it" },
    generate: [5, 4, 3],
  },
  {
    conflict: "A-coordinate-source",
    section: "A",
    group: "geometry",
    key: "source",
    off: "quay",
    generate: ["site"],
  },

  // --- B: time and schedule ------------------------------------------------
  {
    conflict: "B-time-encoding",
    section: "B",
    group: "time",
    key: "encoding",
    off: "iso_offset",
    generate: ["epoch_s", "epoch_ms", "local_naive"],
  },

  // --- C: units and value semantics ---------------------------------------
  {
    conflict: "C-coordinate-offset",
    section: "C",
    group: "geometry",
    key: "offset_m",
    off: 0,
    // Kerbside pole vs platform centre is 5-30 m; a station centroid published
    // for a specific quay is 20-150 m at a large interchange; geocoding from a
    // street address is 10-100 m; a stop that moved and was never updated is
    // 10-200 m. Past ~150 m two operators are not disagreeing about one stop
    // any more, they are describing different places.
    plausible: { max: 150, because: "station centroid vs quay at a large interchange" },
    generate: [30, 60, 130],
  },
  {
    conflict: "C-latlon-order",
    section: "C",
    group: "geometry",
    key: "latlon_order",
    off: "lat_lon",
    // A swap does not move a stop, it relocates it to another country — 2,200 km
    // for this city. Everything subtler done to the same operator's geometry
    // stops being measurable, so it is generated alone or not at all.
    excludes: ["C-coordinate-offset", "A-coordinate-precision", "A-coordinate-source"],
    generate: ["lon_lat"],
  },
  {
    conflict: "C-delay-unit",
    section: "C",
    group: "realtime",
    key: "delay_unit",
    off: "seconds",
    generate: ["minutes"],
  },

  // --- D: realtime truthfulness -------------------------------------------
  {
    conflict: "D-staleness",
    section: "D",
    group: "realtime",
    key: "staleness_s",
    off: 0,
    // A feed rebuilt on a 5-minute cron behind a cache with its own TTL
    // plausibly lags 10-15 minutes. Half an hour is an outage, not a
    // publishing cadence, and an operator would notice.
    plausible: { max: 900, because: "a 5-minute rebuild behind a cache; 30 min is an outage" },
    generate: [60, 300, 900],
  },
  {
    conflict: "D-silent-cancellation",
    section: "D",
    group: "realtime",
    key: "cancellations",
    off: "explicit",
    generate: ["silent_drop"],
  },
  {
    conflict: "D-no-delays",
    section: "D",
    group: "realtime",
    key: "publishes_delays",
    off: true,
    // An operator that never publishes a delay has no delay unit to get wrong.
    // Found at P1M1 on the generated Tier-3 world, which declared both and
    // contained one — the realtime family's version of the lat/lon swap.
    excludes: ["C-delay-unit"],
    generate: [false],
  },
];

/**
 * Which catalogue sections each tier activates (`CORECONCEPT.md` §7).
 *
 * Sections E and F — protocol behaviour and documentation — arrive in Phase 3
 * with something able to measure them, and are absent here rather than
 * declared and unimplemented.
 */
export const TIER_SECTIONS: Record<number, readonly CatalogueSection[]> = {
  0: [],
  1: ["A"], // cosmetic only; see TIER_COSMETIC_ONLY
  2: ["A", "B", "C"],
  3: ["A", "B", "C", "D"],
  4: ["A", "B", "C", "D"],
  5: ["A", "B", "C", "D"],
};

/** Tiers where section A appears as texture and nothing else. */
export const TIER_COSMETIC_ONLY: readonly number[] = [1];

/** A conflict-free manifest: every setting at its `off` value. */
export function defaultManifest(): Record<string, Record<string, string | number | boolean>> {
  const out: Record<string, Record<string, string | number | boolean>> = {};
  for (const s of CATALOGUE) {
    out[s.group] ??= {};
    out[s.group]![s.key] = s.off;
  }
  return out;
}
