// @tns/projections
// L3 operator projections and the semantic-conflict defect library.
//
// Specification: DATA-MODEL.md §4.
//
// A projection is a pure function
//
//     project(L1, L2@τ, manifest, seed) → bytes
//
// No wall clock, no call counter, no request history in the signature. That is
// the snapshot rule expressed as a type rather than as a discipline
// (PLAYER-CONTRACT.md §6.4), and it is what makes a paused clock safe.
//
// M1 declares no conflicts, so this projection is faithful. It still assigns
// the operator its *own* published identifiers, because that is not a defect —
// it is simply how a real operator's API works, and the contract's
// operator-scoped reference rule depends on it (PLAYER-CONTRACT.md §7).

import type { World } from "@tns/schema";
import { renderSimTime, parseEpoch } from "@tns/schema";

export const PACKAGE_NAME = "@tns/projections";

export interface PublishedStop {
  readonly stop_id: string;
  readonly stop_name: string;
  readonly lat: number;
  readonly lon: number;
}

export interface PublishedStopTime {
  readonly stop_id: string;
  readonly seq: number;
  readonly arrive: string;
  readonly depart: string;
}

export interface PublishedTrip {
  readonly trip_id: string;
  readonly route_id: string;
  readonly heading: string;
  readonly stop_times: readonly PublishedStopTime[];
}

export interface PublishedRoute {
  readonly route_id: string;
  readonly route_name: string;
}

export interface Timetable {
  readonly operator: string;
  readonly operator_name: string;
  /** Simulated time this view was produced for. The snapshot rule made visible. */
  readonly published_at: string;
  readonly stops: readonly PublishedStop[];
  readonly routes: readonly PublishedRoute[];
  readonly trips: readonly PublishedTrip[];
}

/**
 * The private mapping `(operator, published_id) → canonical entity`.
 *
 * Used by the simulator, oracle and scorer. **Never served over any API.** A
 * player that has matched stops correctly has reconstructed part of this by
 * inference, which is the game (DATA-MODEL.md §4).
 */
export interface Resolution {
  readonly stopToQuay: ReadonlyMap<string, string>;
  readonly quayToStop: ReadonlyMap<string, string>;
  readonly tripToJourney: ReadonlyMap<string, string>;
  readonly routeToLine: ReadonlyMap<string, string>;
}

export interface Projection {
  readonly timetable: Timetable;
  readonly resolution: Resolution;
}

const pad4 = (n: number): string => String(n).padStart(4, "0");

/**
 * Project the world as one operator publishes it.
 *
 * `tau` is the only time input. Called twice with the same τ, this returns
 * byte-identical output — which is what makes response bodies regenerable and
 * keeps run logs at megabytes rather than gigabytes (OBSERVABILITY.md §4).
 */
export function projectOperator(world: World, operatorId: string, tau: number): Projection {
  const anchor = parseEpoch(world.manifest.worldEpochIso);
  const at = (s: number): string => renderSimTime(anchor, s);

  const info = world.manifest.operators.find((o) => o.id === operatorId);
  if (!info) throw new Error(`no such operator in this world: ${operatorId}`);

  // An operator publishes only its own network. It has no idea the others
  // exist, which is the whole problem the player is there to solve.
  const ownLines = world.lines.filter((l) => l.operator === operatorId);
  const ownLineIds = new Set(ownLines.map((l) => l.id));
  const ownPatterns = world.patterns.filter((p) => ownLineIds.has(p.lineId));
  const ownPatternIds = new Set(ownPatterns.map((p) => p.id));
  const ownQuayIds = new Set(ownPatterns.flatMap((p) => p.stops.map((s) => s.quayId)));

  const prefix = operatorId.slice(0, 2).toUpperCase();

  // Deterministic published identifiers in the operator's own namespace.
  // Canonical ids never leave the simulator.
  const stopToQuay = new Map<string, string>();
  const quayToStop = new Map<string, string>();
  const stops: PublishedStop[] = [];

  const orderedQuays = world.quays
    .filter((q) => ownQuayIds.has(q.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  orderedQuays.forEach((q, i) => {
    const stopId = `${prefix}-S${pad4(i + 1)}`;
    stopToQuay.set(stopId, q.id);
    quayToStop.set(q.id, stopId);
    stops.push({ stop_id: stopId, stop_name: q.name, lat: q.lat, lon: q.lon });
  });

  const routeToLine = new Map<string, string>();
  const lineToRoute = new Map<string, string>();
  const routes: PublishedRoute[] = [];
  for (const line of [...ownLines].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const routeId = `${prefix}-R${line.name}`;
    routeToLine.set(routeId, line.id);
    lineToRoute.set(line.id, routeId);
    routes.push({ route_id: routeId, route_name: `Route ${line.name}` });
  }

  const patternById = new Map(ownPatterns.map((p) => [p.id, p]));

  const tripToJourney = new Map<string, string>();
  const trips: PublishedTrip[] = [];
  const orderedJourneys = world.journeys
    .filter((j) => ownPatternIds.has(j.patternId))
    .sort((a, b) => a.startS - b.startS || (a.id < b.id ? -1 : 1));

  orderedJourneys.forEach((j, i) => {
    const pattern = patternById.get(j.patternId);
    if (!pattern) return;

    const tripId = `${prefix}-T${pad4(i + 1)}`;
    tripToJourney.set(tripId, j.id);

    trips.push({
      trip_id: tripId,
      route_id: lineToRoute.get(pattern.lineId) ?? pattern.lineId,
      heading: pattern.heading,
      stop_times: pattern.stops.map((s) => ({
        stop_id: quayToStop.get(s.quayId) ?? s.quayId,
        seq: s.seq,
        arrive: at(j.startS + s.arriveOffsetS),
        depart: at(j.startS + s.departOffsetS),
      })),
    });
  });

  return {
    timetable: {
      operator: info.id,
      operator_name: info.name,
      published_at: at(tau),
      stops,
      routes,
      trips,
    },
    resolution: { stopToQuay, quayToStop, tripToJourney, routeToLine },
  };
}
