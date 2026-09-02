// The conflict-depth probe.
//
// Specification: ROADMAP.md P1M0 part B.
//
// Ablation answers "what do the declared conflicts cost, as declared". This
// answers the question behind it: **is there any setting at which each conflict
// costs anything at all?** A defect that cannot be made to bite at any strength
// is an ornament, and a generator built on the catalogue would spend most of
// its effort producing ornaments.
//
// Every measurement is taken against a *matched* baseline — the same world with
// every conflict switched off — because the dominant term is not conflict cost
// at all. It is the irreducible cost of planning before you could have known,
// and it is large enough to swamp anything measured without subtracting it.

import type { World } from "@tns/schema";
import { calibrate, STRUCTURAL_CONFLICTS } from "./baselines.ts";

/** A manifest setting, and the values worth trying. */
export interface Sweep {
  readonly conflict: string;
  readonly group: string;
  readonly key: string;
  /**
   * True when the setting changes *which entities exist* rather than their
   * values — how many stops an operator publishes, not where they are.
   *
   * The distinction decides what may be switched off when attributing conflict
   * cost. A lazy solver's error rate scales with how much data it is given, so
   * a comparison that changes the number of published stops changes the
   * opportunity set and the difficulty at the same time, and cannot attribute
   * to either (`KNOWN-ISSUES.md` #14).
   *
   * Changing a *value* is different, and is the phenomenon rather than a
   * confound: a coordinate offset moves stops and therefore changes which pairs
   * look like interchanges, but that IS how a geometric conflict acts on a
   * geometric solver. Holding it constant would hold the conflict constant.
   */
  readonly structural?: boolean;
  /**
   * The strongest setting that still describes something that happens between
   * two real transport operators, and the reason it does.
   *
   * **A conflict pushed past this stops teaching integration.** Two agencies can
   * disagree about where a stop is; at 500 m apart that is not a disagreement,
   * it is a broken map, and a player who learns to expect it learns the wrong
   * lesson. The probe reports beyond this band because knowing where a conflict
   * *would* bite is diagnostic — but nothing may be generated there, and Gate 3
   * may not be passed by going there.
   *
   * Absent means the setting is categorical: it either happens or it does not,
   * and every listed value is something a real operator does.
   */
  readonly plausible?: { readonly max: unknown; readonly because: string };
  /** The value at which the conflict is absent. */
  readonly off: unknown;
  /** Values to try, weakest first. */
  readonly values: readonly unknown[];
}

export const SWEEPS: readonly Sweep[] = [
  // --- A: identity -------------------------------------------------------
  // The only setting that changes how many stops exist, and therefore the only
  // one held constant when attributing (see `structural` above).
  {
    conflict: "A-granularity",
    group: "identity",
    key: "granularity",
    off: "quay",
    values: ["site"],
    structural: true,
  },
  { conflict: "A-id-scheme", group: "identity", key: "id_scheme", off: "prefixed", values: ["bare_int"] },
  { conflict: "A-naming", group: "naming", key: "variant", off: "official", values: ["abbreviated", "colloquial"] },
  {
    conflict: "A-coordinate-precision",
    group: "geometry",
    key: "precision",
    off: 6,
    values: [5, 4, 3, 2],
    // 4 dp is ~11 m and common in older exports; 3 dp is ~110 m and rare but
    // real. 2 dp is ~1.1 km, which no transit feed ships.
    plausible: { max: 3, because: "3 dp is ~110 m; 2 dp is ~1.1 km and no feed ships it" },
  },
  { conflict: "A-coordinate-source", group: "geometry", key: "source", off: "quay", values: ["site"] },

  // --- C: units and value semantics --------------------------------------
  {
    conflict: "C-coordinate-offset",
    group: "geometry",
    key: "offset_m",
    off: 0,
    values: [30, 60, 130, 260, 500],
    // Kerbside pole vs platform centre is 5-30 m; a station centroid published
    // for a specific quay is 20-150 m at a large interchange; geocoding from a
    // street address is 10-100 m; a stop that physically moved and was never
    // updated is 10-200 m. Past ~150 m the two operators are not disagreeing
    // about one stop any more, they are describing different places.
    plausible: { max: 150, because: "station centroid vs quay at a large interchange" },
  },
  { conflict: "C-latlon-order", group: "geometry", key: "latlon_order", off: "lat_lon", values: ["lon_lat"] },
  { conflict: "C-delay-unit", group: "realtime", key: "delay_unit", off: "seconds", values: ["minutes"] },

  // --- B: time -----------------------------------------------------------
  {
    conflict: "B-time-encoding",
    group: "time",
    key: "encoding",
    off: "iso_offset",
    values: ["epoch_s", "epoch_ms", "local_naive"],
  },

  // --- D: realtime truthfulness ------------------------------------------
  {
    conflict: "D-staleness",
    group: "realtime",
    key: "staleness_s",
    off: 0,
    values: [60, 300, 900, 1800],
    // A feed rebuilt on a 5-minute cron and served through a CDN with its own
    // TTL plausibly lags 10-15 minutes. Half an hour is an outage, not a
    // publishing cadence, and an operator would notice.
    plausible: { max: 900, because: "a 5-minute rebuild behind a cache; 30 min is an outage" },
  },
  {
    conflict: "D-silent-cancellation",
    group: "realtime",
    key: "cancellations",
    off: "explicit",
    values: ["silent_drop"],
  },
  { conflict: "D-no-delays", group: "realtime", key: "publishes_delays", off: true, values: [false] },
];

