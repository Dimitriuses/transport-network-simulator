// The run harness: a synchronous core driven by an asynchronous shell.
//
// Specification: PLAYER-CONTRACT.md §4, §5, §8, §9; TIME-MODEL.md §3, §4.
//
// This is the architectural seam M1 exists to prove. The simulation core is
// synchronous and forbidden from touching the wall clock or the network; the
// harness around it does all the I/O, pauses the clock while the player is
// thinking, and applies each answer at a deterministic simulated instant.

import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { Itinerary, RunRecord, World } from "@tns/schema";
import { renderSimTime, parseEpoch, CONTRACT_VERSION, SCORER_VERSION } from "@tns/schema";
import { EventQueue, makeVirtualClock } from "@tns/core";
import { buildIndex, route, type Access } from "@tns/router";
import { projectOperator } from "@tns/projections";
import { startControlApi, startOperatorApi, type OperatorCall } from "./apis.ts";

const RUN_ID = "m1-demo";
/** Simulated seconds a traveller will wait for a plan before acting alone. */
const PLAN_DEADLINE_S = 20;
/** Wall-clock anti-hang guard. Generous, and never scored (TIME-MODEL.md §4). */
const GUARD_WALL_S = 30;

export interface HarnessOptions {
  readonly world: World;
  readonly playerBaseUrl: string;
  readonly operatorPort: number;
  readonly controlPort: number;
}

interface PlanObligation {
  readonly kind: "plan";
  readonly queryId: string;
  readonly travellerRef: string;
  readonly requestId: string;
}

export async function runOpenLoop(opts: HarnessOptions): Promise<RunRecord[]> {
  const { world } = opts;
  const anchor = parseEpoch(world.manifest.worldEpochIso);
  const ix = buildIndex(world);
  const log: RunRecord[] = [];

  // ---- baselines ---------------------------------------------------------
  // P0 and P1 define the two ends of the capture scale (SCORING.md §2). They
  // are computed from L1 with no reference to the player at all.
  const accessFor = (queryId: string, endpoint: "origin" | "destination"): Access[] =>
    world.queryAccess
      .filter((a) => a.queryId === queryId && a.endpoint === endpoint)
      .map((a) => ({ quayId: a.quayId, seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps) }))
      .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

  const baselines = new Map<string, { p0: number | null; p1: number | null }>();
  for (const q of world.queries) {
    const o = accessFor(q.id, "origin");
    const d = accessFor(q.id, "destination");
    const p0 = route(ix, o, d, q.departAfterS, "all");
    const p1 = route(ix, o, d, q.departAfterS, "obvious");
    baselines.set(q.id, {
      p0: p0 ? p0.arriveS - q.departAfterS : null,
      p1: p1 ? p1.arriveS - q.departAfterS : null,
    });
  }

  // ---- the clock and the event queue -------------------------------------
  // Obligations are issued one deadline *before* the traveller wants to leave,
  // so the run starts earlier than the earliest departure.
  const firstTau = Math.min(...world.queries.map((q) => q.departAfterS - PLAN_DEADLINE_S));
  const clock = makeVirtualClock(firstTau);
  const queue = new EventQueue<PlanObligation>();

  for (const q of world.queries) {
    queue.push(q.departAfterS - PLAN_DEADLINE_S, {
      kind: "plan",
      queryId: q.id,
      travellerRef: `trv-${q.id}`,
      requestId: `req-${q.id}`,
    });
  }

  let state: "preparation" | "running" | "paused" | "ended" = "preparation";
  const ingestion: OperatorCall[] = [];

  const operator = await startOperatorApi(
    world,
    () => clock.now(),
    (call) => ingestion.push(call),
    opts.operatorPort,
  );
  const control = await startControlApi(
    world,
    () => clock.now(),
    () => state,
    `http://127.0.0.1:${opts.operatorPort}`,
    opts.controlPort,
  );

  const servers: Server[] = [operator, control];

  try {
    log.push({
      kind: "run_header",
      runId: RUN_ID,
      worldSeed: world.manifest.seed,
      engineVersion: world.manifest.engineVersion,
      scorerVersion: SCORER_VERSION,
      contractVersion: CONTRACT_VERSION,
      timeMode: "virtual",
      latencyMode: "none",
      referenceCompetence: "timetable",
      hardwareProfile: null,
    });

    // ---- lifecycle -------------------------------------------------------
    await waitForHealth(opts.playerBaseUrl);
    await post(opts.playerBaseUrl, "/v1/run-start", { run_id: RUN_ID });
    state = "running";

    // ---- the run ---------------------------------------------------------
    const { resolution } = projectOperator(world, clock.now());
    const outcomes: RunRecord[] = [];

    for (;;) {
      const next = queue.pop();
      if (!next) break;

      clock.advanceTo(next.tau);
      const issuedAt = clock.now();
      const deadline = issuedAt + PLAN_DEADLINE_S;
      const query = world.queries.find((q) => q.id === next.payload.queryId)!;

      // The clock stops while the player thinks. Safe only because operator
      // responses are pure functions of τ (TIME-MODEL.md §3).
      clock.pause();

      const startedMs = Date.now();
      const answer = await askPlayer(opts.playerBaseUrl, {
        contract_version: CONTRACT_VERSION,
        run_id: RUN_ID,
        issued_at: renderSimTime(anchor, issuedAt),
        deadline: renderSimTime(anchor, deadline),
        guard_wall_s: GUARD_WALL_S,
        requests: [
          {
            request_id: next.payload.requestId,
            traveller_ref: next.payload.travellerRef,
            origin: { lat: query.originLat, lon: query.originLon },
            destination: { lat: query.destLat, lon: query.destLon },
            depart_after: renderSimTime(anchor, query.departAfterS),
            arrive_by: null,
          },
        ],
      });
      const latencyMs = Date.now() - startedMs;

      clock.resume();

      const base = baselines.get(query.id)!;
      const simulated = simulateItinerary(world, resolution, anchor, answer.itinerary, query);

      log.push({
        kind: "obligation",
        obligation: "plan",
        requestId: next.payload.requestId,
        travellerRef: next.payload.travellerRef,
        issuedAt,
        deadline,
        outcome: answer.outcome,
        // Recorded, and inert: in `virtual` mode response speed cannot
        // influence the world, so it cannot influence the score.
        latencyMs,
        itinerary: answer.itinerary,
      });

      outcomes.push({
        kind: "traveller",
        travellerRef: next.payload.travellerRef,
        queryId: query.id,
        departAfter: query.departAfterS,
        arrived: simulated.arrived,
        journeyS: simulated.journeyS,
        waitS: simulated.waitS,
        transfers: simulated.transfers,
        failureReason: simulated.failureReason,
        oracleJourneyS: base.p0,
        referenceJourneyS: base.p1,
      });
    }

    // Ingestion is appended in τ order, so the log reads as a narrative.
    for (const call of ingestion) {
      log.push({
        kind: "ingestion",
        tau: call.tau,
        operator: world.manifest.operatorId,
        endpoint: call.endpoint,
        status: call.status,
        bytes: call.bytes,
        bodyHash: call.bodyHash,
        // M1's player ingests before the run starts, so no obligation caused
        // this call. Attribution arrives with ticks at M4.
        cause: null,
      });
    }
    log.push(...outcomes);

    state = "ended";
    await post(opts.playerBaseUrl, "/v1/run-end", { run_id: RUN_ID, reason: "completed" });

    return log;
  } finally {
    for (const s of servers) await new Promise<void>((r) => s.close(() => r()));
  }
}

