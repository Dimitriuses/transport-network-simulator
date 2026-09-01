// P2 — the naive baseline, and the three-gap calibration.
//
// Specification: REFERENCE-POLICY.md §2 and §10.
//
// P2 is a deliberately lazy *player*, not a policy of the world. It sees only
// what the operators publish, merges stops across them by coordinate proximity
// alone, and plans on the result. It never touches the world, and exists purely
// to measure how much a world's declared conflicts cost someone who does the
// obvious thing badly.
//
// The three gaps together are what makes two worlds comparable — matching
// conflict lists is not sufficient (REFERENCE-POLICY.md §10):
//
//   P0 − P1   total headroom available to any player
//   P0 − P2   what the conflicts cost a lazy integrator
//   P1 − P2   whether integrating lazily even beats not integrating

import type { Journey, Line, Pattern, PatternStop, Quay, Site, World } from "@tns/schema";
import { parseSimTime, parseEpoch } from "@tns/schema";
import { buildIndex, route, executeReactively, type Access, type RouterIndex } from "@tns/router";
import { generateDisruptions } from "@tns/core";
import { projectOperator, type Timetable } from "@tns/projections";
import type { Disruption } from "@tns/core";

/** How close two published stops must be for a lazy matcher to fuse them. */
export const NAIVE_MATCH_THRESHOLD_M = 120;

/**
 * How a lazy integrator reads a published timestamp.
 *
 * It handles the *shapes* competently — a number is epoch seconds, a string
 * with an offset is RFC 3339 — because failing to parse at all would make P2
 * collapse rather than degrade, and a collapsed baseline measures nothing.
 *
 * What it gets wrong is the thing that looks like it needs no decision:
 * a timestamp with **no offset**. It assumes UTC, because that is what a
 * date library does when you do not tell it otherwise. The world runs at
 * +03:00, so every such operator's times land three hours off — and nothing
 * in the data says so (catalogue B).
 */
function naiveDecodeTime(anchor: ReturnType<typeof parseEpoch>, value: string | number): number {
  if (typeof value === "number") {
    // Epoch seconds. τ counts from local midnight, so undo the offset.
    return value + anchor.offsetS;
  }
  if (/[+-]\d{2}:\d{2}$/.test(value)) return parseSimTime(anchor, value);
  // No offset. Assume UTC — the plausible, unexamined, wrong choice.
  return parseSimTime(anchor, `${value}+00:00`);
}

/** Flat-earth metres. Adequate at city scale, and what a lazy player would do. */
function roughMetres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * 111_320;
  const dLon = (aLon - bLon) * 71_000;
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Build a world-shaped view from published data alone, merging stops by
 * proximity.
 *
 * The result is fed to the same router as P0 and P1, so any difference in
 * outcome comes from the *model* the lazy player built, not from a different
 * search. That is the whole point: it isolates the cost of bad reconciliation.
 */
