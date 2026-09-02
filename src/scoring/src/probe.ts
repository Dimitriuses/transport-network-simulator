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
import { calibrate } from "./baselines.ts";

/** A manifest setting, and the values worth trying. */
export interface Sweep {
  readonly conflict: string;
  readonly group: string;
  readonly key: string;
  /** The value at which the conflict is absent. */
  readonly off: unknown;
  /** Values to try, weakest first. */
  readonly values: readonly unknown[];
}

export const SWEEPS: readonly Sweep[] = [
  // --- A: identity -------------------------------------------------------
  { conflict: "A-granularity", group: "identity", key: "granularity", off: "quay", values: ["site"] },
  { conflict: "A-id-scheme", group: "identity", key: "id_scheme", off: "prefixed", values: ["bare_int"] },
  { conflict: "A-naming", group: "naming", key: "variant", off: "official", values: ["abbreviated", "colloquial"] },
  {
    conflict: "A-coordinate-precision",
    group: "geometry",
    key: "precision",
    off: 6,
    values: [5, 4, 3, 2],
  },
  { conflict: "A-coordinate-source", group: "geometry", key: "source", off: "quay", values: ["site"] },

  // --- C: units and value semantics --------------------------------------
  {
    conflict: "C-coordinate-offset",
    group: "geometry",
    key: "offset_m",
    off: 0,
    values: [30, 60, 130, 260, 500],
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

/** Every conflict off, on every operator. The floor everything is measured from. */
export function cleanWorld(world: World): World {
  let out = world;
  for (const s of SWEEPS) out = withSetting(out, null, s.group, s.key, s.off);
  return out;
}

export interface ProbePoint {
  readonly operator: string;
  readonly value: unknown;
  /** Seconds of extra shortfall over the conflict-free baseline. */
  readonly costS: number;
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

export interface ProbeReport {
  /** The conflict-free world's own shortfall — the term that dominates. */
  readonly baselineS: number;
  readonly results: readonly ProbeResult[];
  readonly inertCount: number;
}

/** Below this, a difference is not distinguishable from routing noise. */
export const NOISE_FLOOR_S = 10;

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
export function probeCatalogue(world: World, operatorId?: string): ProbeReport {
  const clean = cleanWorld(world);
  const baseline = calibrate(clean).gapP0aP2rt;

  const operators = (
    operatorId !== undefined ? [operatorId] : world.manifest.operators.map((o) => o.id)
  )
    .slice()
    .sort();

  const results: ProbeResult[] = [];

  for (const sweep of SWEEPS) {
    const points: ProbePoint[] = [];
    for (const op of operators) {
      for (const value of sweep.values) {
        const variant = withSetting(clean, op, sweep.group, sweep.key, value);
        points.push({ operator: op, value, costS: calibrate(variant).gapP0aP2rt - baseline });
      }
    }

    const best = points.reduce((a, b) => (b.costS > a.costS ? b : a), points[0]!);
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
    baselineS: baseline,
    results,
    inertCount: results.filter((r) => r.inert).length,
  };
}