// ---------------------------------------------------------------------------

async function waitForHealth(baseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/v1/health`);
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status === "ready") return;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`player at ${baseUrl} never became ready`);
}

async function post(baseUrl: string, path: string, body: unknown): Promise<void> {
  try {
    await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Lifecycle notifications: responses are ignored and a failure to respond
    // is not scored (PLAYER-CONTRACT.md §5.7).
  }
}

interface PlayerAnswer {
  readonly outcome: "ok" | "no_route" | "declined" | "player_error" | "player_timeout";
  readonly itinerary: Itinerary | null;
}

async function askPlayer(baseUrl: string, request: unknown): Promise<PlayerAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUARD_WALL_S * 1000);
  try {
    const res = await fetch(`${baseUrl}/v1/plan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) return { outcome: "player_error", itinerary: null };

    const body = (await res.json()) as {
      results?: { status?: string; itinerary?: Itinerary | null }[];
    };
    const first = body.results?.[0];
    if (!first) return { outcome: "player_error", itinerary: null };

    if (first.status === "ok" && first.itinerary) {
      return { outcome: "ok", itinerary: first.itinerary };
    }
    if (first.status === "no_route") return { outcome: "no_route", itinerary: null };
    if (first.status === "declined") return { outcome: "declined", itinerary: null };
    return { outcome: "player_error", itinerary: null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { outcome: aborted ? "player_timeout" : "player_error", itinerary: null };
  } finally {
    clearTimeout(timer);
  }
}

interface Simulated {
  arrived: boolean;
  journeyS: number | null;
  waitS: number;
  transfers: number;
  failureReason: string | null;
}

/**
 * Walk a player's itinerary against the fixed trajectory.
 *
 * An itinerary the simulator cannot resolve is *not* a transport error. It is
 * a well-formed answer that is wrong about the world, and is recorded as a
 * modelling failure (PLAYER-CONTRACT.md §7).
 *
 * Crucially this charges for *every* movement, including the access walks at
 * either end that the player's itinerary does not mention. Without that, a
 * player's journey silently begins at whichever quay it chose to board — a free
 * teleport from the origin — and it can beat the oracle, which is impossible.
 * M1 found exactly that on its first run.
 */
