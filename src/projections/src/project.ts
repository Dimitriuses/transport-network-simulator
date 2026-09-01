// L3 — projecting the world as one operator publishes it.
//
// Specification: DATA-MODEL.md §4.
//
//     project(L1, L2@τ, manifest, seed) → bytes
//
// No wall clock, no call counter, no request history in the signature. That is
// the snapshot rule expressed as a type rather than as a discipline
// (PLAYER-CONTRACT.md §6.4), and it is what makes a paused clock safe.
//
// Every departure from the conventional presentation comes from the operator's
// manifest and is implemented in ./defects.ts. Nothing here is randomised: a
// world's difficulty is *declared*, and the defect audit checks the declaration
// against the output.

import type { World } from "@tns/schema";
import { renderSimTime, parseEpoch } from "@tns/schema";
import {
  publishedCoords,
  publishedId,
  publishedName,
  publishedTime,
  type OperatorManifest,
} from "./defects.ts";

export interface PublishedStop {
  readonly stop_id: string;
  readonly stop_name: string;
  readonly lat: number;
  readonly lon: number;
}

export interface PublishedStopTime {
  readonly stop_id: string;
  readonly seq: number;
  readonly arrive: string | number;
  readonly depart: string | number;
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
  readonly published_at: string | number;
  readonly stops: readonly PublishedStop[];
  readonly routes: readonly PublishedRoute[];
  readonly trips: readonly PublishedTrip[];
}

/**
 * The private mapping `(operator, published_id) → canonical entity`.
 *
 * Never served over any API. Note `stopToQuays` is one-to-**many**: an operator
 * publishing at Site granularity has one stop standing for every quay in that
 * Site, and the simulator must be able to resolve a boarding to whichever of
 * them the trip actually calls at (DATA-MODEL.md §4).
 */
export interface Resolution {
  readonly stopToQuays: ReadonlyMap<string, readonly string[]>;
  readonly quayToStop: ReadonlyMap<string, string>;
  readonly tripToJourney: ReadonlyMap<string, string>;
  readonly routeToLine: ReadonlyMap<string, string>;
}

export interface Projection {
  readonly timetable: Timetable;
  readonly resolution: Resolution;
}

export function projectOperator(world: World, operatorId: string, tau: number): Projection {
  const info = world.manifest.operators.find((o) => o.id === operatorId);
  if (!info) throw new Error(`no such operator in this world: ${operatorId}`);
  const m = info.manifest as OperatorManifest;

  const anchor = parseEpoch(world.manifest.worldEpochIso);

  // τ is seconds from the world epoch, which is local midnight. Unix epoch
  // seconds are therefore τ shifted by the world's offset — the conversion an
  // `epoch_s` operator's data has already been through, and which the player
  // has to undo without being told the offset.
  const at = (tau: number): string | number =>
    publishedTime(m.time.encoding, renderSimTime(anchor, tau), tau - world.manifest.utcOffsetS);

  // An operator publishes only its own network. It has no idea the others
  // exist, which is the whole problem the player is there to solve.
  const ownLines = world.lines.filter((l) => l.operator === operatorId);
  const ownLineIds = new Set(ownLines.map((l) => l.id));
  const ownPatterns = world.patterns.filter((p) => ownLineIds.has(p.lineId));
  const ownPatternIds = new Set(ownPatterns.map((p) => p.id));
  const ownQuayIds = new Set(ownPatterns.flatMap((p) => p.stops.map((s) => s.quayId)));

  const quayById = new Map(world.quays.map((q) => [q.id, q]));
  const siteById = new Map(world.sites.map((s) => [s.id, s]));

  // ---- stops -------------------------------------------------------------
  //
  // At `site` granularity the operator publishes one stop per Site, so every
  // quay in that Site maps to it. That is not a bug in the operator's data —
  // plenty of real railways genuinely do not model platforms — but it means
  // "the stop" and "the place a vehicle calls at" stop being the same thing.
  const stopToQuays = new Map<string, string[]>();
  const quayToStop = new Map<string, string>();
  const stops: PublishedStop[] = [];

  const orderedQuays = world.quays
    .filter((q) => ownQuayIds.has(q.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

  if (m.identity.granularity === "site") {
    const siteIds = [...new Set(orderedQuays.map((q) => q.siteId))].sort();
    siteIds.forEach((siteId, i) => {
      const site = siteById.get(siteId)!;
      const stopId = publishedId(m.identity.id_scheme, m.identity.prefix, "S", i + 1);
      const members = orderedQuays.filter((q) => q.siteId === siteId).map((q) => q.id);

      stopToQuays.set(stopId, members);
      for (const q of members) quayToStop.set(q, stopId);

      const src = m.geometry.source === "site" ? site : quayById.get(members[0]!)!;
      const c = publishedCoords(m.geometry.precision, m.geometry.latlon_order, m.geometry.offset_m, src.lat, src.lon);
      stops.push({
        stop_id: stopId,
        stop_name: publishedName(m.naming.variant, site.name),
        lat: c.lat,
        lon: c.lon,
      });
    });
  } else {
    orderedQuays.forEach((q, i) => {
      const stopId = publishedId(m.identity.id_scheme, m.identity.prefix, "S", i + 1);
      stopToQuays.set(stopId, [q.id]);
      quayToStop.set(q.id, stopId);

      const src = m.geometry.source === "site" ? siteById.get(q.siteId)! : q;
      const c = publishedCoords(m.geometry.precision, m.geometry.latlon_order, m.geometry.offset_m, src.lat, src.lon);
      stops.push({
        stop_id: stopId,
        stop_name: publishedName(m.naming.variant, q.name),
        lat: c.lat,
        lon: c.lon,
      });
    });
  }

  // ---- routes ------------------------------------------------------------
  const routeToLine = new Map<string, string>();
  const lineToRoute = new Map<string, string>();
  const routes: PublishedRoute[] = [];
  [...ownLines]
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .forEach((line, i) => {
      const routeId =
        m.identity.id_scheme === "bare_int"
          ? String(i + 1)
          : `${m.identity.prefix}-R${line.name}`;
      routeToLine.set(routeId, line.id);
      lineToRoute.set(line.id, routeId);
      routes.push({ route_id: routeId, route_name: publishedName(m.naming.variant, line.name) });
    });

  // ---- trips -------------------------------------------------------------
  const patternById = new Map(ownPatterns.map((p) => [p.id, p]));
  const tripToJourney = new Map<string, string>();
  const trips: PublishedTrip[] = [];

  world.journeys
    .filter((j) => ownPatternIds.has(j.patternId))
    .sort((a, b) => a.startS - b.startS || (a.id < b.id ? -1 : 1))
    .forEach((j, i) => {
      const pattern = patternById.get(j.patternId);
      if (!pattern) return;

      const tripId = publishedId(m.identity.id_scheme, m.identity.prefix, "T", i + 1);
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
    resolution: { stopToQuays, quayToStop, tripToJourney, routeToLine },
  };
}
