// The competent integrator's model, and its planner.
//
// Built from the same three feeds every player sees. What makes it competent is
// not extra data — it has none — but that it distrusts what it is given in the
// specific ways the data deserves.

import {
  detectTimeDecoder,
  estimateOffset,
  readRealtime,
  roughMetres,
  walkableLinks,
  type MatchedStop,
  type Timetable,
} from "./competent.ts";

export interface CompetentModel {
  readonly stops: readonly MatchedStop[];
  readonly byKey: ReadonlyMap<string, MatchedStop>;
  readonly links: ReadonlyMap<string, { key: string; seconds: number }[]>;
  /** key -> boardable departures, ordered. */
  readonly boardings: ReadonlyMap<
    string,
    { tripKey: string; operator: string; tripId: string; routeId: string; index: number; departS: number; stops: { key: string; arriveS: number }[] }[]
  >;
  readonly seenTrips: Set<string>;
  /** Will not run. Never boarded. */
  readonly cancelled: Set<string>;
  /** Will run late. Boarded, with the delay carried into the arrival time. */
  readonly delayed: Map<string, number>;
}

export function buildCompetentModel(
  timetables: readonly Timetable[],
  worldOffsetS: number,
): CompetentModel {
  // The operator with the most stops is the reference frame. Any of them would
  // do; what matters is measuring the others *against* one rather than trusting
  // all of them equally.
  const reference = [...timetables].sort((a, b) => b.stops.length - a.stops.length)[0]!;

  const stops: MatchedStop[] = [];
  const byKey = new Map<string, MatchedStop>();
  const decoders = new Map<string, (v: string | number) => number>();

  for (const t of timetables) {
    decoders.set(t.operator, detectTimeDecoder(t, worldOffsetS));

    // Recover this operator's systematic displacement, if it has one, and
    // correct for it. Without this its stops look like neighbours of nothing.
    const { dLat, dLon } = t.operator === reference.operator
      ? { dLat: 0, dLon: 0 }
      : estimateOffset(t, reference);

    for (const s of t.stops) {
      const m: MatchedStop = {
        key: `${t.operator}:${s.stop_id}`,
        operator: t.operator,
        stopId: s.stop_id,
        lat: s.lat - dLat,
        lon: s.lon - dLon,
        name: s.stop_name,
      };
      stops.push(m);
      byKey.set(m.key, m);
    }
  }

  const links = walkableLinks(stops, 200);

  const boardings = new Map<string, CompetentModel["boardings"] extends ReadonlyMap<string, infer V> ? V : never>();
  const seenTrips = new Set<string>();

  for (const t of timetables) {
    const decode = decoders.get(t.operator)!;
    for (const trip of t.trips) {
      const tripKey = `${t.operator}:${trip.trip_id}`;
      seenTrips.add(tripKey);

      const sequence = trip.stop_times.map((st) => ({
        key: `${t.operator}:${st.stop_id}`,
        arriveS: decode(st.arrive),
        departS: decode(st.depart),
      }));

      sequence.forEach((st, index) => {
        if (index === sequence.length - 1) return;
        let list = boardings.get(st.key);
        if (!list) boardings.set(st.key, (list = []));
        list.push({
          tripKey,
          operator: t.operator,
          tripId: trip.trip_id,
          routeId: trip.route_id,
          index,
          departS: st.departS,
          stops: sequence.map((x) => ({ key: x.key, arriveS: x.arriveS })),
        });
      });
    }
  }
  for (const list of boardings.values()) list.sort((a, b) => a.departS - b.departS);

  return { stops, byKey, links, boardings, seenTrips, cancelled: new Set(), delayed: new Map() };
}

/** Fold a realtime feed into what the model believes. */
export function applyRealtime(
  model: CompetentModel,
  operator: string,
  updates: readonly { trip_id: string; status: string; delay?: number }[],
): void {
  const previously = new Set([...model.seenTrips].filter((k) => k.startsWith(`${operator}:`)));
  const view = readRealtime(operator, updates, previously);
  for (const k of view.cancelled) model.cancelled.add(k);
  for (const [k, d] of view.delayed) model.delayed.set(k, d);
}

