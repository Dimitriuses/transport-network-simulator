// The reference player's HTTP service.
//
// Runs as its own process, reachable at a base URL. The simulator only ever
// sends it HTTP — it never executes this code — which is why the sandboxing
// problem does not arise (TECHNICAL-RESEARCH.md §10).

import { createServer, type Server } from "node:http";

interface StopTime {
  stop_id: string;
  seq: number;
  arrive: string | number;
  depart: string | number;
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

/**
 * Decode whatever an operator calls a timestamp.
 *
 * Three operators, three encodings, and no field anywhere saying which
 * (catalogue B). This handles the shapes — a number is epoch seconds, a string
 * with an offset is RFC 3339 — and then makes the mistake a mediocre
 * integrator makes: a timestamp with **no offset** is assumed to be in the
 * same frame as everything else. It is not. Nothing in the data says so.
 */
function toSeconds(value: string | number): number {
  if (typeof value === "number") {
    // Epoch seconds. Reduce to a comparable within-day figure.
    return value;
  }
  const t = /T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!t || !d) return Number.NaN;
  return Number(d[3]) * 86400 + Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]);
}

/**
 * Bring an operator's clock onto a common footing.
 *
 * Epoch seconds and wall-clock strings are not comparable without knowing the
 * world's offset — which no operator publishes. This player infers it from the
 * one operator that *does* state an offset, and applies it to everyone. That
 * is more than the laziest possible approach and less than correct.
 */
function normaliseOffset(timetables: Timetable[]): number {
  for (const t of timetables) {
    const sample = t.trips[0]?.stop_times[0]?.depart;
    if (typeof sample === "string" && /[+-]\d{2}:\d{2}$/.test(sample)) {
      const m = /([+-])(\d{2}):(\d{2})$/.exec(sample)!;
      return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
    }
  }
  return 0;
}

interface Model {
  stops: Stop[];
  /** key -> stop, where key is `operator:stop_id`. Ids collide across operators. */
  stopByKey: Map<string, Stop>;
  operatorOfStop: Map<string, string>;
  boardings: Map<string, { trip: Trip; operator: string; index: number; departS: number }[]>;
  /** Puts any operator's timestamp on the common wall clock. */
  arriveAt: (v: string | number) => number;
}

/**
 * Build one model from several operators' timetables.
 *
 * Note what this does *not* do: reconcile anything. Stops keep their own
 * operator's identity, and two quays 80 m apart stay two stops. Working out
 * which of them are really the same place — and which merely look like it — is
 * the job. This player does not attempt it.
 */
function buildModel(timetables: Timetable[]): Model {
  const offsetS = normaliseOffset(timetables);
  // Epoch-second operators are on the Unix clock; string operators are on the
  // wall clock. Put both on the wall clock, using the offset inferred above.
  const at = (v: string | number): number =>
    typeof v === "number" ? toSeconds(v + offsetS) % 86400 : toSeconds(v) % 86400;
  void at;
  const stops: Stop[] = [];
  const stopByKey = new Map<string, Stop>();
  const operatorOfStop = new Map<string, string>();
  const boardings = new Map<
    string,
    { trip: Trip; operator: string; index: number; departS: number }[]
  >();

  for (const t of timetables) {
    for (const s of t.stops) {
      const key = `${t.operator}:${s.stop_id}`;
      stops.push({ ...s, stop_id: key });
      stopByKey.set(key, { ...s, stop_id: key });
      operatorOfStop.set(key, t.operator);
    }
    for (const trip of t.trips) {
      trip.stop_times.forEach((st, index) => {
        if (index === trip.stop_times.length - 1) return; // cannot board the last stop
        const key = `${t.operator}:${st.stop_id}`;
        let list = boardings.get(key);
        if (!list) boardings.set(key, (list = []));
        const departS =
          typeof st.depart === "number"
            ? (st.depart + offsetS) % 86400
            : toSeconds(st.depart) % 86400;
        list.push({ trip, operator: t.operator, index, departS });
      });
    }
  }
  for (const list of boardings.values()) list.sort((a, b) => a.departS - b.departS);

  return {
    stops,
    stopByKey,
    operatorOfStop,
    boardings,
    arriveAt: (v) =>
      typeof v === "number" ? (toSeconds(v + offsetS) % 86400) : toSeconds(v) % 86400,
  };
}