type ManifestBag = Record<string, Record<string, unknown>>;

function withSetting(
  world: World,
  operatorId: string | null,
  group: string,
  key: string,
  value: unknown,
): World {
  const operators = world.manifest.operators.map((o) => {
    if (operatorId !== null && o.id !== operatorId) return o;
    const m = structuredClone(o.manifest) as ManifestBag;
    if (m[group]) m[group]![key] = value;
    return { ...o, manifest: m };
  });
  return { ...world, manifest: { ...world.manifest, operators } };
}

/**
 * Every conflict off, on every operator.
 *
 * **Not a valid floor for attribution**, and kept because the fact that it is
 * not is itself worth being able to demonstrate. Switching granularity off
 * changes how many stops exist, and a lazy solver given more stops finds more
 * apparent interchanges to get wrong. Use `valueCleanWorld` to attribute.
 */
export function cleanWorld(world: World): World {
  let out = world;
  for (const s of SWEEPS) out = withSetting(out, null, s.group, s.key, s.off);
  return out;
}

/**
 * Every *value-level* conflict off, with the entity set left exactly as
 * declared. This is the floor attribution is measured from.
 *
 * Operators publish the same stops, at the same granularity, under the same
 * scheme as the declared world — they simply publish honest values for them:
 * true coordinates at full precision, timestamps in one encoding, delays in
 * seconds, feeds that are current and mention their cancellations.
 *
 * So the difference between this and the declared world is what the *disagreement*
 * costs, with the size of the problem held fixed.
 */
export function valueCleanWorld(world: World): World {
  let out = world;
  for (const s of SWEEPS) {
    if (s.structural ?? STRUCTURAL_CONFLICTS.has(s.conflict)) continue;
    out = withSetting(out, null, s.group, s.key, s.off);
  }
  return out;
}

export interface ProbePoint {
  readonly operator: string;
  readonly value: unknown;
  /** False when this setting is stronger than any real disagreement. */
  readonly plausible: boolean;
  /** Mean seconds of extra shortfall over the honest-values baseline. */
  readonly costS: number;
  /**
   * Spread of that cost across seeds.
   *
   * Reported because P0M9 measured what a single calibration is worth: with
   * only the disruptions changing, conflict cost has a standard deviation of
   * 36 % of its own mean. A point whose sd is comparable to the difference
   * between it and its neighbour is not evidence of a curve.
   */
  readonly sdS: number;
}

export interface ProbeResult {
  readonly conflict: string;
  readonly points: readonly ProbePoint[];
  /** The strongest setting tried, on the operator that expressed it best. */
  readonly bestCostS: number;
  readonly bestValue: unknown;
  readonly bestOperator: string;
  /** True if no operator at any setting cost more than the noise floor. */
  readonly inert: boolean;
}