function simulateItinerary(
  world: World,
  resolution: ReturnType<typeof projectOperator>["resolution"],
  _anchor: ReturnType<typeof parseEpoch>,
  itinerary: Itinerary | null,
  query: { id: string; departAfterS: number },
): Simulated {
  const fail = (reason: string): Simulated => ({
    arrived: false,
    journeyS: null,
    waitS: 0,
    transfers: 0,
    failureReason: reason,
  });

  if (!itinerary) return fail("no_itinerary");

  const journeyById = new Map(world.journeys.map((j) => [j.id, j]));
  const patternById = new Map(world.patterns.map((p) => [p.id, p]));
  const walkSpeed = world.manifest.walkSpeedMps;

  const accessSeconds = (endpoint: "origin" | "destination", quayId: string): number | null => {
    const row = world.queryAccess.find(
      (a) => a.queryId === query.id && a.endpoint === endpoint && a.quayId === quayId,
    );
    return row ? Math.ceil(row.metres / walkSpeed) : null;
  };

  const walkBetween = (fromQuay: string, toQuay: string): number | null => {
    if (fromQuay === toQuay) return 0;
    const link = world.walkLinks.find((l) => l.fromQuay === fromQuay && l.toQuay === toQuay);
    return link ? Math.ceil(link.metres / walkSpeed) : null;
  };

  const transitLegs = itinerary.legs.filter((l) => l.mode === "transit");
  if (transitLegs.length === 0) return fail("no_transit_legs");

  let cursor = query.departAfterS;
  let waitS = 0;
  let atQuay: string | null = null;

  for (const leg of itinerary.legs) {
    if (leg.mode === "walk") continue; // charged by connectivity below

    const journeyId = resolution.tripToJourney.get(leg.trip);
    const journey = journeyId ? journeyById.get(journeyId) : undefined;
    if (!journey) return fail(`unknown_trip:${leg.trip}`);
    const pattern = patternById.get(journey.patternId);
    if (!pattern) return fail(`unknown_pattern:${journey.patternId}`);

    const fromQuay = resolution.stopToQuay.get(leg.from_stop);
    const toQuay = resolution.stopToQuay.get(leg.to_stop);
    if (!fromQuay || !toQuay) return fail(`unknown_stop:${leg.from_stop}/${leg.to_stop}`);

    // Getting to this boarding point costs time, whether from the origin or
    // from where the previous leg left the traveller standing.
    if (atQuay === null) {
      const access = accessSeconds("origin", fromQuay);
      if (access === null) return fail(`origin_unreachable:${leg.from_stop}`);
      cursor += access;
    } else {
      const walk = walkBetween(atQuay, fromQuay);
      if (walk === null) return fail(`transfer_unreachable:${atQuay}->${fromQuay}`);
      cursor += walk;
    }

    const boardIdx = pattern.stops.findIndex((s) => s.quayId === fromQuay);
    const alightIdx = pattern.stops.findIndex((s) => s.quayId === toQuay);
    if (boardIdx < 0 || alightIdx < 0) return fail("trip_does_not_serve_stops");
    if (alightIdx <= boardIdx) return fail("legs_out_of_order");

    const departS = journey.startS + pattern.stops[boardIdx]!.departOffsetS;
    const arriveS = journey.startS + pattern.stops[alightIdx]!.arriveOffsetS;
    if (departS < cursor) return fail("missed_departure");

    waitS += departS - cursor;
    cursor = arriveS;
    atQuay = toQuay;
  }

  const finalWalk = accessSeconds("destination", atQuay!);
  if (finalWalk === null) return fail(`destination_unreachable:${atQuay}`);
  cursor += finalWalk;

  return {
    arrived: true,
    journeyS: cursor - query.departAfterS,
    waitS,
    transfers: transitLegs.length - 1,
    failureReason: null,
  };
}

/**
 * Hash of the *deterministic* content of a run log — the golden trajectory.
 *
 * The log deliberately contains wall-clock diagnostics: `latencyMs` is
 * recorded for every obligation and is, by design, different on every run and
 * every machine (TIME-MODEL.md §5). Hashing it would make the golden-trajectory
 * test fail constantly for the one reason that proves the design is working.
 *
 * So the hash covers what the simulation *decided*, and excludes what the
 * machine happened to do. Anything added to the log that derives from wall time
 * must be excluded here too, or this test becomes noise and gets deleted.
 */
export function hashLog(log: readonly RunRecord[]): string {
  const deterministic = log.map((record) =>
    record.kind === "obligation" ? { ...record, latencyMs: null } : record,
  );
  return createHash("sha256").update(JSON.stringify(deterministic)).digest("hex").slice(0, 16);
}