export interface PlannedLeg {
  mode: "transit";
  operator: string;
  route: string;
  trip: string;
  from_stop: string;
  to_stop: string;
  depart: string;
  arrive: string;
}

/**
 * Three-round earliest arrival over the reconciled model.
 *
 * Two things separate it from the naive planner: access and transfer walking
 * are charged (so it never promises a journey it cannot start), and trips known
 * to be disrupted are simply not boarded.
 */
export function planCompetently(
  model: CompetentModel,
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  departAfterS: number,
): { legs: PlannedLeg[] } | null {
  const near = (lat: number, lon: number): { key: string; seconds: number }[] =>
    model.stops
      .map((s) => ({ key: s.key, d: roughMetres(lat, lon, s.lat, s.lon) }))
      .filter((x) => x.d <= 400)
      .map((x) => ({ key: x.key, seconds: Math.ceil(x.d / 1.3) }))
      .sort((a, b) => a.seconds - b.seconds);

  const origins = near(origin.lat, origin.lon);
  const dests = new Map(near(destination.lat, destination.lon).map((d) => [d.key, d.seconds]));
  if (origins.length === 0 || dests.size === 0) return null;

  interface Label {
    arriveS: number;
    leg: PlannedLeg | null;
    prev: string | null;
  }
  const best = new Map<string, Label>();
  for (const o of origins) {
    // Reaching a stop costs walking time. Seeding at the departure instant
    // would be a free teleport and would produce journeys nobody could make.
    best.set(o.key, { arriveS: departAfterS + o.seconds, leg: null, prev: null });
  }

  let frontier = origins.map((o) => o.key).sort();

  for (let round = 0; round < 3 && frontier.length > 0; round++) {
    const improved = new Set<string>();

    for (const key of frontier) {
      const from = best.get(key)!;
      for (const b of model.boardings.get(key) ?? []) {
        if (b.departS < from.arriveS) continue;
        if (model.cancelled.has(b.tripKey)) continue; // it will not run at all

        // A delay is carried, not avoided: the service still goes, later.
        const delay = model.delayed.get(b.tripKey) ?? 0;
        if (b.departS + delay < from.arriveS) continue;

        for (let k = b.index + 1; k < b.stops.length; k++) {
          const st = b.stops[k]!;
          const arriveS = st.arriveS + delay;
          const existing = best.get(st.key);
          if (existing && existing.arriveS <= arriveS) continue;
          best.set(st.key, {
            arriveS,
            leg: {
              mode: "transit",
              operator: b.operator,
              route: b.routeId,
              trip: b.tripId,
              from_stop: model.byKey.get(key)!.stopId,
              to_stop: model.byKey.get(st.key)!.stopId,
              depart: "2031-04-07T00:00:00+03:00",
              arrive: "2031-04-07T00:00:00+03:00",
            },
            prev: key,
          });
          improved.add(st.key);
        }
        break;
      }
    }

    // Transfers cost the walk they actually are.
    for (const key of [...improved].sort()) {
      const from = best.get(key)!;
      for (const link of model.links.get(key) ?? []) {
        const arriveS = from.arriveS + link.seconds;
        const existing = best.get(link.key);
        if (existing && existing.arriveS <= arriveS) continue;
        best.set(link.key, { arriveS, leg: null, prev: key });
        improved.add(link.key);
      }
    }

    frontier = [...improved].sort();
  }

  let chosen: string | null = null;
  let bestTotal = Infinity;
  for (const [key, walk] of [...dests.entries()].sort()) {
    const label = best.get(key);
    if (!label) continue;
    const total = label.arriveS + walk;
    if (total < bestTotal) {
      bestTotal = total;
      chosen = key;
    }
  }
  if (chosen === null) return null;

  const legs: PlannedLeg[] = [];
  let cursor: string | null = chosen;
  while (cursor !== null) {
    const label: Label | undefined = best.get(cursor);
    if (!label) break;
    if (label.leg) legs.push(label.leg);
    cursor = label.prev;
  }
  legs.reverse();

  return legs.length > 0 ? { legs } : null;
}
