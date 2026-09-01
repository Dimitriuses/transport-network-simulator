// The reference player's HTTP service.
//
// Runs as its own process, reachable at a base URL. The simulator only ever
// sends it HTTP — it never executes this code — which is why the sandboxing
// problem does not arise (TECHNICAL-RESEARCH.md §10).

import { createServer, type Server } from "node:http";

interface StopTime {
  stop_id: string;
  seq: number;
  arrive: string;
  depart: string;
}
interface Trip {
  trip_id: string;
  route_id: string;
  heading: string;
  stop_times: StopTime[];
}
interface Stop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
}
interface Timetable {
  operator: string;
  stops: Stop[];
  routes: { route_id: string; route_name: string }[];
  trips: Trip[];
}

const NAME = "reference-player";
const VERSION = "0.1.0";
const CONTRACT_VERSION = "0.3";

/** Seconds since midnight-of-epoch-day, from an RFC 3339 stamp. Naive but adequate. */
function toSeconds(iso: string): number {
  const m = /T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!m) return Number.NaN;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)!;
  const dayNum = Number(day[3]);
  return dayNum * 86400 + Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

interface Model {
  timetable: Timetable;
  stopById: Map<string, Stop>;
  /** stop_id -> [{ trip, index }] ordered by departure. */
  boardings: Map<string, { trip: Trip; index: number; departS: number }[]>;
}

function buildModel(timetable: Timetable): Model {
  const stopById = new Map(timetable.stops.map((s) => [s.stop_id, s]));
  const boardings = new Map<string, { trip: Trip; index: number; departS: number }[]>();

  for (const trip of timetable.trips) {
    trip.stop_times.forEach((st, index) => {
      if (index === trip.stop_times.length - 1) return; // cannot board the last stop
      let list = boardings.get(st.stop_id);
      if (!list) boardings.set(st.stop_id, (list = []));
      list.push({ trip, index, departS: toSeconds(st.depart) });
    });
  }
  for (const list of boardings.values()) list.sort((a, b) => a.departS - b.departS);

  return { timetable, stopById, boardings };
}

/** Crude great-circle-ish distance. Good enough to pick a nearby stop. */
function roughMetres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * 111_320;
  const dLon = (aLon - bLon) * 71_000; // adequate near 50°N
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function nearbyStops(model: Model, lat: number, lon: number, maxM: number): Stop[] {
  return model.timetable.stops
    .map((s) => ({ s, d: roughMetres(lat, lon, s.lat, s.lon) }))
    .filter((x) => x.d <= maxM)
    .sort((a, b) => a.d - b.d || (a.s.stop_id < b.s.stop_id ? -1 : 1))
    .map((x) => x.s);
}

interface Leg {
  mode: "walk" | "transit";
  [k: string]: unknown;
}