export function naiveMergedWorld(world: World): World {
  const anchor = parseEpoch(world.manifest.worldEpochIso);
  const timetables: Timetable[] = world.manifest.operators.map(
    (op) => projectOperator(world, op.id, 0).timetable,
  );

  // Union-find over published stops, fusing anything within the threshold.
  const keys: string[] = [];
  const coords: { lat: number; lon: number; name: string }[] = [];
  for (const t of timetables) {
    for (const s of t.stops) {
      keys.push(`${t.operator}:${s.stop_id}`);
      coords.push({ lat: s.lat, lon: s.lon, name: s.stop_name });
    }
  }

  const parent = keys.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = coords[i]!;
      const b = coords[j]!;
      if (roughMetres(a.lat, a.lon, b.lat, b.lon) <= NAIVE_MATCH_THRESHOLD_M) {
        parent[find(i)] = find(j);
      }
    }
  }

  const groupOf = new Map<string, string>();
  keys.forEach((k, i) => groupOf.set(k, `merged-${String(find(i)).padStart(4, "0")}`));

  // Merged stops become quays; each merged group is its own Site, because a
  // coordinate matcher has no notion of a station complex.
  const sites: Site[] = [];
  const quays: Quay[] = [];
  const seen = new Set<string>();
  keys.forEach((k, i) => {
    const g = groupOf.get(k)!;
    if (seen.has(g)) return;
    seen.add(g);
    const c = coords[i]!;
    sites.push({ id: g, name: c.name, lat: c.lat, lon: c.lon });
    quays.push({ id: g, siteId: g, name: c.name, lat: c.lat, lon: c.lon });
  });

  const lines: Line[] = [];
  const patterns: Pattern[] = [];
  const journeys: Journey[] = [];

  for (const t of timetables) {
    for (const r of t.routes) {
      lines.push({ id: `${t.operator}:${r.route_id}`, name: r.route_name, operator: t.operator });
    }
    for (const trip of t.trips) {
      const patternId = `${t.operator}:${trip.trip_id}`;
      const first = trip.stop_times[0];
      if (!first) continue;
      const startS = naiveDecodeTime(anchor, first.depart);

      const stops: PatternStop[] = trip.stop_times.map((st, seq) => ({
        seq,
        quayId: groupOf.get(`${t.operator}:${st.stop_id}`) ?? st.stop_id,
        arriveOffsetS: naiveDecodeTime(anchor, st.arrive) - startS,
        departOffsetS: naiveDecodeTime(anchor, st.depart) - startS,
      }));

      patterns.push({
        id: patternId,
        lineId: `${t.operator}:${trip.route_id}`,
        heading: trip.heading,
        stops,
      });
      journeys.push({ id: patternId, patternId, startS });
    }
  }

  // Walking links between merged stops, on the same threshold the matcher used.
  const walkLinks = [];
  for (const a of quays) {
    for (const b of quays) {
      if (a.id === b.id) continue;
      const m = roughMetres(a.lat, a.lon, b.lat, b.lon);
      if (m <= world.manifest.maxWalkM) {
        walkLinks.push({ fromQuay: a.id, toQuay: b.id, metres: m });
      }
    }
  }

  // Query access recomputed against merged stops — the lazy player does its own
  // nearest-stop search, and gets it slightly wrong for the same reason.
  const queryAccess = [];
  for (const q of world.queries) {
    for (const [endpoint, lat, lon] of [
      ["origin", q.originLat, q.originLon],
      ["destination", q.destLat, q.destLon],
    ] as const) {
      for (const quay of quays) {
        const m = roughMetres(lat, lon, quay.lat, quay.lon);
        if (m <= world.manifest.maxWalkM) {
          queryAccess.push({ queryId: q.id, endpoint, quayId: quay.id, metres: m });
        }
      }
    }
  }

  return {
    manifest: world.manifest,
    sites,
    quays,
    lines,
    patterns,
    journeys,
    walkLinks,
    queries: world.queries,
    queryAccess,
  };
}

export interface QueryGaps {
  readonly queryId: string;
  readonly p0: number | null;
  readonly p1: number | null;
  readonly p2: number | null;
  /** True when P2 produced no workable plan and fell back to the reference policy. */
  readonly p2FellBack: boolean;
  /** P2's outcome when it also handles realtime. */
  readonly p2rt: number | null;
}

export interface Calibration {
  readonly perQuery: readonly QueryGaps[];
  readonly meanP0: number;
  readonly meanP1: number;
  readonly meanP2: number;
  /** Total headroom available to any player. */
  readonly gapP0P1: number;
  /** What the declared conflicts cost a lazy integrator. */
  readonly gapP0P2: number;
  /** Whether integrating lazily even beats not integrating. Negative is a warning. */
  readonly gapP1P2: number;
  /**
   * The share of the available headroom that the declared conflicts take away
   * from a lazy integrator: `(P0−P2) / (P0−P1)`.
   *
   * Scale-free, and the right instrument for the question Phase 0 Gate 3 asks.
   * An absolute minute count says nothing without knowing how much headroom
   * existed in the first place; this says directly how much of the value that
   * integration could deliver is forfeited by doing it badly.
   *
   * 0.0 means the conflicts are decorative — a coordinate matcher reconciles
   * the world perfectly and all the difficulty is topology. 1.0 would mean a
   * lazy integrator gains nothing at all over not integrating.
   */
  readonly conflictShare: number;
  /** Queries where P2 produced no workable plan at all. */
  readonly p2Failures: number;
  /**
   * P2's shortfall when it *does* handle realtime perfectly.
   *
   * P2 as specified ignores realtime (`REFERENCE-POLICY.md` §2), which means it
   * is guaranteed to lose to a disrupted day whether or not any conflict
   * exists. That confounds the one question Gate 3 asks. This variant differs
   * from a careful integrator in **matching quality alone**, so whatever it
   * loses is attributable to reconciliation.
   */
  readonly gapP0P2rt: number;
  readonly comparable: number;
}

