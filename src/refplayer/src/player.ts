// The reference player's HTTP service.
//
// Runs as its own process, reachable at a base URL. The simulator only ever
// sends it HTTP — it never executes this code — which is why the sandboxing
// problem does not arise (TECHNICAL-RESEARCH.md §10).

import { createServer, type Server } from "node:http";
import { publishedEpochSeconds, statedOffsetS } from "@tns/schema";
import { makeCheatPlanner, type CheatPlanner } from "./cheat.ts";
import { readTuning } from "./tuning.ts";
import {
  applyRealtime,
  buildCompetentModel,
  planCompetently,
  type CompetentModel,
} from "./competent-model.ts";

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
 * (catalogue B). This handles the shapes — a number is epoch seconds *or*
 * milliseconds, told apart by magnitude; a string with an offset is RFC 3339 —
 * and then makes the mistake a mediocre integrator makes: a timestamp with
 * **no offset** is read as UTC. In this world it is not, and nothing in the data
 * says so.
 *
 * **Until 2026-09-11 it read one as world-local instead**, which is correct, so
 * this player was accidentally competent at `local_naive` while the scoring
 * baseline paid three hours for it. The calibration search screens on this
 * player, so it could not see the setting that decides whether a top-rung draw
 * is a rung or thin (`KNOWN-ISSUES.md` #58). Both now read it as UTC.
 *
 * **An offset it is given, it believes** (`KNOWN-ISSUES.md` #58, decided
 * 2026-09-11). It used to read the wall clock and ignore the suffix, which made
 * it accidentally immune to `B-dst-offset` while the scoring baseline lost 44.83m
 * to the same feed — two lazy readers disagreeing completely about one conflict,
 * and the calibration search screening on the one that could not see it.
 *
 * The unit discrimination lives in `@tns/schema` because the scoring baseline
 * needs exactly the same rule, and had exactly the same bug.
 */
/**
 * Seconds since the world epoch, which is what the competent planner indexes
 * departures by.
 *
 * **Not `toSeconds`**, which counts from the start of the month and is only
 * ever used modulo a day. Passing one where the other is expected is off by
 * whole days and finds no departures at all — at P0M7 the replan handler did
 * exactly that, and the competent solution answered `no_route` to 26 of 26
 * replans for seven months of simulated time it was accidentally asked about.
 * It looked like a solution too conservative to reroute anybody.
 */
function simSeconds(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!m) return 0;
  return (
    (Number(m[3]) - WORLD_EPOCH_DAY) * 86400 +
    Number(m[4]) * 3600 +
    Number(m[5]) * 60 +
    Number(m[6])
  );
}

/** Day-of-month the world's epoch falls on. */
const WORLD_EPOCH_DAY = 7;

/**
 * A published time, as seconds into the day this player believes it is.
 *
 * **One decode, used for boarding and for alighting alike.** A helper for this
 * existed and was `void`ed while the boarding path inlined
 * `(st.depart + offsetS) % 86400` — a fourth copy of the rule
 * `KNOWN-ISSUES.md` #35 unified, and the one that fix did not reach because it
 * never went through `toSeconds` at all.
 *
 * The consequence was not a slightly wrong time. For an `epoch_ms` operator the
 * two disagreed by three orders of magnitude before the modulo: the same value
 * read 10800 as a departure and 10811 as an arrival. **Arrivals then land
 * before the departures that produced them** — a negative edge — and a label
 * relaxation with negative edges does not terminate. It builds a `prev` chain
 * with a cycle in it, and the path reconstruction spins (`#44`).
 *
 * **Convert the unit first, then apply the offset.** `toSeconds(v + offsetS)`
 * adds a count of *seconds* to a count of *milliseconds* before deciding which
 * unit it is looking at — harmless while every numeric feed was `epoch_s`, and
 * a three-order-of-magnitude error the moment one published `epoch_ms`. The
 * offset is a wall-clock quantity and belongs on the wall clock, once the unit
 * is known.
 *
 * Exported so the rule can be tested rather than trusted.
 */