/** Two-round earliest arrival. No profile search, no optimisation. */
function plan(
  model: Model,
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
  departAfter: string,
): { legs: Leg[] } | null {
  const departS = toSeconds(departAfter);
  const originStops = nearbyStops(model, origin.lat, origin.lon, 500);
  const destStops = new Set(nearbyStops(model, destination.lat, destination.lon, 500).map((s) => s.stop_id));
  if (originStops.length === 0 || destStops.size === 0) return null;

  interface Label {
    arriveS: number;
    leg: Leg | null;
    prev: string | null;
  }
  const best = new Map<string, Label>();

  // Reaching a stop from the origin costs walking time. Seeding every nearby
  // stop at the departure instant would be a free teleport, and would produce
  // itineraries that beat a perfectly-informed planner — which is impossible.
  for (const s of originStops) {
    const walkS = Math.ceil(roughMetres(origin.lat, origin.lon, s.lat, s.lon) / 1.3);
    best.set(s.stop_id, { arriveS: departS + walkS, leg: null, prev: null });
  }

  let frontier = originStops.map((s) => s.stop_id).sort();

  for (let round = 0; round < 2 && frontier.length > 0; round++) {
    const improved = new Set<string>();

    for (const stopId of frontier) {
      const from = best.get(stopId)!;
      for (const b of model.boardings.get(stopId) ?? []) {
        if (b.departS < from.arriveS) continue;

        for (let k = b.index + 1; k < b.trip.stop_times.length; k++) {
          const st = b.trip.stop_times[k]!;
          const arriveS = toSeconds(st.arrive);
          const existing = best.get(st.stop_id);
          if (existing && existing.arriveS <= arriveS) continue;

          best.set(st.stop_id, {
            arriveS,
            leg: {
              mode: "transit",
              operator: model.timetable.operator,
              route: b.trip.route_id,
              trip: b.trip.trip_id,
              from_stop: stopId,
              to_stop: st.stop_id,
              depart: b.trip.stop_times[b.index]!.depart,
              arrive: st.arrive,
            },
            prev: stopId,
          });
          improved.add(st.stop_id);
        }
        break; // naive: only the first boardable departure is considered
      }
    }

    // Transfers: any stop within 200 m. The player has no idea which of these
    // are "real" interchanges — working that out is the job.
    for (const stopId of [...improved].sort()) {
      const here = model.stopById.get(stopId);
      const from = best.get(stopId)!;
      if (!here) continue;
      for (const other of nearbyStops(model, here.lat, here.lon, 200)) {
        if (other.stop_id === stopId) continue;
        const arriveS = from.arriveS + 120;
        const existing = best.get(other.stop_id);
        if (existing && existing.arriveS <= arriveS) continue;
        best.set(other.stop_id, {
          arriveS,
          leg: {
            mode: "walk",
            from: { operator: model.timetable.operator, stop: stopId },
            to: { operator: model.timetable.operator, stop: other.stop_id },
            depart: from.leg ? (from.leg["arrive"] as string) : departAfter,
            arrive: from.leg ? (from.leg["arrive"] as string) : departAfter,
          },
          prev: stopId,
        });
        improved.add(other.stop_id);
      }
    }

    frontier = [...improved].sort();
  }

  // Likewise at the far end: arriving at a stop 400 m from the destination is
  // not the same as arriving.
  let chosen: string | null = null;
  let bestArrival = Number.POSITIVE_INFINITY;
  for (const id of [...destStops].sort()) {
    const label = best.get(id);
    const stop = model.stopById.get(id);
    if (!label || !label.leg || !stop) continue;
    const walkS = Math.ceil(
      roughMetres(destination.lat, destination.lon, stop.lat, stop.lon) / 1.3,
    );
    const total = label.arriveS + walkS;
    if (total < bestArrival) {
      bestArrival = total;
      chosen = id;
    }
  }
  if (chosen === null) return null;

  const legs: Leg[] = [];
  let cursor: string | null = chosen;
  while (cursor !== null) {
    const label: Label | undefined = best.get(cursor);
    if (!label || !label.leg) break;
    legs.push(label.leg);
    cursor = label.prev;
  }
  legs.reverse();

  return legs.length > 0 ? { legs } : null;
}

function json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export interface PlayerOptions {
  readonly port: number;
  readonly operatorBaseUrl: string;
}

export function startPlayer(opts: PlayerOptions): Promise<Server> {
  let model: Model | null = null;
  let ready = false;

  // Ingestion. In M1 the timetable is static, so one fetch is enough — which is
  // exactly why M1 has no ticks: there is nothing to re-poll.
  const ingest = async (): Promise<void> => {
    const res = await fetch(`${opts.operatorBaseUrl}/timetable`);
    model = buildModel((await res.json()) as Timetable);
    ready = true;
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/v1/health") {
        return json(res, 200, { status: ready ? "ready" : "starting" });
      }

      if (req.method === "GET" && url.pathname === "/v1/identity") {
        return json(res, 200, {
          name: NAME,
          version: VERSION,
          contract_versions: [CONTRACT_VERSION],
          // No `tick`: M1's timetable is static. No `notify`: no disruptions.
          capabilities: ["plan"],
        });
      }

      if (req.method === "POST" && url.pathname === "/v1/plan") {
        if (!model) return json(res, 503, { title: "not ready", status: 503 });
        const body = JSON.parse(await readBody(req)) as {
          requests: {
            request_id: string;
            origin: { lat: number; lon: number };
            destination: { lat: number; lon: number };
            depart_after: string;
          }[];
        };

        const results = body.requests.map((r) => {
          const itinerary = plan(model!, r.origin, r.destination, r.depart_after);
          return itinerary === null
            ? { request_id: r.request_id, status: "no_route", itinerary: null }
            : { request_id: r.request_id, status: "ok", itinerary };
        });

        return json(res, 200, { results });
      }

      if (req.method === "POST" && (url.pathname === "/v1/run-start" || url.pathname === "/v1/run-end")) {
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { title: "not found", status: 404 });
    })().catch(() => json(res, 500, { title: "internal error", status: 500 }));
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      ingest().then(
        () => resolve(server),
        (err) => reject(err),
      );
    });
  });
}