const accessFor = (w: World, queryId: string, endpoint: "origin" | "destination"): Access[] =>
  w.queryAccess
    .filter((a) => a.queryId === queryId && a.endpoint === endpoint)
    .map((a) => ({ quayId: a.quayId, seconds: Math.ceil(a.metres / w.manifest.walkSpeedMps) }))
    .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

function journeyOf(
  w: World,
  ix: RouterIndex,
  queryId: string,
  departAfterS: number,
  policy: "all" | "obvious",
): number | null {
  const r = route(
    ix,
    accessFor(w, queryId, "origin"),
    accessFor(w, queryId, "destination"),
    departAfterS,
    policy,
  );
  return r ? r.arriveS - departAfterS : null;
}

/**
 * Score a plan the naive player made *against the real world*.
 *
 * This is the whole point of P2, and getting it wrong is easy. P2 plans on a
 * model it built by fusing stops within a distance threshold. Two quays 80 m
 * apart become one, so in P2's model a transfer between them is instantaneous
 * and free. In the world it is an 80 m walk, and the connection it was counting
 * on may no longer be catchable.
 *
 * Evaluating P2 on its own model therefore measures its *beliefs*, and it will
 * cheerfully beat the oracle — which is impossible, and was exactly what the
 * first version of this file reported. A lazy integrator's advantage is
 * imaginary; reality charges for the difference. Measuring that difference is
 * what makes P2 informative once conflicts exist.
 */
