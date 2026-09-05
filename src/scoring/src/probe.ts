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
import { CATALOGUE, type CatalogueSetting } from "@tns/schema";
import { calibrate, STRUCTURAL_CONFLICTS } from "./baselines.ts";

/**
 * A manifest setting, and the values worth trying.
 *
 * **Derived from `CATALOGUE`** in `src/schema`, which is the one place the
 * conflict-free defaults, the catalogue names, the plausibility ceilings and
 * the cosmetic/structural labels are written down. The probe adds only the
 * thing that is its own: values to sweep *beyond* what a generator may use,
 * because knowing where a conflict would bite is diagnostic even when nothing
 * may be generated there.
 */
export interface Sweep extends CatalogueSetting {
  /** Values to try, weakest first. May exceed the plausible ceiling. */
  readonly values: readonly (string | number | boolean)[];
}

/**
 * Extra settings the probe sweeps that a generator may not use.
 *
 * Each is past its plausibility ceiling and is reported with a `!` marker.
 * A conflict at 500 m is not two operators disagreeing about a stop, it is a
 * broken map — but measuring what it would cost says how far from biting the
 * realistic settings are.
 */
const DIAGNOSTIC_VALUES: Record<string, readonly (string | number)[]> = {
  "A-coordinate-precision": [2],
  "C-coordinate-offset": [260, 500],
  "D-staleness": [1800],
};

export const SWEEPS: readonly Sweep[] = CATALOGUE.map((setting) => ({
  ...setting,
  values: [...setting.generate, ...(DIAGNOSTIC_VALUES[setting.conflict] ?? [])],
}));

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
  /**
   * Called once per calibration, for progress reporting.
   *
   * Report only — it must not influence what is measured, and nothing here
   * passes it anything it could act on.
   */
  readonly onStep?: (label: string) => void;
}

/**
 * How many calibrations `probeCatalogue` will run, so a caller can size a
 * progress bar before the work starts.
 *
 * One baseline plus every (sweep, operator, value) triple, all times the seed
 * count. Kept beside the loop that consumes it, because a total computed
 * somewhere else drifts the first time the loop changes.
 */
export function probeStepCount(world: World, options: ProbeOptions = {}): number {
  const seeds = Math.max(1, options.seeds ?? 1);
  const operators = options.operator !== undefined ? 1 : world.manifest.operators.length;
  const settings = SWEEPS.reduce((n, sweep) => n + sweep.values.length * operators, 0);
  return (1 + settings) * seeds;
}

export interface ProbeReport {
  /** The honest-values world's own shortfall, averaged over seeds. */
  readonly baselineS: number;
  readonly seeds: number;
  readonly results: readonly ProbeResult[];
  readonly inertCount: number;
  /** Semantic conflicts measuring nothing — the ones that are a problem. */
  readonly inertSemanticCount: number;
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
  const gapsFor = (w: World, label: string): { mean: number; sd: number } => {
    const xs = seedList.map((seed) => {
      const gap = calibrate({ ...w, manifest: { ...w.manifest, seed } }).gapP0aP2rt;
      options.onStep?.(label);
      return gap;
    });
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length);
    return { mean, sd };
  };

  // The entity set is held at the declared world's, so a sweep varies the
  // conflict and nothing else (`KNOWN-ISSUES.md` #14).
  const clean = valueCleanWorld(world);
  const base = gapsFor(clean, "honest-values baseline");

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
        const g = gapsFor(variant, `${sweep.conflict} on ${op} at ${String(value)}`);
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
    inertSemanticCount: results.filter(
      (r) => r.inert && !SWEEPS.find((sw) => sw.conflict === r.conflict)?.cosmetic,
    ).length,
  };
}
