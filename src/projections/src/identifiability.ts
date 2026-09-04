// The identifiability audit — Gate 1a.
//
// Specification: PHASES.md, Gate 1a.
//
// **The dual of the defect audit.** That one confirms the declared conflicts
// are present; this one confirms they have not made the world impossible.
//
// `P0a` establishes that a good outcome is *reachable* — but it is handed the
// canonical world, so it proves "if you reconcile perfectly, you do well" and
// says nothing about whether reconciliation is possible from what was
// published. A world can be simultaneously solvable-in-principle and unfair,
// and until P0M10 nothing detected that.
//
// The check needs no solver, only the data: where two canonical places produce
// *identical published observations across every operator and every field*, no
// amount of skill separates them. That is not difficulty, it is an unanswerable
// question — and the walking distance between such places is a cost no solver
// can predict and every solver pays.

import type { World } from "@tns/schema";
import { projectOperator } from "./project.ts";

/** One canonical quay as the world's operators actually describe it. */
interface Observation {
  readonly quayId: string;
  /** Every published field that refers to this quay, sorted and flattened. */
  readonly signature: string;
}

export interface AmbiguousGroup {
  /** Canonical quays no published data can tell apart. */
  readonly quayIds: readonly string[];
  /** What every one of them looks like from outside. */
  readonly signature: string;
  /** Metres between the two furthest-apart members. */
  readonly spreadM: number;
  /**
   * Seconds of walking a solver cannot predict, because it cannot know which
   * member of the group it is being sent to.
   */
  readonly unpredictableS: number;
  /** Scored queries with any member of this group within walking distance. */
  readonly reachableByQueries: number;
}

export interface IdentifiabilityReport {
  readonly quaysExamined: number;
  readonly groups: readonly AmbiguousGroup[];
  /** Quays that share their published description with at least one other. */
  readonly ambiguousQuays: number;
  /**
   * The largest walk any single ambiguity can hide, in seconds.
   *
   * A lower bound on what an ambiguity can cost a traveller once, not a
   * prediction of what it costs across a run — deliberately, because a bound
   * that needs the query set to compute is a bound about the query set.
   */
  readonly worstUnpredictableS: number;
  /**
   * The worst cost the ambiguity can impose **across the scored population**,
   * rather than on the one traveller who suffers most.
   *
   * The per-traveller worst case compared against mean headroom is a
   * comparison between a maximum and an average, and it overstated this world's
   * ambiguity by a factor of six the first time it was reported. An ambiguity
   * nobody can reach costs nothing however wide it is.
   */
  readonly worstAggregateS: number;
  readonly scoredQueries: number;
}

/**
 * Distance in metres using only `+ - * / sqrt`.
 *
 * Not haversine: `Math.sin`/`cos` differ in their last bits between V8
 * versions, and a pair sitting on a threshold would then be reported as
 * ambiguous on one machine and not on another. See CLAUDE.md, determinism.
 */
function metres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dy = (aLat - bLat) * 111_320;
  const dx = (aLon - bLon) * 111_320 * 0.64;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Which canonical quays the published data cannot tell apart.
 *
 * A quay's signature is every published observation of it, from every
 * operator: the stop id, the name and the coordinates as that operator states
 * them. Two quays with identical signatures are indistinguishable to anybody
 * reading only what was published.
 *
 * Note what is deliberately *not* a distinguishing feature: which trips call
 * there. An operator publishing at Site granularity names one stop for three
 * platforms, and its trips call at that stop — so the trips separate the
 * platforms no better than the stop does. Treating the calling pattern as
 * distinguishing would report the world as fair on the strength of information
 * the player cannot act on.
 */
export function auditIdentifiability(world: World, tau = 0): IdentifiabilityReport {
  const observed = new Map<string, string[]>();

  for (const op of world.manifest.operators) {
    const { timetable, resolution } = projectOperator(world, op.id, tau);
    const byStop = new Map(timetable.stops.map((s) => [s.stop_id, s]));

    for (const [stopId, quayIds] of resolution.stopToQuays) {
      const s = byStop.get(stopId);
      if (!s) continue;
      // Every quay behind this published stop sees exactly the same fields,
      // which is precisely how a granularity conflict hides them.
      const field =
        `${op.id}|${s.stop_id}|${s.stop_name}|${s.lat.toFixed(6)}|${s.lon.toFixed(6)}`;
      for (const q of quayIds) {
        const list = observed.get(q);
        if (list) list.push(field);
        else observed.set(q, [field]);
      }
    }
  }

  const quayById = new Map(world.quays.map((q) => [q.id, q]));
  const observations: Observation[] = [...observed.entries()]
    .map(([quayId, fields]) => ({ quayId, signature: [...fields].sort().join("  ") }))
    .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

  const bySignature = new Map<string, string[]>();
  for (const o of observations) {
    const list = bySignature.get(o.signature);
    if (list) list.push(o.quayId);
    else bySignature.set(o.signature, [o.quayId]);
  }

  const walkSpeed = world.manifest.walkSpeedMps;
  const groups: AmbiguousGroup[] = [];
  for (const [signature, quayIds] of bySignature) {
    if (quayIds.length < 2) continue;
    let spreadM = 0;
    for (let i = 0; i < quayIds.length; i++) {
      for (let j = i + 1; j < quayIds.length; j++) {
        const a = quayById.get(quayIds[i]!);
        const b = quayById.get(quayIds[j]!);
        if (!a || !b) continue;
        spreadM = Math.max(spreadM, metres(a.lat, a.lon, b.lat, b.lon));
      }
    }
    const members = new Set(quayIds);
    const reachableByQueries = world.queries.filter((q) =>
      world.queryAccess.some((a) => a.queryId === q.id && members.has(a.quayId)),
    ).length;

    groups.push({
      quayIds: [...quayIds].sort(),
      signature,
      spreadM,
      unpredictableS: Math.ceil(spreadM / walkSpeed),
      reachableByQueries,
    });
  }

  groups.sort((a, b) => b.unpredictableS - a.unpredictableS || (a.quayIds[0]! < b.quayIds[0]! ? -1 : 1));

  return {
    quaysExamined: observations.length,
    groups,
    ambiguousQuays: groups.reduce((n, g) => n + g.quayIds.length, 0),
    worstUnpredictableS: groups.length === 0 ? 0 : groups[0]!.unpredictableS,
    // Charged only to the travellers who could meet it, and only once each.
    worstAggregateS:
      world.queries.length === 0
        ? 0
        : groups.reduce(
            (total, g) => total + (g.unpredictableS * g.reachableByQueries) / world.queries.length,
            0,
          ),
    scoredQueries: world.queries.length,
  };
}
