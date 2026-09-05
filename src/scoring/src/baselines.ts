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
import {
  buildIndex,
  route,
  executeReactively,
  MAX_REPLANS,
  type Access,
  type RouterIndex,
} from "@tns/router";
import { generateDisruptions } from "@tns/core";
import { projectOperator, type Timetable } from "@tns/projections";
import type { Disruption } from "@tns/core";
import { believedDisruptionsAt, NAIVE_POLL_CADENCE_S } from "./belief.ts";

/** How close two published stops must be for a lazy matcher to fuse them. */
/**
 * The widest a lazy integrator's coordinate matcher can be without fusing two
 * places the world says are different.
 *
 * Derived from the world rather than fixed, and that is the whole point. The
 * old constant was 120 m, chosen as a plausible-looking guess. This city has 19
 * pairs of genuinely distinct quays closer together than that — the nearest 31 m
 * apart — so the matcher fused 34 canonical quays into 19 stops *before any
 * conflict was applied*, and a conflict-free world came out harder than the
 * declared one (`KNOWN-ISSUES.md` #14).
 *
 * Worse, it decided which conflicts were visible at all. A matcher that cannot
 * separate quays 31 m apart cannot notice a 60 m coordinate offset, so the
 * offset had to be pushed past 260 m before it cost anything — well past the
 * point where it stops describing two operators disagreeing and starts
 * describing a broken map. "How strong must this conflict be" was really "how
 * far past 120 m", which is a fact about the instrument.
 *
 * A baseline used for attribution must be **exactly right when there is nothing
 * to reconcile**, or whatever it loses to its own crudeness is charged to the
 * conflicts. So: the largest threshold that never merges two distinct quays.
 *
 * This is calibration of the instrument, not of the world. It uses canonical
 * geometry, which no player may see — legitimate here because P2 is a ruler
 * rather than a competitor, and stated plainly so nobody mistakes it for a
 * strategy a player could adopt.
 */