/** Strip the internal `operator:` prefix back off before answering. */
const published = (key: string): string => key.slice(key.indexOf(":") + 1);

/** Crude great-circle-ish distance. Good enough to pick a nearby stop. */
function roughMetres(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * 111_320;
  const dLon = (aLon - bLon) * 71_000; // adequate near 50°N
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

function nearbyStops(model: Model, lat: number, lon: number, maxM: number): Stop[] {
  return model.stops
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
  const departS = toSeconds(departAfter) % 86400;
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
          const arriveS = model.arriveAt(st.arrive);
          const toKey = `${b.operator}:${st.stop_id}`;
          const existing = best.get(toKey);
          if (existing && existing.arriveS <= arriveS) continue;

          best.set(toKey, {
            arriveS,
            leg: {
              mode: "transit",
              operator: b.operator,
              route: b.trip.route_id,
              trip: b.trip.trip_id,
              from_stop: published(stopId),
              to_stop: st.stop_id,
              depart: String(b.trip.stop_times[b.index]!.depart),
              arrive: String(st.arrive),
            },
            prev: stopId,
          });
          improved.add(toKey);
        }
        break; // naive: only the first boardable departure is considered
      }
    }

    // Transfers: any stop within 200 m. The player has no idea which of these
    // are "real" interchanges — working that out is the job.
    for (const stopId of [...improved].sort()) {
      const here = model.stopByKey.get(stopId);
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
            from: {
              operator: model.operatorOfStop.get(stopId) ?? "",
              stop: published(stopId),
            },
            to: {
              operator: model.operatorOfStop.get(other.stop_id) ?? "",
              stop: published(other.stop_id),
            },
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
    const stop = model.stopByKey.get(id);
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
  /** The one bootstrap value the contract gives a player (§3). */
  readonly controlUrl: string;
  /**
   * "naive" plans from a coordinate-merged model. "null" declines everything —
   * used to demonstrate that forgoing obligations scores exactly 0.0, because
   * the traveller falls back to the reference policy and the player is charged
   * for it (REFERENCE-POLICY.md §8).
   */
  readonly mode?: "naive" | "null" | "blind";
}

interface Held {
  travellerRef: string;
  /** `${operator}:${trip}` for every transit leg this traveller depends on. */
  trips: string[];
  warned: boolean;
}

