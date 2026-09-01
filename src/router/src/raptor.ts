// Round-based earliest-arrival search.
//
// One round per transit leg. Each round scans every pattern reachable from the
// quays improved in the previous round, boards the earliest journey departing
// after the arrival time there, and relaxes every downstream quay. Between
// rounds, walk transfers are applied.
//
// Deliberately the plain textbook form: M1's network is 20 quays and ~300
// journeys, and the interesting engineering is elsewhere. Optimisation waits
// for a measurement (CLAUDE.md).

import type { World } from "@tns/schema";
import type { Disruption } from "@tns/core";

/** How much of the network a policy is allowed to transfer across. */
export type TransferPolicy =
  /** P0 — every walk link the world physically contains. */
  | "all"
  /**
   * P1 — only interchanges a local would know: quays sharing a Site, which is
   * where two or more operators both publish. Not a pair of quays 90 m apart
   * that appear together in no publication (REFERENCE-POLICY.md §4.1).
   */
  | "obvious";

export interface Access {
  readonly quayId: string;
  readonly seconds: number;
}

export interface TransitLegPlan {
  readonly mode: "transit";
  readonly journeyId: string;
  readonly patternId: string;
  readonly lineId: string;
  readonly fromQuay: string;
  readonly toQuay: string;
  readonly departS: number;
  readonly arriveS: number;
}

export interface WalkLegPlan {
  readonly mode: "walk";
  readonly fromQuay: string | null;
  readonly toQuay: string | null;
  readonly departS: number;
  readonly arriveS: number;
}

export type LegPlan = TransitLegPlan | WalkLegPlan;

export interface RouteResult {
  readonly arriveS: number;
  readonly legs: readonly LegPlan[];
  readonly transfers: number;
  /** Time spent waiting at quays, which travellers weight heavily. */
  readonly waitS: number;
}

const MAX_ROUNDS = 4;

interface StopEntry {
  readonly patternId: string;
  readonly seq: number;
}

/** Prepared indices. Built once per world, reused across every query. */
export interface RouterIndex {
  readonly world: World;
  readonly patternsByQuay: ReadonlyMap<string, readonly StopEntry[]>;
  readonly journeysByPattern: ReadonlyMap<string, readonly { id: string; startS: number }[]>;
  readonly patternById: ReadonlyMap<string, World["patterns"][number]>;
  readonly siteOfQuay: ReadonlyMap<string, string>;
  readonly walkFrom: ReadonlyMap<string, readonly { toQuay: string; seconds: number }[]>;
}

/**
 * Build the search index.
 *
 * `disruptions` is what separates the oracle from everyone else. Given them,
 * the index reflects what will *actually* happen — cancelled journeys are gone
 * and delayed ones carry their delay — which is perfect information and
 * therefore P0. Without them the index is the published schedule, which is
 * what P1 and P2 plan on and what reality then contradicts.
 */
export function buildIndex(world: World, disruptions?: readonly Disruption[]): RouterIndex {
  const cancelled = new Set(
    (disruptions ?? []).filter((d) => d.kind === "cancellation").map((d) => d.journeyId),
  );
  const delayOf = new Map(
    (disruptions ?? []).filter((d) => d.kind === "delay").map((d) => [d.journeyId, d.delayS]),
  );

  const patternsByQuay = new Map<string, StopEntry[]>();
  const patternById = new Map<string, World["patterns"][number]>();

  for (const p of world.patterns) {
    patternById.set(p.id, p);
    for (const s of p.stops) {
      let list = patternsByQuay.get(s.quayId);
      if (!list) patternsByQuay.set(s.quayId, (list = []));
      list.push({ patternId: p.id, seq: s.seq });
    }
  }

  const journeysByPattern = new Map<string, { id: string; startS: number }[]>();
  for (const j of world.journeys) {
    if (cancelled.has(j.id)) continue;
    let list = journeysByPattern.get(j.patternId);
    if (!list) journeysByPattern.set(j.patternId, (list = []));
    list.push({ id: j.id, startS: j.startS + (delayOf.get(j.id) ?? 0) });
  }
  // Loaded ordered by start_s already; sort defensively so board-selection is
  // a simple scan and the result never depends on insertion order.
  for (const list of journeysByPattern.values()) {
    list.sort((a, b) => a.startS - b.startS || (a.id < b.id ? -1 : 1));
  }

  const siteOfQuay = new Map(world.quays.map((q) => [q.id, q.siteId]));

  const walkSpeed = world.manifest.walkSpeedMps;
  const walkFrom = new Map<string, { toQuay: string; seconds: number }[]>();
  for (const link of world.walkLinks) {
    let list = walkFrom.get(link.fromQuay);
    if (!list) walkFrom.set(link.fromQuay, (list = []));
    list.push({ toQuay: link.toQuay, seconds: Math.ceil(link.metres / walkSpeed) });
  }

  return { world, patternsByQuay, journeysByPattern, patternById, siteOfQuay, walkFrom };
}

interface Label {
  arriveS: number;
  leg: LegPlan | null;
  prevQuay: string | null;
  round: number;
}