export function wallClockSeconds(value: string | number, offsetS: number): number {
  if (typeof value === "number") return (toSeconds(value) + offsetS) % 86400;
  // A stated offset is believed: the instant it names, put on this player's wall
  // clock — the rule `parseSimTime` applies for the scoring baseline, and a test
  // holds the two together. No offset is read as UTC, which is the baseline
  // rule too and the intended defect (catalogue B). Both decided 2026-09-11,
  // KNOWN-ISSUES.md #58.
  const stated = statedOffsetS(value) ?? 0;
  const local = toSeconds(value);
  return (((local - stated + offsetS) % 86400) + 86400) % 86400;
}

function toSeconds(value: string | number): number {
  if (typeof value === "number") {
    // Seconds or milliseconds, told apart by magnitude. **This was the second
    // place the same bug lived** (`KNOWN-ISSUES.md` #35): reading `epoch_ms` as
    // seconds and then taking it modulo a day does not fail loudly — it yields
    // a plausible-looking wrong time, since 10800000 % 86400 is exactly 0.
    // Shared with the scoring baseline so the two cannot drift apart.
    return publishedEpochSeconds(value);
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
    // The same reading of the suffix the decoder uses, rather than a copy of it.
    const stated = typeof sample === "string" ? statedOffsetS(sample) : null;
    if (stated !== null) return stated;
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
  const at = (v: string | number): number => wallClockSeconds(v, offsetS);
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
        const departS = at(st.depart);
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
    arriveAt: at,
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

/**
 * What the world allows, taken from the brief rather than guessed.
 *
 * The defaults are only what applies before the brief has been read; they are
 * not a fallback worth relying on. Planning a walk the world will refuse gets
 * the traveller `origin_unreachable`, which is scored as not arriving at all.
 */
const limits = { maxWalkM: 400, walkSpeedMps: 1.3 };

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
  // Exactly the world's limit, not a round number near it. Searching wider
  // finds boarding points the simulator will not let the traveller reach.
  const originStops = nearbyStops(model, origin.lat, origin.lon, limits.maxWalkM);
  const destStops = new Set(
    nearbyStops(model, destination.lat, destination.lon, limits.maxWalkM).map((s) => s.stop_id),
  );
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
    const walkS = Math.ceil(roughMetres(origin.lat, origin.lon, s.lat, s.lon) / limits.walkSpeedMps);
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
        // Charge the walk this player's own coordinates imply, not a flat two
        // minutes. The flat cost assumed 200 m in 120 s — 1.67 m/s, which is
        // faster than anybody walks — so it attempted transfers it could not
        // make and missed the connections beyond them.
        //
        // That is not a lazy *strategy*, it is wrong arithmetic, and it was
        // wrong in a direction that got rewarded when the data was bad: an
        // accurate world offers more near-misses to attempt, so switching every
        // conflict off made this player score *better* and Gate 3 report a
        // negative conflict cost (P0M8; KNOWN-ISSUES.md #14).
        //
        // It still trusts the coordinates it was given, which is the lazy part
        // and the part conflicts are supposed to punish.
        const walkS = Math.max(
          60,
          Math.ceil(roughMetres(here.lat, here.lon, other.lat, other.lon) / limits.walkSpeedMps),
        );
        const arriveS = from.arriveS + walkS;
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
      roughMetres(destination.lat, destination.lon, stop.lat, stop.lon) / limits.walkSpeedMps,
    );
    const total = label.arriveS + walkS;
    if (total < bestArrival) {
      bestArrival = total;
      chosen = id;
    }
  }
  if (chosen === null) return null;

  // Walk the predecessors back to the origin.
  //
  // **Guarded against a cycle, because the chain can contain one.** Labels are
  // relaxed as better arrivals are found and `prev` is overwritten in place, so
  // a stop reached via another that was itself later re-reached through the
  // first leaves `A -> B -> A`. This loop had no guard and spun forever on it:
  // a generated world hung the naive reference player outright, while `null`
  // and `competent` finished, and nothing timed out because the player was busy
  // rather than stuck on I/O (`KNOWN-ISSUES.md` #44).
  //
  // A cycle means the reconstruction cannot produce the itinerary the search
  // claims to have found, so the honest answer is no plan at all. Truncating
  // the chain would hand the simulator an itinerary that does not start where
  // the traveller does, which is a wrong answer dressed as a right one.
  const legs: Leg[] = [];
  const seen = new Set<string>();
  let cursor: string | null = chosen;
  while (cursor !== null) {
    if (seen.has(cursor)) return null;
    seen.add(cursor);
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
  readonly mode?:
    | "naive"
    | "null"
    | "blind"
    | "cheat"
    | "competent"
    | "competent-deaf"
    | "tuned";
  /**
   * How long to keep trying to reach the control API before giving up.
   *
   * A player is routinely started *before* the simulator it talks to — the
   * harness spawns it, then brings up the control and operator APIs — so the
   * first ingestion attempt failing is the normal case rather than an error.
   * The wait belongs here, next to the fetch that fails, and not in a caller
   * that would have to tear the listener down to retry (`KNOWN-ISSUES.md` #46).
   */
  readonly ingestBudgetMs?: number;
}

