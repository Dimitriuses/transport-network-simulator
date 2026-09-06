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
   * How `generate` was derived from the world's own parameters, when it was.
   *
   * **A setting's values were chosen for plausibility alone, and plausibility
   * is necessary but not sufficient** (`KNOWN-ISSUES.md` #34). Whether a value
   * *does* anything depends on numbers chosen elsewhere: `D-staleness` offered
   * `[60, 300, 900]`, and a feed conceals a disruption only when its lag
   * outlasts that disruption's announcement lead — so against
   * `DEFAULT_DISRUPTION_POLICY.noticeLeadS` of `[300, 1800]`, two of the three
   * concealed nothing at all and the conflict was a switch rather than a ladder.
   *
   * The fix is to state the ladder in **effect space** and invert. Leads are
   * drawn uniformly, so the share of disruptions a lag of `s` conceals is
   * `(s - lo) / (hi - lo)`, clamped — an identity, confirmed against
   * `npm run lead`, which measures 41 % where this predicts 40 %. Choosing the
   * *shares* and solving for `s` gives rungs that are evenly spaced in what
   * they do rather than in what they are.
   *
   * `src/schema/test/catalogue.test.ts` re-derives `generate` from this and
   * fails if they disagree, so changing `noticeLeadS` cannot silently leave the
   * catalogue behind — which is how the two numbers drifted apart in the first
   * place.
   */
  readonly derived?: {
    /** The world parameter the values are solved against. */
    readonly from: "noticeLeadS";
    /** The share of disruptions each rung should conceal. */
    readonly targets: readonly number[];
  };
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
    // How a route is labelled. Real feeds are all over this — a short code in
    // one (`route_short_name`), the pair of termini in another
    // (`route_long_name`), an internal identifier in a third — and a player
    // that wants to know which route a trip belongs to reads `route_id`, not
    // this.
    //
    // **Cosmetic on purpose, and added to give the bottom of the ladder
    // something to choose** (`KNOWN-ISSUES.md` #43). Tier 1 is cosmetic-only
    // and the catalogue held exactly two cosmetic settings, so its quota of two
    // drew both and every Tier-1 world was the same world.
    //
    // *A third value was drafted and dropped:* `code_and_name` concatenated the
    // route id with the line name, which on this project's cities are both
    // codes — it published `1 12`, and no feed prints that. The realism
    // constraint applies to texture too.
    conflict: "A-route-label",
    section: "A",
    group: "naming",
    key: "route_label",
    off: "name",
    cosmetic: true,
    generate: ["code", "terminus_pair"],
  },
  {
    // What a trip says about where it is going. `destination` is the bare
    // terminus; `via` disambiguates two branches by naming a stop on the way,
    // which is what an operator with branches actually publishes; and
    // `route_and_destination` is the printed-on-the-front form.
    //
    // Cosmetic for the same reason as the label above: it is prose for a
    // passenger, and nothing that matches trips across feeds reads it.
    conflict: "A-headsign",
    section: "A",
    group: "naming",
    key: "headsign",
    off: "destination",
    cosmetic: true,
    generate: ["route_and_destination", "via"],
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
    // Solved for 10 %, 20 % and 40 % of disruptions concealed past the moment a
    // warning could still help. Against `noticeLeadS` of [300, 1800] that is
    // 450, 600 and 900 seconds — every one of them above the shortest lead, so
    // every one of them does something. The old [60, 300, 900] had two rungs
    // that concealed nothing (`KNOWN-ISSUES.md` #34).
    derived: { from: "noticeLeadS", targets: [0.1, 0.2, 0.4] },
    generate: [450, 600, 900],
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

/**
 * How many settings from each section a dirty operator departs on, per tier.
 *
 * **A tier used to be a density, and a density does not control *which*
 * conflicts land.** Each setting was drawn independently with probability
 * `density x share`, so two worlds of the same declared tier could hold quite
 * different conflicts: at Tier 3, one drew a 130 m coordinate offset and two
 * operators publishing `epoch_ms`, the other drew **no offset at all**. The
 * offset is the most expensive conflict in the ablation, so the two worlds were
 * not equally hard — the reference solutions differed by five times the
 * seed-to-seed noise (`KNOWN-ISSUES.md` #42), and the *network* draw accounted
 * for none of it.
 *
 * A quota fixes the *shape* of a tier — this many identity conflicts, this many
 * about time, this many about truthfulness — and leaves the seed to choose
 * which setting within a section, which operator carries it, and at what
 * strength. Two worlds of a tier then differ in their texture and agree in
 * their composition, which is what "the same tier" has to mean if it is to mean
 * anything.
 *
 * Sections E and F arrive in Phase 3 and are absent rather than declared.
 */
export const TIER_QUOTA: Record<number, Readonly<Record<CatalogueSection, number>>> = {
  0: { A: 0, B: 0, C: 0, D: 0 },
  1: { A: 2, B: 0, C: 0, D: 0 },
  2: { A: 3, B: 1, C: 1, D: 0 },
  3: { A: 3, B: 1, C: 1, D: 2 },
  4: { A: 4, B: 1, C: 2, D: 2 },
  5: { A: 4, B: 1, C: 2, D: 3 },
};

/** Tiers where section A appears as texture and nothing else. */
export const TIER_COSMETIC_ONLY: readonly number[] = [1];

/** A conflict-free manifest: every setting at its `off` value. */
/**
 * The values a `derived` setting should carry, solved against a world's own
 * parameters. Returns `null` for a setting that declares no derivation.
 *
 * A target beyond what the plausibility ceiling allows is **clamped, not
 * dropped** — the ladder then has a rung that repeats, which is a visible and
 * honest way of saying the ceiling has been reached. Silently omitting it would
 * shorten the ladder with nothing to show for it.
 */
export function derivedValues(
  setting: CatalogueSetting,
  noticeLeadS: readonly [number, number],
): number[] | null {
  if (!setting.derived) return null;
  const [lo, hi] = noticeLeadS;
  const ceiling = typeof setting.plausible?.max === "number" ? setting.plausible.max : Infinity;
  return setting.derived.targets.map((share) =>
    Math.min(ceiling, Math.round(lo + share * (hi - lo))),
  );
}

export function defaultManifest(): Record<string, Record<string, string | number | boolean>> {
  const out: Record<string, Record<string, string | number | boolean>> = {};
  for (const s of CATALOGUE) {
    out[s.group] ??= {};
    out[s.group]![s.key] = s.off;
  }
  return out;
}