export interface ProbeOptions {
  readonly operator?: string;
  /** How many disruption seeds to average each measurement over. */
  readonly seeds?: number;
}

export interface ProbeReport {
  /** The honest-values world's own shortfall, averaged over seeds. */
  readonly baselineS: number;
  readonly seeds: number;
  readonly results: readonly ProbeResult[];
  readonly inertCount: number;
}

/** Below this, a difference is not distinguishable from routing noise. */
export const NOISE_FLOOR_S = 10;

/** Whether a setting sits inside what two real operators would disagree by. */
export function isPlausible(sweep: Sweep, value: unknown): boolean {
  if (!sweep.plausible) return true;
  const max = sweep.plausible.max;
  if (typeof max === "number" && typeof value === "number") {
    // Precision counts down: fewer decimal places is the stronger conflict.
    return sweep.key === "precision" ? value >= max : value <= max;
  }
  return value === max;
}

/**
 * Sweep every conflict against a conflict-free baseline.
 *
 * Applied to **one operator at a time**, because a defect on every operator at
 * once is a different world rather than a stronger conflict, and because a
 * generator will place them individually.
 *
 * And to **every operator in turn**, because an operator cannot always express
 * a defect: Site granularity means nothing on an operator whose quays are
 * already one per Site, and a silently dropped cancellation means nothing on an
 * operator nothing was cancelled on. Probing one operator would score those
 * inert for a reason that is a fact about the network rather than about the
 * conflict — the same mistake, one level up, as measuring feed defects with a
 * baseline that never reads a feed.
 */
export function probeCatalogue(world: World, options: ProbeOptions = {}): ProbeReport {
  const seeds = Math.max(1, options.seeds ?? 1);
  // Fixed offsets, so a re-run compares like with like.
  const seedList = Array.from({ length: seeds }, (_, i) => world.manifest.seed + i * 7919);

  // **Every measurement is a mean over seeds, not a single calibration.**
  // P0M9 measured the alternative: with only the disruptions changing,
  // conflict cost varies by 36 % of its own mean, which is larger than most of
  // the differences this sweep is trying to resolve. One run per setting would
  // produce a curve made of noise.
  const gapsFor = (w: World): { mean: number; sd: number } => {
    const xs = seedList.map(
      (seed) => calibrate({ ...w, manifest: { ...w.manifest, seed } }).gapP0aP2rt,
    );
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length);
    return { mean, sd };
  };

  // The entity set is held at the declared world's, so a sweep varies the
  // conflict and nothing else (`KNOWN-ISSUES.md` #14).
  const clean = valueCleanWorld(world);
  const base = gapsFor(clean);

  const operators = (
    options.operator !== undefined ? [options.operator] : world.manifest.operators.map((o) => o.id)
  )
    .slice()
    .sort();

  const results: ProbeResult[] = [];

  for (const sweep of SWEEPS) {
    const points: ProbePoint[] = [];
    for (const op of operators) {
      for (const value of sweep.values) {
        const variant = withSetting(clean, op, sweep.group, sweep.key, value);
        const g = gapsFor(variant);
        points.push({
          operator: op,
          value,
          plausible: isPlausible(sweep, value),
          costS: g.mean - base.mean,
          // Combined spread of the two means being differenced.
          sdS: Math.sqrt(g.sd * g.sd + base.sd * base.sd),
        });
      }
    }

    // The best setting **that could actually occur**. An implausible setting
    // that bites is a diagnostic, not an option.
    const usable = points.filter((pt) => pt.plausible);
    const best = (usable.length > 0 ? usable : points).reduce(
      (a, b) => (b.costS > a.costS ? b : a),
      (usable[0] ?? points[0])!,
    );
    results.push({
      conflict: sweep.conflict,
      points,
      bestCostS: best.costS,
      bestValue: best.value,
      bestOperator: best.operator,
      inert: best.costS < NOISE_FLOOR_S,
    });
  }

  results.sort((a, b) => b.bestCostS - a.bestCostS);
  return {
    baselineS: base.mean,
    seeds,
    results,
    inertCount: results.filter((r) => r.inert).length,
  };
}