export function route(
  ix: RouterIndex,
  origins: readonly Access[],
  destinations: readonly Access[],
  departAfterS: number,
  policy: TransferPolicy,
): RouteResult | null {
  const best = new Map<string, Label>();
  const destBy = new Map(destinations.map((d) => [d.quayId, d.seconds]));

  let frontier: string[] = [];
  for (const o of origins) {
    const arriveS = departAfterS + o.seconds;
    const existing = best.get(o.quayId);
    if (!existing || arriveS < existing.arriveS) {
      best.set(o.quayId, {
        arriveS,
        leg: { mode: "walk", fromQuay: null, toQuay: o.quayId, departS: departAfterS, arriveS },
        prevQuay: null,
        round: 0,
      });
      frontier.push(o.quayId);
    }
  }
  // Deterministic scan order. Never rely on Map iteration reflecting anything
  // meaningful about the world (CLAUDE.md).
  frontier.sort();

  for (let round = 1; round <= MAX_ROUNDS && frontier.length > 0; round++) {
    const improved = new Set<string>();

    // -- ride ---------------------------------------------------------------
    const marked = [...frontier].sort();
    for (const quayId of marked) {
      const from = best.get(quayId);
      if (!from) continue;

      const entries = [...(ix.patternsByQuay.get(quayId) ?? [])].sort(
        (a, b) => (a.patternId < b.patternId ? -1 : a.patternId > b.patternId ? 1 : a.seq - b.seq),
      );

      for (const entry of entries) {
        const pattern = ix.patternById.get(entry.patternId);
        if (!pattern) continue;
        const boardStop = pattern.stops[entry.seq];
        if (!boardStop) continue;

        const journeys = ix.journeysByPattern.get(entry.patternId) ?? [];
        let boarded: { id: string; startS: number } | undefined;
        for (const j of journeys) {
          if (j.startS + boardStop.departOffsetS >= from.arriveS) {
            boarded = j;
            break;
          }
        }
        if (!boarded) continue;

        const departS = boarded.startS + boardStop.departOffsetS;
        for (let k = entry.seq + 1; k < pattern.stops.length; k++) {
          const stop = pattern.stops[k]!;
          const arriveS = boarded.startS + stop.arriveOffsetS;
          const existing = best.get(stop.quayId);
          if (existing && existing.arriveS <= arriveS) continue;

          best.set(stop.quayId, {
            arriveS,
            leg: {
              mode: "transit",
              journeyId: boarded.id,
              patternId: pattern.id,
              lineId: pattern.lineId,
              fromQuay: quayId,
              toQuay: stop.quayId,
              departS,
              arriveS,
            },
            prevQuay: quayId,
            round,
          });
          improved.add(stop.quayId);
        }
      }
    }

    // -- walk ---------------------------------------------------------------
    for (const quayId of [...improved].sort()) {
      const from = best.get(quayId)!;
      const links = [...(ix.walkFrom.get(quayId) ?? [])].sort((a, b) =>
        a.toQuay < b.toQuay ? -1 : 1,
      );

      for (const link of links) {
        if (policy === "obvious") {
          // Only interchanges everyone knows about: quays of the same Site.
          if (ix.siteOfQuay.get(quayId) !== ix.siteOfQuay.get(link.toQuay)) continue;
        }
        const arriveS = from.arriveS + link.seconds;
        const existing = best.get(link.toQuay);
        if (existing && existing.arriveS <= arriveS) continue;

        best.set(link.toQuay, {
          arriveS,
          leg: {
            mode: "walk",
            fromQuay: quayId,
            toQuay: link.toQuay,
            departS: from.arriveS,
            arriveS,
          },
          prevQuay: quayId,
          round,
        });
        improved.add(link.toQuay);
      }
    }

    frontier = [...improved].sort();
  }

  // -- pick the best destination, breaking ties deterministically ------------
  let bestQuay: string | null = null;
  let bestArrival = Number.POSITIVE_INFINITY;
  for (const quayId of [...destBy.keys()].sort()) {
    const label = best.get(quayId);
    if (!label) continue;
    const total = label.arriveS + destBy.get(quayId)!;
    if (total < bestArrival) {
      bestArrival = total;
      bestQuay = quayId;
    }
  }
  if (bestQuay === null) return null;

  // -- reconstruct ----------------------------------------------------------
  const legs: LegPlan[] = [];
  let cursor: string | null = bestQuay;
  while (cursor !== null) {
    const label: Label | undefined = best.get(cursor);
    if (!label || !label.leg) break;
    legs.push(label.leg);
    cursor = label.prevQuay;
  }
  legs.reverse();

  const finalWalk = destBy.get(bestQuay)!;
  if (finalWalk > 0) {
    const last = best.get(bestQuay)!;
    legs.push({
      mode: "walk",
      fromQuay: bestQuay,
      toQuay: null,
      departS: last.arriveS,
      arriveS: last.arriveS + finalWalk,
    });
  }

  let transfers = 0;
  let waitS = 0;
  let prevArrive = departAfterS;
  for (const leg of legs) {
    if (leg.mode === "transit") {
      transfers++;
      waitS += Math.max(0, leg.departS - prevArrive);
    }
    prevArrive = leg.arriveS;
  }

  return {
    arriveS: bestArrival,
    legs,
    transfers: Math.max(0, transfers - 1),
    waitS,
  };
}