/**
 * The default wait for the control API, and it **must exceed the simulator's
 * own** `PLAYER_BOOT_BUDGET_MS` — otherwise the player gives up first and the
 * simulator reports `never became ready` for a player that stopped trying.
 */
export const DEFAULT_INGEST_BUDGET_MS = 90_000;

interface Held {
  travellerRef: string;
  /** `${operator}:${trip}` for every transit leg this traveller depends on. */
  trips: string[];
  warned: boolean;
  /**
   * Where this traveller is going.
   *
   * Kept because `/v1/replan` deliberately does not re-send it
   * (`PLAYER-CONTRACT.md` §5.5). A player that forgot cannot reroute anybody,
   * which is the point: tracking your travellers is part of the job.
   */
  destination: { lat: number; lon: number };
}

export function startPlayer(opts: PlayerOptions): Promise<Server> {
  let model: Model | null = null;
  let ready = false;
  let operators: { id: string; base_url: string }[] = [];
  const mode = opts.mode ?? "naive";
  // **A diagnostic, not a competitor.** `competent-deaf` plans exactly as
  // `competent` does — same model, same offset correction, same transfer floor
  // — but never lets a realtime feed reach its routing. It still warns.
  //
  // It exists to settle KNOWN-ISSUES.md #17 by isolation: `blind` ignores
  // realtime and captures -0.178 while `competent` uses it and captures -0.597,
  // so reading the feeds appears to cost four tenths of the headroom. Those two
  // differ in their *planner* as well as in their realtime handling, so the
  // comparison cannot attribute to either. This differs in one thing only.
  const deaf = mode === "competent-deaf";
  // `tuned` plans exactly as `competent` does; what differs is that its model is
  // built from a memorised answer key rather than from inference (`tuning.ts`).
  const planner = deaf || mode === "tuned" ? "competent" : mode;
  const tuning =
    mode === "tuned" ? readTuning(process.env["TNS_TUNING"] ?? "worlds/m1.tuning.json") : undefined;

  // Itineraries this player has handed out, so it knows who to warn.
  const held = new Map<string, Held>();

  // A test fixture, not a competitor: opens the world directly and plans with
  // information no feed has published. The information-set audit exists to
  // catch exactly this (OBSERVABILITY.md §5).
  const cheat: CheatPlanner | null =
    mode === "cheat" ? makeCheatPlanner(process.env["TNS_WORLD"] ?? "worlds/m1.world.db") : null;

  // The competent integrator keeps its own reconciled model — offsets
  // corrected, encodings inferred, nearby stops linked rather than fused.
  let competent: CompetentModel | null = null;

  // Ingestion. The brief says where the operators are and nothing else — not
  // their schemas, not their quality, and certainly not how their stops relate
  // (PLAYER-CONTRACT.md §6.1). Everything past this point is inference.
  //
  // The timetables are static here, so one pass is enough; that is why this
  // milestone has no ticks to re-poll on.
  const ingest = async (): Promise<void> => {
    const brief = (await (await fetch(`${opts.controlUrl}/v1/brief`)).json()) as {
      limits?: { max_walk_m?: number; walk_speed_mps?: number };
      operators: { id: string; base_url: string }[];
    };
    operators = brief.operators;
    if (brief.limits?.max_walk_m) limits.maxWalkM = brief.limits.max_walk_m;
    if (brief.limits?.walk_speed_mps) limits.walkSpeedMps = brief.limits.walk_speed_mps;

    const timetables: Timetable[] = [];
    for (const op of brief.operators) {
      timetables.push((await (await fetch(`${op.base_url}/timetable`)).json()) as Timetable);
    }

    model = buildModel(timetables);
    if (planner === "competent") {
      // The brief states the world's timezone; no operator does. That single
      // published fact is what makes an offsetless timestamp decodable.
      const offsetS = /([+-])(\d{2}):?(\d{2})/.exec(
        String((brief as { world?: { utc_offset?: string } }).world?.utc_offset ?? "+03:00"),
      );
      const worldOffsetS = offsetS
        ? (offsetS[1] === "-" ? -1 : 1) * (Number(offsetS[2]) * 3600 + Number(offsetS[3]) * 60)
        : 3 * 3600;
      competent = buildCompetentModel(timetables, worldOffsetS, tuning);
    }
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
    if (mode === "null" || mode === "blind") return;

    const trouble = new Set<string>();
    for (const op of operators) {
      try {
        const feed = (await (await fetch(`${op.base_url}/realtime`)).json()) as {
          updates?: { trip_id: string; status: string; delay?: number }[];
        };
        if (competent) {
          // Infers delay units from magnitude, and treats a trip that has
          // vanished since the last look as cancelled rather than punctual.
          applyRealtime(competent, op.id, feed.updates ?? [], tuning);
          for (const k of competent.cancelled) trouble.add(k);
          for (const k of competent.delayed.keys()) trouble.add(k);
          if (deaf) {
            // Warn on what the feeds said, then forget it. Routing must not see
            // it, or the isolation this mode exists for is lost.
            competent.cancelled.clear();
            competent.delayed.clear();
          }
        } else {
          for (const u of feed.updates ?? []) {
            if (u.status === "cancelled" || (u.status === "delayed" && (u.delay ?? 0) > 0)) {
              trouble.add(`${op.id}:${u.trip_id}`);
            }
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
          name:
            mode === "null"
              ? "null-player"
              : mode === "competent"
                ? "competent-integrator"
                : NAME,
          version: VERSION,
          contract_versions: [CONTRACT_VERSION],
          // No `tick`: P0M1's timetable is static. No `notify`: no disruptions.
          // A `blind` player never asks for ticks, so it never sees a
          // realtime feed and can never warn anybody. It exists to show what
          // the Information family measures: the floor is not "warns badly",
          // it is "never looks".
          capabilities:
            mode === "null" || mode === "blind"
              ? ["plan", "replan"]
              : ["plan", "replan", "tick", "notify"],
          ...(mode === "null" || mode === "blind"
            ? {}
            : { tick: { interval_sim_s: planner === "competent" ? 60 : 120 } }),
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
          const departS = simSeconds(r.depart_after);

          const itinerary = cheat
            ? cheat.plan(r.origin, r.destination, departS)
            : competent
              ? planCompetently(competent, r.origin, r.destination, departS)
              : plan(model!, r.origin, r.destination, r.depart_after);
          if (itinerary === null) {
            return { request_id: r.request_id, status: "no_route", itinerary: null };
          }
          // Remember what this traveller is relying on, so a later feed update
          // can be matched back to somebody who needs telling.
          held.set(r.traveller_ref, {
            travellerRef: r.traveller_ref,
            trips: (itinerary.legs as Record<string, unknown>[])
              .filter((l) => l["mode"] === "transit")
              .map((l) => `${String(l["operator"])}:${String(l["trip"])}`),
            warned: false,
            destination: r.destination,
          });
          return { request_id: r.request_id, status: "ok", itinerary };
        });

        return json(res, 200, { results });
      }

      // A plan this player handed out has broken in front of a traveller
      // (`PLAYER-CONTRACT.md` §5.5). It is told where they are and what they
      // saw — never why — and must route them onward from there.
      //
      // Two things make this harder than `/v1/plan`, and both are the point:
      // the destination is not re-sent, so a player that did not track its
      // travellers cannot answer at all; and the position arrives as an
      // *operator-scoped* stop reference, so the player must resolve somebody
      // else's identifier to a place using its own merged model. This player
      // resolves it the lazy way — take the publisher's coordinates at face
      // value — and is charged for whatever those coordinates get wrong.
      if (req.method === "POST" && url.pathname === "/v1/replan") {
        if (!model) return json(res, 503, { title: "not ready", status: 503 });
        const body = JSON.parse(await readBody(req)) as {
          issued_at: string;
          requests: {
            request_id: string;
            traveller_ref: string;
            trigger: string;
            position: { kind: string; operator?: string; stop?: string };
            remaining_itinerary: { legs: unknown[] } | null;
          }[];
        };

        // The same frame the plan obligation uses. See `simSeconds`.
        const atS = simSeconds(body.issued_at);

        const results = body.requests.map((r) => {
          if (mode === "null") {
            return { request_id: r.request_id, status: "declined", itinerary: null };
          }

          const memory = held.get(r.traveller_ref);
          if (!memory) {
            // Never planned for this traveller, or forgot. Nothing honest to
            // say, and guessing a destination would be worse than declining.
            return { request_id: r.request_id, status: "declined", itinerary: null };
          }

          if (r.position.kind !== "at_stop" || !r.position.operator || !r.position.stop) {
            return { request_id: r.request_id, status: "no_route", itinerary: null };
          }

          // **Resolve the position in the player's own coordinate frame.**
          //
          // The simulator names the stop the way its operator publishes it,
          // which is the only reference it may use (§7). Turning that into a
          // place is the player's job, and a player that has corrected an
          // operator's systematic offset must resolve it through the corrected
          // model — otherwise it plans onward from a point displaced by the
          // very offset it worked out.
          //
          // Doing this through the naive model regardless was a bug introduced
          // with `/v1/replan` at P0M7. It was invisible at 22 travellers and
          // cost the competent solution 14 of its 22 failures at 132: it
          // answered `no_route` from a position it had been handed in the
          // wrong frame, and the traveller was stranded.
          const key = `${r.position.operator}:${r.position.stop}`;
          const corrected = competent?.byKey.get(key);
          const published = model!.stopByKey.get(key);
          const here = corrected ?? published;
          if (!here) {
            // The operator named a stop this player has no record of. That is
            // a coverage gap in what it ingested, not a routing failure.
            return { request_id: r.request_id, status: "no_route", itinerary: null };
          }

          const itinerary = cheat
            ? cheat.plan({ lat: here.lat, lon: here.lon }, memory.destination, atS)
            : competent
              ? planCompetently(competent, { lat: here.lat, lon: here.lon }, memory.destination, atS)
              : plan(model!, { lat: here.lat, lon: here.lon }, memory.destination, body.issued_at);

          if (itinerary === null) {
            return { request_id: r.request_id, status: "no_route", itinerary: null };
          }

          // The traveller is now relying on a different set of trips, so the
          // warning bookkeeping has to follow them.
          held.set(r.traveller_ref, {
            ...memory,
            trips: (itinerary.legs as Record<string, unknown>[])
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

  // **Bind once, ingest until it works.** Binding the port and reading the
  // brief are two different failures and only one of them is worth retrying:
  // the port is either ours or somebody else's, while the control API is
  // simply not up yet. Retrying both together is what `KNOWN-ISSUES.md` #46
  // was — the first attempt bound the port, ingestion failed, the listener was
  // never closed, and every retry died on EADDRINUSE while `/v1/health`
  // answered `starting` from the socket the first attempt had left behind.
  const budgetMs = opts.ingestBudgetMs ?? DEFAULT_INGEST_BUDGET_MS;

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      const startedMs = Date.now();
      let announced = false;

      const attempt = (): void => {
        ingest().then(
          () => resolve(server),
          (err: unknown) => {
            if (Date.now() - startedMs >= budgetMs) {
              // Give the port back, so whatever starts next gets a clean
              // failure rather than inheriting a listener that answers.
              server.close();
              reject(
                new Error(
                  `could not read the brief from ${opts.controlUrl} within ` +
                    `${(budgetMs / 1000).toFixed(0)}s: ${String(err)}`,
                ),
              );
              return;
            }
            if (!announced) {
              // Once, not every 50 ms: a run that ends in `never became ready`
              // should say what the player was waiting for, without burying it.
              announced = true;
              console.error(
                `player: ${opts.controlUrl} is not answering yet (${String(err)}); ` +
                  `retrying for up to ${(budgetMs / 1000).toFixed(0)}s`,
              );
            }
            setTimeout(attempt, 50);
          },
        );
      };

      attempt();
    });
  });
}