export function startPlayer(opts: PlayerOptions): Promise<Server> {
  let model: Model | null = null;
  let ready = false;
  let operators: { id: string; base_url: string }[] = [];
  const mode = opts.mode ?? "naive";

  // Itineraries this player has handed out, so it knows who to warn.
  const held = new Map<string, Held>();

  // Ingestion. The brief says where the operators are and nothing else — not
  // their schemas, not their quality, and certainly not how their stops relate
  // (PLAYER-CONTRACT.md §6.1). Everything past this point is inference.
  //
  // The timetables are static here, so one pass is enough; that is why this
  // milestone has no ticks to re-poll on.
  const ingest = async (): Promise<void> => {
    const brief = (await (await fetch(`${opts.controlUrl}/v1/brief`)).json()) as {
      operators: { id: string; base_url: string }[];
    };
    operators = brief.operators;

    const timetables: Timetable[] = [];
    for (const op of brief.operators) {
      timetables.push((await (await fetch(`${op.base_url}/timetable`)).json()) as Timetable);
    }

    model = buildModel(timetables);
    ready = true;
  };

  /**
   * Look at every operator's realtime feed and warn anyone whose plan is in
   * trouble.
   *
   * Deliberately shallow, in the way a mediocre integrator is shallow: it
   * believes what each feed says. It does not notice that one operator is five
   * minutes behind, that another quietly drops cancelled trips rather than
   * marking them, or that a third reports delays in whole minutes. Those are
   * the things a real solution has to work out.
   */
  const pollRealtime = async (): Promise<void> => {
    if (mode !== "naive") return;

    const trouble = new Set<string>();
    for (const op of operators) {
      try {
        const feed = (await (await fetch(`${op.base_url}/realtime`)).json()) as {
          updates?: { trip_id: string; status: string; delay?: number }[];
        };
        for (const u of feed.updates ?? []) {
          if (u.status === "cancelled" || (u.status === "delayed" && (u.delay ?? 0) > 0)) {
            trouble.add(`${op.id}:${u.trip_id}`);
          }
        }
      } catch {
        // A feed that will not answer is one this player simply goes without.
      }
    }

    for (const h of held.values()) {
      if (h.warned) continue;
      if (!h.trips.some((t) => trouble.has(t))) continue;
      h.warned = true;
      try {
        await fetch(`${opts.controlUrl}/v1/notify`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            traveller_ref: h.travellerRef,
            kind: "disruption",
            message: "A service on your route is disrupted.",
          }),
        });
      } catch {
        // Dissemination is best-effort; a dropped warning is a silent failure
        // and is scored as one.
      }
    }
  };

  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/v1/health") {
        return json(res, 200, { status: ready ? "ready" : "starting" });
      }

      if (req.method === "GET" && url.pathname === "/v1/identity") {
        return json(res, 200, {
          name: mode === "null" ? "null-player" : NAME,
          version: VERSION,
          contract_versions: [CONTRACT_VERSION],
          // No `tick`: M1's timetable is static. No `notify`: no disruptions.
          // A `blind` player never asks for ticks, so it never sees a
          // realtime feed and can never warn anybody. It exists to show what
          // the Information family measures: the floor is not "warns badly",
          // it is "never looks".
          capabilities:
            mode === "naive" ? ["plan", "tick", "notify"] : ["plan"],
          ...(mode === "naive" ? { tick: { interval_sim_s: 120 } } : {}),
        });
      }

      if (req.method === "POST" && url.pathname === "/v1/plan") {
        if (!model) return json(res, 503, { title: "not ready", status: 503 });
        const body = JSON.parse(await readBody(req)) as {
          requests: {
            request_id: string;
            traveller_ref: string;
            origin: { lat: number; lon: number };
            destination: { lat: number; lon: number };
            depart_after: string;
          }[];
        };

        const results = body.requests.map((r) => {
          if (mode === "null") {
            // Honest refusal. Scored more kindly than a wrong answer, but never
            // free: the traveller falls back to the reference policy and the
            // player is charged both for that outcome and for the forgone
            // obligation (REFERENCE-POLICY.md §8).
            return { request_id: r.request_id, status: "declined", itinerary: null };
          }
          const itinerary = plan(model!, r.origin, r.destination, r.depart_after);
          if (itinerary === null) {
            return { request_id: r.request_id, status: "no_route", itinerary: null };
          }
          // Remember what this traveller is relying on, so a later feed update
          // can be matched back to somebody who needs telling.
          held.set(r.traveller_ref, {
            travellerRef: r.traveller_ref,
            trips: itinerary.legs
              .filter((l) => l["mode"] === "transit")
              .map((l) => `${String(l["operator"])}:${String(l["trip"])}`),
            warned: false,
          });
          return { request_id: r.request_id, status: "ok", itinerary };
        });

        return json(res, 200, { results });
      }

      // Ingestion happens here, driven by the simulator's cadence. Polling
      // faster would return identical bytes and cost quota: an operator's feed
      // is a pure function of simulated time (PLAYER-CONTRACT.md §6.4).
      if (req.method === "POST" && url.pathname === "/v1/tick") {
        await pollRealtime();
        return json(res, 200, { status: "ok" });
      }

      if (req.method === "POST" && (url.pathname === "/v1/run-start" || url.pathname === "/v1/run-end")) {
        if (url.pathname === "/v1/run-end") held.clear();
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