export function naiveMatchThresholdM(world: World): number {
  let closest = Infinity;
  for (let i = 0; i < world.quays.length; i++) {
    for (let j = i + 1; j < world.quays.length; j++) {
      const a = world.quays[i]!;
      const b = world.quays[j]!;
      closest = Math.min(closest, roughMetres(a.lat, a.lon, b.lat, b.lon));
    }
  }
  if (!Number.isFinite(closest)) return 30;
  // Strictly below the closest genuine pair, and never absurd in either
  // direction. A world whose quays sit metres apart cannot be reconciled by
  // geometry at all, and that is a finding rather than a threshold to tune.
  return Math.max(5, Math.min(120, Math.floor(closest) - 1));
}

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
export function naiveMergedWorld(world: World, thresholdM?: number): World {
  const threshold = thresholdM ?? naiveMatchThresholdM(world);
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
      if (roughMetres(a.lat, a.lon, b.lat, b.lon) <= threshold) {
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
  /** The optimum available knowing only what had been announced at plan time. */
  readonly p0a: number | null;
  /** True when P2rt produced no workable plan of its own and took P1's outcome. */
  readonly p2rtFellBack: boolean;
  /** True when P0-announced produced no plan that survived the day. */
  readonly p0aFellBack: boolean;
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
  /**
   * The clairvoyance term: what P0 gains purely by knowing about disruptions
   * before anyone announced them.
   *
   * Unreachable by any player, by construction. Reported so it can never again
   * be silently counted as difficulty the conflicts were supposed to cause.
   */
  readonly gapP0P0a: number;
  /**
   * **The instrument Gate 3 is measured on.** A lazy integrator's shortfall
   * against an optimum held to the *same* announcement horizon, so the two
   * differ in reconciliation quality and nothing else.
   *
   * `gapP0P2rt` divides by a gap that also contains `gapP0P0a`, and at this
   * world's 30-minute planning lead that term is the larger of the two. It made
   * conflicts look like 4 % of the problem when measured against a matched
   * reference they are roughly a third of it.
   */
  readonly gapP0aP2rt: number;
  /** Queries where P0-announced had no plan survive, and fell back to P1. */
  readonly p0aFailures: number;
  /** Queries where the lazy integrator had no workable plan of its own. */
  readonly p2rtFailures: number;
  /** How many queries `gapP0aP2rt` is averaged over. */
  readonly attributable: number;
  readonly comparable: number;
}

/** The better of two journey times, either of which may be missing. */
function bestOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

/** Mirrors the harness: travellers ask for a plan well before they set out. */
export const PLAN_LEAD_S = 1800;

export interface CalibrateOptions {
  /**
   * How far ahead of departure the lazy baselines plan, in seconds.
   *
   * Exposed because it is not a detail — it is the single assumption that
   * decides how much of a lazy integrator's shortfall is *information* it could
   * not have had yet, as opposed to work it did badly. Setting it to 0 plans at
   * the moment of departure, when everything announceable has been announced,
   * and what remains is no longer an information gap.
   */
  readonly planLeadS?: number;
  /**
   * How close two published stops must be before the lazy baseline calls them
   * the same place.
   *
   * Injectable because it is not a detail of the baseline — it decides which
   * conflict magnitudes are visible at all. A matcher fusing at 120 m cannot
   * notice a 60 m coordinate offset, so the offset has to be pushed past 260 m
   * before it costs anything, which is well past the point where it stops
   * describing a real disagreement and starts describing a broken map.
   */
  readonly matchThresholdM?: number;
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
/**
 * Which id space a plan's legs are written in.
 *
 * Two different planners are evaluated against the same truth here, and they do
 * not speak the same identifiers. A lazy integrator plans on its merged model,
 * where a journey is `${operator}:${published trip}`; an optimum plans on the
 * canonical world, where a journey is a journey. Leaving that implicit is how
 * an evaluator silently accepts a plan it cannot actually resolve and returns
 * `null` for reasons that look like the plan failing.
 */
interface PlanSpace {
  /** The canonical journey a plan's leg refers to. */
  readonly canonicalJourneyId: (planJourneyId: string) => string | undefined;
  /** The stop sequence the plan indexed into, for locating board and alight. */
  readonly planStops: (planJourneyId: string) => readonly { readonly quayId: string }[] | undefined;
}

/** Plans written in a lazy integrator's merged id space. */
function naivePlanSpace(world: World, naive: World): PlanSpace {
  const patterns = new Map(naive.patterns.map((pt) => [pt.id, pt]));
  const tripToJourney = new Map<string, string>();
  for (const op of world.manifest.operators) {
    for (const [trip, journey] of projectOperator(world, op.id, 0).resolution.tripToJourney) {
      tripToJourney.set(`${op.id}:${trip}`, journey);
    }
  }
  return {
    canonicalJourneyId: (id) => tripToJourney.get(id),
    planStops: (id) => patterns.get(id)?.stops,
  };
}

/** Plans written in canonical world ids — what an optimum produces. */
function canonicalPlanSpace(world: World): PlanSpace {
  const journeys = new Map(world.journeys.map((j) => [j.id, j]));
  const patterns = new Map(world.patterns.map((pt) => [pt.id, pt]));
  return {
    canonicalJourneyId: (id) => (journeys.has(id) ? id : undefined),
    planStops: (id) => {
      const j = journeys.get(id);
      return j ? patterns.get(j.patternId)?.stops : undefined;
    },
  };
}

/** A leg as a planner expresses it, in its own id space. */
interface PlanLeg {
  readonly mode: string;
  readonly fromQuay: string | null;
  readonly toQuay: string | null;
  readonly journeyId?: string;
}

/**
 * Route onward from where a broken plan left the traveller.
 *
 * `fromPlanQuay` is in the planner's *own* id space, because that is the only
 * name it has for the place it is standing; `atS` is when it is standing there,
 * which bounds what it can have been told. Both baselines replan on the same
 * budget the reference policy gets (`MAX_REPLANS`), so none of them is being
 * compared against a traveller held to a different rule.
 *
 * Added at P0M7. Without it every baseline planned once and was charged for
 * everything that happened afterwards, which suppressed the thing Gate 3
 * measures: a planner with almost nothing to reconcile cannot be punished for
 * reconciling badly (`KNOWN-ISSUES.md` #1).
 */
type Replanner = (fromPlanQuay: string, atS: number) => readonly PlanLeg[] | null;

/**
 * Carry on under the reference policy from where a planner gave up.
 *
 * `fromQuay` is *canonical*, because this is the world moving a traveller, not
 * a planner reasoning about one. Returns the total door-to-door seconds.
 *
 * This replaces charging a stuck baseline P1's whole-journey outcome, which was
 * sound while nobody could replan and became incoherent the moment they could:
 * being rescued from the origin was frequently *better* than routing onward,
 * so failing outscored trying and the conflict-free world measured harder than
 * the declared one. A stranded traveller resumes from where they are standing —
 * the same rule the harness applies to a player's traveller.
 */
type Resume = (fromQuay: string, atS: number) => number | null;

function evaluateAgainstTruth(
  world: World,
  space: PlanSpace,
  legs: readonly { mode: string; fromQuay: string | null; toQuay: string | null; journeyId?: string }[],
  queryId: string,
  departAfterS: number,
  disruptions: readonly Disruption[],
  replan?: Replanner,
  resume?: Resume,
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
  const realJourneys = new Map(world.journeys.map((j) => [j.id, j]));
  const realPatterns = new Map(world.patterns.map((p) => [p.id, p]));
  const walkSpeed = world.manifest.walkSpeedMps;

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
  // The same place, in the id space the *plan* is written in. A lazy
  // integrator standing at canonical quay `q-central-2` is, to itself, standing
  // at `merged-0007`, and that is the only name it can plan from.
  let atPlanQuay: string | null = null;
  let attempts = 0;
  let queue: readonly PlanLeg[] = legs;

  // The traveller is stuck at `atQuay` at `cursor`. Ask this planner to route
  // onward with whatever it knows *now*. Returns false when it cannot, or when
  // it has used up the same replan budget the reference policy gets.
  // Out of ideas: travel on as anyone would with no integration layer at all.
  const giveUp = (): number | null =>
    resume && atQuay !== null ? resume(atQuay, cursor) : null;

  const tryReplan = (): boolean => {
    if (!replan || atPlanQuay === null || attempts >= MAX_REPLANS) return false;
    attempts++;
    const next = replan(atPlanQuay, cursor);
    if (!next || next.length === 0) return false;
    queue = next;
    return true;
  };

  for (let i = 0; i < queue.length; i++) {
    const leg = queue[i]!;
    if (leg.mode !== "transit" || !leg.journeyId) continue;

    const realJourneyId = space.canonicalJourneyId(leg.journeyId);
    const journey = realJourneyId ? realJourneys.get(realJourneyId) : undefined;
    const planStops = space.planStops(leg.journeyId);
    if (!journey || !planStops) return null;
    const realPattern = realPatterns.get(journey.patternId);
    if (!realPattern) return null;

    // Same trip, same stop order — so a position in the plan's pattern is the
    // same position in the real one.
    const boardIdx = planStops.findIndex((s) => s.quayId === leg.fromQuay);
    const alightIdx = planStops.findIndex((s) => s.quayId === leg.toQuay);
    if (boardIdx < 0 || alightIdx <= boardIdx) return null;

    const realBoard = realPattern.stops[boardIdx];
    const realAlight = realPattern.stops[alightIdx];
    if (!realBoard || !realAlight) return null;

    const cost =
      atQuay === null
        ? access("origin", realBoard.quayId)
        : walkBetween(atQuay, realBoard.quayId);
    // A transfer this planner imagined but cannot make. It is standing where
    // the last leg left it, so it may try again from there.
    if (cost === null) {
      if (tryReplan()) { i = -1; continue; }
      return giveUp();
    }
    cursor += cost;
    atQuay = realBoard.quayId;
    atPlanQuay = leg.fromQuay;

    // It planned onto a service that never ran. It finds out by standing on the
    // platform until the departure it was promised does not happen — the wait
    // is real and is charged (REFERENCE-POLICY.md §4.3).
    if (cancelled.has(journey.id)) {
      cursor = Math.max(cursor, journey.startS + realBoard.departOffsetS);
      if (tryReplan()) { i = -1; continue; }
      return giveUp();
    }

    const delay = delayOf.get(journey.id) ?? 0;
    const departS = journey.startS + delay + realBoard.departOffsetS;
    // The walk it never accounted for lost it the connection.
    if (departS < cursor) {
      if (tryReplan()) { i = -1; continue; }
      return giveUp();
    }
    cursor = journey.startS + delay + realAlight.arriveOffsetS;
    atQuay = realAlight.quayId;
    atPlanQuay = leg.toQuay;
  }

  if (atQuay === null) return null;
  const finalWalk = access("destination", atQuay);
  if (finalWalk === null) return null;

  return cursor + finalWalk - departAfterS;
}

/** Map real journey ids onto the naive world's `operator:trip` ids. */

export function calibrate(world: World, options: CalibrateOptions = {}): Calibration {
  const planLeadS = options.planLeadS ?? PLAN_LEAD_S;
  // The day that actually happens, from the world seed.
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);

  // P0 knows everything: cancelled journeys are gone from its index and
  // delayed ones carry their delay. Nobody else gets that.
  const oracleIx = buildIndex(world, disruptions);
  // What P1 and P2 plan on: the published schedule, which does not know.
  const scheduleIx = buildIndex(world);

  const naive = naiveMergedWorld(world, options.matchThresholdM);
  const naiveIx = buildIndex(naive);
  const naiveSpace = naivePlanSpace(world, naive);
  const canonicalSpace = canonicalPlanSpace(world);

  // Both per-query planners rebuild an index from a disruption set. Many
  // queries share a set, so cache on its identity rather than rebuilding.
  const indexCache = new Map<string, ReturnType<typeof buildIndex>>();
  const indexFor = (w: World, tag: string, ds: readonly Disruption[]) => {
    const key = `${tag}|${ds.map((d) => `${d.journeyId}:${d.kind}:${d.delayS}`).join(",")}`;
    let ix = indexCache.get(key);
    if (!ix) {
      ix = buildIndex(w, ds);
      indexCache.set(key, ix);
    }
    return ix;
  };

  // Belief is built by replaying polls in order, so every query's planning
  // instant is snapshotted from a single walk of the feeds rather than one
  // walk each. The conflict-depth probe calibrates eighty-odd worlds and
  // would otherwise spend nearly all its time re-reading the same feed.
  const beliefs = believedDisruptionsAt(
    world,
    disruptions,
    world.queries.map((q) => q.departAfterS - planLeadS),
  );

  // A traveller can be stranded at any instant, and what it believes then is
  // not what it believed when it planned. Rather than replaying the morning per
  // break, snapshot belief on the poll cadence once and look up by flooring —
  // which is also honest, since a reader polling every five minutes learns
  // nothing between polls.
  const GRID_START_S = 6 * 3600;
  const GRID_END_S = 26 * 3600;
  const gridTaus: number[] = [];
  for (let t = GRID_START_S; t <= GRID_END_S; t += NAIVE_POLL_CADENCE_S) gridTaus.push(t);
  const beliefGrid = believedDisruptionsAt(world, disruptions, gridTaus);
  const beliefAt = (t: number): readonly Disruption[] => {
    const i = Math.floor((t - GRID_START_S) / NAIVE_POLL_CADENCE_S);
    return beliefGrid[Math.max(0, Math.min(beliefGrid.length - 1, i))]!;
  };
  const announcedAt = (t: number): readonly Disruption[] =>
    disruptions.filter((d) => d.announcedAtS <= t);

  const legsOf = (plan: { legs: readonly { mode: string; fromQuay: string | null; toQuay: string | null; journeyId?: string }[] } | null) =>
    plan
      ? plan.legs.map((l) => ({
          mode: l.mode,
          fromQuay: l.fromQuay,
          toQuay: l.toQuay,
          ...(l.mode === "transit" ? { journeyId: l.journeyId } : {}),
        }))
      : null;

  const perQuery: QueryGaps[] = world.queries.map((q, qi) => {
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
          naiveSpace,
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

    // What a lazy integrator *believes*, having polled the published feeds up
    // to the moment it plans. Not the truth: it reads delays at face value,
    // assumes an absent trip is running, and takes a stale feed for the
    // present. Handing it the truth instead — as an earlier version did —
    // made every catalogue D conflict cost it exactly nothing, because it was
    // never reading a feed to be misled by.
    const rtPlan = route(
      indexFor(naive, "naive", beliefs[qi]!),
      accessFor(naive, q.id, "origin"),
      accessFor(naive, q.id, "destination"),
      q.departAfterS,
      "all",
    );
    // Stranded, the lazy integrator re-reads its feeds and routes on from where
    // it is standing — believing, as ever, exactly what it is told.
    const resumeFrom: Resume = (fromQuay, atS) => {
      const exec = executeReactively(
        world,
        scheduleIx,
        disruptions,
        [{ quayId: fromQuay, seconds: 0 }],
        accessFor(world, q.id, "destination"),
        atS,
        "obvious",
      );
      return exec.journeyS === null ? null : atS - q.departAfterS + exec.journeyS;
    };

    const p2rtReplan: Replanner = (fromPlanQuay, atS) =>
      legsOf(
        route(
          indexFor(naive, "naive", beliefAt(atS)),
          [{ quayId: fromPlanQuay, seconds: 0 }],
          accessFor(naive, q.id, "destination"),
          atS,
          "all",
        ),
      );

    const p2rt = rtPlan
      ? evaluateAgainstTruth(
          world,
          naiveSpace,
          rtPlan.legs.map((l) => ({
            mode: l.mode,
            fromQuay: l.fromQuay,
            toQuay: l.toQuay,
            ...(l.mode === "transit" ? { journeyId: l.journeyId } : {}),
          })),
          q.id,
          q.departAfterS,
          disruptions,
          p2rtReplan,
          resumeFrom,
        )
      : null;

    // P0-announced: the best a *perfect* integrator could have done knowing
    // only what had been announced when it planned. Same world, same optimal
    // router, same planning instant as P2rt — so the only thing separating them
    // is reconciliation, which is precisely the question Gate 3 asks.
    //
    // P0 itself stays clairvoyant, because the score needs a fixed reference
    // and REFERENCE-POLICY.md §2 defines one. But P0 knows about a cancellation
    // before it is announced, and dividing by a gap containing that advantage
    // measures the oracle's foresight as though it were the world's difficulty.
    const planTau = q.departAfterS - planLeadS;
    const announced = disruptions.filter((d) => d.announcedAtS <= planTau);
    const aPlan = route(
      indexFor(world, "canon", announced),
      accessFor(world, q.id, "origin"),
      accessFor(world, q.id, "destination"),
      q.departAfterS,
      "all",
    );
    const p0aReplan: Replanner = (fromPlanQuay, atS) =>
      legsOf(
        route(
          indexFor(world, "canon", announcedAt(atS)),
          [{ quayId: fromPlanQuay, seconds: 0 }],
          accessFor(world, q.id, "destination"),
          atS,
          "all",
        ),
      );

    const p0a = aPlan
      ? evaluateAgainstTruth(
          world,
          canonicalSpace,
          aPlan.legs.map((l) => ({
            mode: l.mode,
            fromQuay: l.fromQuay,
            toQuay: l.toQuay,
            ...(l.mode === "transit" ? { journeyId: l.journeyId } : {}),
          })),
          q.id,
          q.departAfterS,
          disruptions,
          p0aReplan,
          resumeFrom,
        )
      : null;

    return {
      queryId: q.id,
      p0: journeyOf(world, oracleIx, q.id, q.departAfterS, "all"),
      p1,
      p2: fellBack ? p1 : p2,
      p2FellBack: fellBack,
      p2rt: p2rt ?? p1,
      p2rtFellBack: p2rt === null,
      // **An optimum must dominate every achievable strategy**, and P1 is one:
      // it plans on the bare schedule with no disruption knowledge at all, which
      // is strictly less than "everything announced by now". So where P1 does
      // better, P1's outcome *is* the announcement-limited optimum, and a P0a
      // that ignored it would not be a bound.
      //
      // This is not a fudge to keep a gap positive. It was found because the gap
      // went negative — P2rt failed, fell back to P1, and beat the reference it
      // was being measured against, which is impossible for a real optimum and
      // meant the construction was under-powered. `matched-reference.test.ts`
      // now asserts the domination directly.
      // **Tightened at P0M10 to include every achievable strategy computed
      // here, not only P1.** An optimum must dominate anything a real solver
      // can do, and `P2rt` is one: it reads published feeds, merges them badly
      // and replans. On `q15` it beat `P0a` outright, which is impossible for a
      // bound and merely embarrassing for a strategy (KNOWN-ISSUES.md #15).
      //
      // This does not make `P0a` a proven bound — the true optimum over
      // announcement-limited strategies is a planning problem over belief
      // states — but it removes every case where something we *already compute*
      // outperforms the reference that is supposed to cap it. Since P0M10 that
      // reference is also `capture`'s denominator, so a loose one inflates
      // every score.
      p0a: bestOf(bestOf(p0a, p1), p2rt),
      p0aFellBack: p0a === null,
    };
  });

  const usable = perQuery.filter(
    (g) =>
      g.p0 !== null && g.p1 !== null && g.p2 !== null && g.p2rt !== null && g.p0a !== null,
  );
  const mean = (pick: (g: QueryGaps) => number | null): number =>
    usable.length === 0 ? 0 : usable.reduce((a, g) => a + pick(g)!, 0) / usable.length;

  const meanP0 = mean((g) => g.p0);
  const meanP1 = mean((g) => g.p1);
  const meanP2 = mean((g) => g.p2);
  const meanP2rt = mean((g) => g.p2rt);
  const meanP0a = mean((g) => g.p0a);

  // **Gate 3's gap is measured only where the lazy integrator answered for
  // itself.** A P2rt with no workable plan is charged P1's outcome, which is
  // right for scoring — a failed integration layer leaves you travelling as if
  // there were none — and ruinous for attribution, because P1 is frequently
  // *better* than what P2rt manages by trying. Once the baselines could replan
  // (P0M7), that rescue inverted the measurement: the conflict-free world
  // looked harder than the declared one, because the declared one failed more
  // often and kept being rescued.
  //
  // So the two are compared on the population where both routed themselves,
  // and the rescues are counted rather than averaged in.
  const own = usable.filter((g) => !g.p2rtFellBack);
  const ownMean = (pick: (g: QueryGaps) => number | null): number =>
    own.length === 0 ? 0 : own.reduce((a, g) => a + pick(g)!, 0) / own.length;

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
    gapP0P0a: meanP0a - meanP0,
    gapP0aP2rt: ownMean((g) => g.p2rt) - ownMean((g) => g.p0a),
    p2rtFailures: perQuery.filter((g) => g.p2rtFellBack).length,
    attributable: own.length,
    p0aFailures: perQuery.filter((g) => g.p0aFellBack).length,
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
/**
 * Conflicts that change *which entities exist* rather than their values.
 *
 * Held constant when attributing. A lazy solver's error rate scales with how
 * much data it is given, so a comparison that changes the number of published
 * stops varies the opportunity set and the difficulty at once and cannot
 * attribute to either (`KNOWN-ISSUES.md` #14). Switching every conflict off,
 * granularity included, made this world's naive player score *better* — the
 * conflict-free world offered it 21 apparent interchanges within its transfer
 * radius against the declared world's 11, and it is bad at transfers.
 *
 * Value-level conflicts are not held constant, and must not be: a coordinate
 * offset moves stops and so changes which pairs look like interchanges, but
 * that is precisely how a geometric conflict acts on a geometric solver.
 * Holding it constant would hold the conflict constant.
 */
export const STRUCTURAL_CONFLICTS: ReadonlySet<string> = new Set(["A-granularity"]);

function withNoConflicts(world: World): World {
  let out = world;
  for (const c of world.manifest.activeConflicts) {
    if (STRUCTURAL_CONFLICTS.has(c.split(":")[0] ?? "")) continue;
    out = without(out, c) ?? out;
  }
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
  /** Total headroom, P0-P1 — what conflict cost should be judged against. */
  readonly headroomS: number;
  /** P0's unreachable foresight advantage, excluded from the measurement. */
  readonly clairvoyanceS: number;
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
/**
 * One world per declared conflict, each with that conflict alone switched on.
 *
 * Shared by ablation and the symptom check so the two cannot drift apart: a
 * conflict that ablation scores and the symptom check never builds — or the
 * reverse — would let a world pass one instrument for reasons the other never
 * saw. Cross-operator conflicts such as `A-id-collision` have no single
 * manifest setting and are skipped by both, identically.
 */
/** How many calibrations `ablate` will run, for sizing a progress bar. */
export function ablateStepCount(world: World, seeds = 1): number {
  return (2 + conflictVariants(world).length) * Math.max(1, seeds);
}

export function conflictVariants(world: World): { conflict: string; world: World }[] {
  const clean = withNoConflicts(world);
  const out: { conflict: string; world: World }[] = [];

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
    out.push({ conflict, world: { ...clean, manifest: { ...clean.manifest, operators } } });
  }
  return out;
}

export function ablate(
  world: World,
  seeds = 1,
  /** Report-only, called once per calibration. Must not influence the result. */
  onStep?: (label: string) => void,
): AblationReport {
  // Fixed offsets, so a re-run compares like with like. Averaging matters here
  // for the reason P0M9 measured: with only the disruptions changing, conflict
  // cost varies by 36 % of its own mean, which is larger than the differences
  // between most of the conflicts being attributed.
  const seedList = Array.from({ length: Math.max(1, seeds) }, (_, i) => world.manifest.seed + i * 7919);
  const meanGap = (w: World, label = ""): number => {
    const xs = seedList.map((seed) => {
      const gap = calibrate({ ...w, manifest: { ...w.manifest, seed } }).gapP0aP2rt;
      onStep?.(label);
      return gap;
    });
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  };
  // Measured on the realtime-aware lazy integrator against an optimum held to
  // the *same* announcement horizon (`gapP0aP2rt`), so what is left when the
  // conflicts are switched off is reconciliation cost and nothing else.
  //
  // Measuring against clairvoyant P0 instead — as this did until P1M0 — puts
  // the oracle's foresight in the denominator. At a 30-minute planning lead
  // that term is roughly twenty times the conflict term, so it reported
  // conflicts at 4 % of a shortfall most of which no player could ever recover.
  const base = calibrate(world);
  // Value-level conflicts off, entity set left as declared. Switching
  // granularity off as well changes how many stops exist, and a lazy solver
  // given more stops finds more apparent interchanges to get wrong — which
  // varies the opportunity set and the difficulty together (KNOWN-ISSUES.md #14).
  const baseGap = meanGap(world, "declared world");
  const clean = withNoConflicts(world);
  const cleanGap = meanGap(clean, "honest values");

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
  for (const { conflict, world: only } of conflictVariants(world)) {
    entries.push({ conflict, costS: meanGap(only, conflict) - cleanGap });
  }

  entries.sort((a, b) => b.costS - a.costS);
  const attributed = entries.reduce((a, e) => a + Math.max(0, e.costS), 0);

  return {
    baselineGapS: baseGap,
    cleanGapS: cleanGap,
    headroomS: base.gapP0P1,
    clairvoyanceS: base.gapP0P0a,
    entries,
    attributedS: attributed,
    residualS: base.gapP0P2 - attributed,
  };
}