function evaluateAgainstTruth(
  world: World,
  naive: World,
  legs: readonly { mode: string; fromQuay: string | null; toQuay: string | null; journeyId?: string }[],
  queryId: string,
  departAfterS: number,
  disruptions: readonly Disruption[],
): number | null {
  // Reality is not only geometry. A plan built on the published schedule also
  // does not know which of those services will not run, and charging it for the
  // walk while letting it ride a cancelled train would make it beat a
  // perfectly-informed planner — which is impossible, and is what happened the
  // first time disruptions were switched on.
  const cancelled = new Set(
    disruptions.filter((d) => d.kind === "cancellation").map((d) => d.journeyId),
  );
  const delayOf = new Map(
    disruptions.filter((d) => d.kind === "delay").map((d) => [d.journeyId, d.delayS]),
  );
  const naivePatterns = new Map(naive.patterns.map((p) => [p.id, p]));
  const realJourneys = new Map(world.journeys.map((j) => [j.id, j]));
  const realPatterns = new Map(world.patterns.map((p) => [p.id, p]));
  const walkSpeed = world.manifest.walkSpeedMps;

  // naive journey/pattern ids are `${operator}:${published trip id}`.
  const tripToJourney = new Map<string, string>();
  for (const op of world.manifest.operators) {
    for (const [trip, journey] of projectOperator(world, op.id, 0).resolution.tripToJourney) {
      tripToJourney.set(`${op.id}:${trip}`, journey);
    }
  }

  const access = (endpoint: "origin" | "destination", quayId: string): number | null => {
    const row = world.queryAccess.find(
      (a) => a.queryId === queryId && a.endpoint === endpoint && a.quayId === quayId,
    );
    return row ? Math.ceil(row.metres / walkSpeed) : null;
  };
  const walkBetween = (from: string, to: string): number | null => {
    if (from === to) return 0;
    const link = world.walkLinks.find((l) => l.fromQuay === from && l.toQuay === to);
    return link ? Math.ceil(link.metres / walkSpeed) : null;
  };

  let cursor = departAfterS;
  let atQuay: string | null = null;

  for (const leg of legs) {
    if (leg.mode !== "transit" || !leg.journeyId) continue;

    const realJourneyId = tripToJourney.get(leg.journeyId);
    const journey = realJourneyId ? realJourneys.get(realJourneyId) : undefined;
    const naivePattern = naivePatterns.get(leg.journeyId);
    if (!journey || !naivePattern) return null;
    const realPattern = realPatterns.get(journey.patternId);
    if (!realPattern) return null;

    // Same trip, same stop order — so a position in the naive pattern is the
    // same position in the real one.
    const boardIdx = naivePattern.stops.findIndex((s) => s.quayId === leg.fromQuay);
    const alightIdx = naivePattern.stops.findIndex((s) => s.quayId === leg.toQuay);
    if (boardIdx < 0 || alightIdx <= boardIdx) return null;

    const realBoard = realPattern.stops[boardIdx];
    const realAlight = realPattern.stops[alightIdx];
    if (!realBoard || !realAlight) return null;

    const cost =
      atQuay === null
        ? access("origin", realBoard.quayId)
        : walkBetween(atQuay, realBoard.quayId);
    if (cost === null) return null; // a transfer P2 imagined but cannot make
    cursor += cost;

    if (cancelled.has(journey.id)) return null; // it planned onto a service that never ran

    const delay = delayOf.get(journey.id) ?? 0;
    const departS = journey.startS + delay + realBoard.departOffsetS;
    if (departS < cursor) return null; // the walk it never accounted for lost it the connection
    cursor = journey.startS + delay + realAlight.arriveOffsetS;
    atQuay = realAlight.quayId;
  }

  if (atQuay === null) return null;
  const finalWalk = access("destination", atQuay);
  if (finalWalk === null) return null;

  return cursor + finalWalk - departAfterS;
}

/** Map real journey ids onto the naive world's `operator:trip` ids. */
function disruptionsForNaive(
  world: World,
  disruptions: readonly Disruption[],
): Disruption[] {
  const naiveIdOf = new Map<string, string>();
  for (const op of world.manifest.operators) {
    for (const [trip, journey] of projectOperator(world, op.id, 0).resolution.tripToJourney) {
      naiveIdOf.set(journey, `${op.id}:${trip}`);
    }
  }
  return disruptions
    .map((d) => {
      const id = naiveIdOf.get(d.journeyId);
      return id ? { ...d, journeyId: id } : null;
    })
    .filter((d): d is Disruption => d !== null);
}

export function calibrate(world: World): Calibration {
  // The day that actually happens, from the world seed.
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);

  // P0 knows everything: cancelled journeys are gone from its index and
  // delayed ones carry their delay. Nobody else gets that.
  const oracleIx = buildIndex(world, disruptions);
  // What P1 and P2 plan on: the published schedule, which does not know.
  const scheduleIx = buildIndex(world);

  const naive = naiveMergedWorld(world);
  const naiveIx = buildIndex(naive);
  // The same lazy model, but aware of the day. Isolates matching quality.
  const naiveRtIx = buildIndex(naive, disruptionsForNaive(world, disruptions));

  const perQuery: QueryGaps[] = world.queries.map((q) => {
    // P2 plans on its own merged model...
    const plan = route(
      naiveIx,
      accessFor(naive, q.id, "origin"),
      accessFor(naive, q.id, "destination"),
      q.departAfterS,
      "all",
    );
    // ...and is then charged for what actually happens.
    const p2 = plan
      ? evaluateAgainstTruth(
          world,
          naive,
          plan.legs.map((l) => ({
            mode: l.mode,
            fromQuay: l.fromQuay,
            toQuay: l.toQuay,
            ...(l.mode === "transit" ? { journeyId: l.journeyId } : {}),
          })),
          q.id,
          q.departAfterS,
          disruptions,
        )
      : null;

    // P1 plans on the schedule and is then *executed* against the real day,
    // discovering each failure by standing on a platform and replanning from
    // there. Judging it on its plan would measure what it believed.
    const p1Exec = executeReactively(
      world,
      scheduleIx,
      disruptions,
      accessFor(world, q.id, "origin"),
      accessFor(world, q.id, "destination"),
      q.departAfterS,
      "obvious",
    );
    const p1 = p1Exec.journeyS;

    // A lazy integrator that cannot produce a workable plan does not vanish —
    // the traveller falls back to the reference policy, exactly as they do
    // when a player declines (REFERENCE-POLICY.md §8).
    //
    // Excluding these from the mean instead would quietly drop P2's *worst*
    // outcomes, flattering the very baseline whose failures are being
    // measured. The first version of this file did exactly that.
    const fellBack = p2 === null && p1 !== null;

    const rtPlan = route(
      naiveRtIx,
      accessFor(naive, q.id, "origin"),
      accessFor(naive, q.id, "destination"),
      q.departAfterS,
      "all",
    );
    const p2rt = rtPlan
      ? evaluateAgainstTruth(
          world,
          naive,
          rtPlan.legs.map((l) => ({
            mode: l.mode,
            fromQuay: l.fromQuay,
            toQuay: l.toQuay,
            ...(l.mode === "transit" ? { journeyId: l.journeyId } : {}),
          })),
          q.id,
          q.departAfterS,
          disruptions,
        )
      : null;

    return {
      queryId: q.id,
      p0: journeyOf(world, oracleIx, q.id, q.departAfterS, "all"),
      p1,
      p2: fellBack ? p1 : p2,
      p2FellBack: fellBack,
      p2rt: p2rt ?? p1,
    };
  });

  const usable = perQuery.filter(
    (g) => g.p0 !== null && g.p1 !== null && g.p2 !== null && g.p2rt !== null,
  );
  const mean = (pick: (g: QueryGaps) => number | null): number =>
    usable.length === 0 ? 0 : usable.reduce((a, g) => a + pick(g)!, 0) / usable.length;

  const meanP0 = mean((g) => g.p0);
  const meanP1 = mean((g) => g.p1);
  const meanP2 = mean((g) => g.p2);
  const meanP2rt = mean((g) => g.p2rt);

  return {
    perQuery,
    meanP0,
    meanP1,
    meanP2,
    gapP0P1: meanP1 - meanP0,
    gapP0P2: meanP2 - meanP0,
    gapP1P2: meanP1 - meanP2,
    conflictShare: meanP1 - meanP0 === 0 ? 0 : (meanP2 - meanP0) / (meanP1 - meanP0),
    p2Failures: perQuery.filter((g) => g.p2FellBack).length,
    gapP0P2rt: meanP2rt - meanP0,
    comparable: usable.length,
  };
}

// ---------------------------------------------------------------- ablation

/**
 * Conflict names to the manifest setting that produces them, and the value
 * that would switch it off. Mirrors `tools/worldbuild/build.py`.
 */
const CONFLICT_SETTINGS: Record<string, [string, string, unknown]> = {
  "A-granularity": ["identity", "granularity", "quay"],
  "A-id-scheme": ["identity", "id_scheme", "prefixed"],
  "A-naming": ["naming", "variant", "official"],
  "A-coordinate-precision": ["geometry", "precision", 6],
  "A-coordinate-source": ["geometry", "source", "quay"],
  "C-coordinate-offset": ["geometry", "offset_m", 0],
  "C-latlon-order": ["geometry", "latlon_order", "lat_lon"],
  "B-time-encoding": ["time", "encoding", "iso_offset"],
  "D-staleness": ["realtime", "staleness_s", 0],
  "D-silent-cancellation": ["realtime", "cancellations", "explicit"],
  "C-delay-unit": ["realtime", "delay_unit", "seconds"],
  "D-no-delays": ["realtime", "publishes_delays", true],
};

/** A copy of the world with *every* declared conflict switched off. */
function withNoConflicts(world: World): World {
  let out = world;
  for (const c of world.manifest.activeConflicts) out = without(out, c) ?? out;
  return out;
}

/** A copy of the world with one declared conflict switched off. */
function without(world: World, conflict: string): World | null {
  const [name, operatorId] = conflict.split(":");
  const setting = CONFLICT_SETTINGS[name ?? ""];
  if (!setting || !operatorId) return null;
  const [group, key, def] = setting;

  const operators = world.manifest.operators.map((o) => {
    if (o.id !== operatorId) return o;
    const m = structuredClone(o.manifest) as Record<string, Record<string, unknown>>;
    if (!m[group]) return o;
    m[group]![key] = def;
    return { ...o, manifest: m };
  });

  return { ...world, manifest: { ...world.manifest, operators } };
}

export interface AblationEntry {
  readonly conflict: string;
  /** Seconds of P2's loss this conflict is responsible for. */
  readonly costS: number;
}

export interface AblationReport {
  readonly baselineGapS: number;
  /**
   * The lazy integrator's shortfall in a world with **every declared conflict
   * switched off**.
   *
   * The number Gate 3 actually turns on. Whatever remains here is not caused by
   * semantic conflict at all — it is the cost of the day going wrong, which a
   * player must handle whether or not any operator misbehaves.
   */
  readonly cleanGapS: number;
  readonly entries: readonly AblationEntry[];
  readonly attributedS: number;
  readonly residualS: number;
}

/**
 * Stage-two attribution: what each declared conflict actually costs.
 *
 * Neutralise one conflict, recompute the lazy integrator, and measure how much
 * of its shortfall disappears. The delta *is* that conflict's contribution.
 *
 * Opt-in, because the cost scales with the conflict count (SCORING.md §10) —
 * but it is the only instrument that answers Phase 0's Gate 3 directly, rather
 * than by proxy.
 */
export function ablate(world: World): AblationReport {
  // Measured on the realtime-aware lazy integrator, so what is left when the
  // conflicts are switched off is reconciliation cost and nothing else.
  const base = calibrate(world);
  const clean = withNoConflicts(world);
  const cleanGap = calibrate(clean).gapP0P2rt;

  // **Leave-one-in, not leave-one-out.** Removing a single conflict attributes
  // almost nothing here, and that is a true fact about the world rather than a
  // broken measurement: the defects are jointly redundant. Take away the
  // coordinate offset and a lazy integrator still trips over colliding
  // identifiers; take away those and it still misreads the timestamps. Each is
  // individually unnecessary and collectively sufficient, so leave-one-out
  // reports zero for all of them.
  //
  // Switching everything off and then adding one back measures what each
  // defect can do *on its own*. The shares will over-sum, because a cost two
  // conflicts would each have caused alone is counted twice — that overlap is
  // the redundancy itself, and it is worth seeing rather than hiding.
  const entries: AblationEntry[] = [];
  for (const conflict of world.manifest.activeConflicts) {
    const setting = CONFLICT_SETTINGS[(conflict.split(":")[0] ?? "")];
    if (!setting) continue; // cross-operator conflicts have no single setting

    const [group, key] = setting;
    const [, operatorId] = conflict.split(":");
    const original = world.manifest.operators.find((o) => o.id === operatorId);
    if (!original) continue;
    const live = (original.manifest as Record<string, Record<string, unknown>>)[group]?.[key];

    const operators = clean.manifest.operators.map((o) => {
      if (o.id !== operatorId) return o;
      const m = structuredClone(o.manifest) as Record<string, Record<string, unknown>>;
      if (m[group]) m[group]![key] = live;
      return { ...o, manifest: m };
    });
    const only = { ...clean, manifest: { ...clean.manifest, operators } };

    entries.push({ conflict, costS: calibrate(only).gapP0P2rt - cleanGap });
  }

  entries.sort((a, b) => b.costS - a.costS);
  const attributed = entries.reduce((a, e) => a + Math.max(0, e.costS), 0);

  return {
    baselineGapS: base.gapP0P2rt,
    cleanGapS: cleanGap,
    entries,
    attributedS: attributed,
    residualS: base.gapP0P2 - attributed,
  };
}
