// The run harness: a synchronous core driven by an asynchronous shell.
//
// Specification: PLAYER-CONTRACT.md §4, §5, §8, §9; TIME-MODEL.md §3, §4.
//
// This is the architectural seam P0M1 exists to prove. The simulation core is
// synchronous and forbidden from touching the wall clock or the network; the
// harness around it does all the I/O, pauses the clock while the player is
// thinking, and applies each answer at a deterministic simulated instant.

import { createHash } from "node:crypto";
import type { Server } from "node:http";
import type { Itinerary, RunRecord, World } from "@tns/schema";
import { renderSimTime, parseEpoch, CONTRACT_VERSION, SCORER_VERSION } from "@tns/schema";
import { EventQueue, makeVirtualClock, generateDisruptions, DisruptionTable } from "@tns/core";
import { buildIndex, route, executeReactively, type Access } from "@tns/router";
import { projectOperator } from "@tns/projections";
import {
  startControlApi,
  startOperatorApi,
  type NotificationRecord,
  type OperatorCall,
} from "./apis.ts";

const RUN_ID = "m1-demo";
/**
 * How far ahead of departure a traveller asks for a plan.
 *
 * Was twenty seconds, which is nobody's behaviour: you check before you set
 * out, not while stepping onto the pavement. That was not merely unrealistic —
 * it quietly broke two things.
 *
 * With plans issued twenty seconds before departure, every disruption relevant
 * to a journey had already been announced by the time it was planned. So there
 * was nothing a player could *fail* to know, which left the information-set
 * audit with nothing to detect, and it left the Information family with almost
 * no window in which a warning could still change anybody's mind.
 *
 * Half an hour of lead time restores both: some of the day's trouble is
 * genuinely unannounced when the plan is made, and a warning sent later has
 * somewhere to land.
 */
const PLAN_LEAD_S = 1800;
/** Simulated seconds a traveller will wait for a plan before acting alone. */
const PLAN_DEADLINE_S = 20;
/** Wall-clock anti-hang guard. Generous, and never scored (TIME-MODEL.md §4). */
const GUARD_WALL_S = 30;

export interface HarnessOptions {
  readonly world: World;
  readonly playerBaseUrl: string;
  /** First operator port; each operator gets the next one. */
  readonly operatorPort: number;
  readonly controlPort: number;
}

type Obligation =
  | { kind: "plan"; queryId: string; travellerRef: string; requestId: string }
  | { kind: "tick"; requestId: string };

export async function runOpenLoop(opts: HarnessOptions): Promise<RunRecord[]> {
  const { world } = opts;
  const anchor = parseEpoch(world.manifest.worldEpochIso);
  const log: RunRecord[] = [];

  // The day that actually happens. Drawn from the world seed, so it is the
  // same day on every machine and for every player.
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);
  const table = new DisruptionTable(disruptions);

  // P0 sees the day as it will be. Everyone else plans on the schedule.
  const oracleIx = buildIndex(world, disruptions);
  const scheduleIx = buildIndex(world);

  // ---- baselines ---------------------------------------------------------
  // P0 and P1 define the two ends of the capture scale (SCORING.md §2). They
  // are computed from L1 with no reference to the player at all.
  const accessFor = (queryId: string, endpoint: "origin" | "destination"): Access[] =>
    world.queryAccess
      .filter((a) => a.queryId === queryId && a.endpoint === endpoint)
      .map((a) => ({ quayId: a.quayId, seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps) }))
      .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

  const baselines = new Map<
    string,
    {
      p0: number | null;
      p0Wait: number | null;
      p1: number | null;
      p1Exec: ReturnType<typeof executeReactively>;
    }
  >();
  for (const q of world.queries) {
    const o = accessFor(q.id, "origin");
    const d = accessFor(q.id, "destination");
    const p0 = route(oracleIx, o, d, q.departAfterS, "all");
    // P1 is *executed*, not merely planned: it discovers each failure by
    // standing on a platform and replanning (REFERENCE-POLICY.md §4.3).
    const p1 = executeReactively(world, scheduleIx, disruptions, o, d, q.departAfterS, "obvious");
    baselines.set(q.id, {
      p0: p0 ? p0.arriveS - q.departAfterS : null,
      p0Wait: p0 ? p0.waitS : null,
      p1: p1.journeyS,
      p1Exec: p1,
    });
  }

  // ---- the clock and the event queue -------------------------------------
  // Obligations are issued well before the traveller wants to leave, so the
  // run starts earlier than the earliest departure.
  const firstTau = Math.min(...world.queries.map((q) => q.departAfterS - PLAN_LEAD_S));
  const clock = makeVirtualClock(firstTau);
  const queue = new EventQueue<Obligation>();

  for (const q of world.queries) {
    queue.push(q.departAfterS - PLAN_LEAD_S, {
      kind: "plan",
      queryId: q.id,
      travellerRef: `trv-${q.id}`,
      requestId: `req-${q.id}`,
    });
  }

  let state: "preparation" | "running" | "paused" | "ended" = "preparation";
  const ingestion: (OperatorCall & { operator: string; cause: string | null })[] = [];
  // The obligation currently being handled, for temporal attribution.
  let attributeTo: string | null = null;
  const notifications: NotificationRecord[] = [];

  // One API per operator, on its own host and port. They know nothing about
  // each other.
  const operatorUrls = new Map<string, string>();
  const servers: Server[] = [];

  for (const [i, op] of world.manifest.operators.entries()) {
    const port = opts.operatorPort + i;
    operatorUrls.set(op.id, `http://127.0.0.1:${port}`);
    servers.push(
      await startOperatorApi(
        world,
        op.id,
        disruptions,
        () => clock.now(),
        (call: OperatorCall) => ingestion.push({ ...call, operator: op.id, cause: attributeTo }),
        port,
      ),
    );
  }

  servers.push(
    await startControlApi(
      world,
      () => clock.now(),
      () => state,
      operatorUrls,
      (n) => notifications.push(n),
      opts.controlPort,
    ),
  );

  try {
    log.push({
      kind: "run_header",
      runId: RUN_ID,
      worldSeed: world.manifest.seed,
      worldContentHash: world.manifest.contentHash,
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
    const identity = await readIdentity(opts.playerBaseUrl);
    await post(opts.playerBaseUrl, "/v1/run-start", { run_id: RUN_ID });
    state = "running";

    // Ingestion cadence is simulator-driven. In `virtual` mode the clock
    // outruns any player-side polling loop, so a player that slept between
    // fetches would poll once for the whole day (TIME-MODEL.md §6).
    const tickInterval = identity.capabilities.includes("tick")
      ? Math.max(5, identity.tickIntervalS ?? 60)
      : 0;
    if (tickInterval > 0) {
      const lastTau = Math.max(...world.queries.map((q) => q.departAfterS)) + 3600;
      let n = 0;
      for (let t = firstTau; t <= lastTau; t += tickInterval) {
        queue.push(t, { kind: "tick", requestId: `tick-${String(n++).padStart(4, "0")}` });
      }
    }

    // ---- the run ---------------------------------------------------------
    // The resolution table, merged across operators. Private: it is how the
    // simulator reads a player's operator-scoped references back into
    // canonical entities, and it is never served (DATA-MODEL.md §4).
    const resolution = mergeResolutions(world, clock.now());
    const outcomes: RunRecord[] = [];

    for (;;) {
      const next = queue.pop();
      if (!next) break;

      clock.advanceTo(next.tau);
      const issuedAt = clock.now();
      // Bind once so the discriminant narrows across the early return below.
      const ob = next.payload;

      // Ticks come first at an equal instant, so the player is asked questions
      // with the freshest data it could have had (PLAYER-CONTRACT.md §5.6).
      if (ob.kind === "tick") {
        clock.pause();
        // Everything the player fetches from here until resume happens at this
        // τ, and the clock is frozen — so those calls are *provably* part of
        // this handler, whether or not the player propagates trace context
        // (OBSERVABILITY.md §3.1).
        attributeTo = ob.requestId;
        const t0 = Date.now();
        const ok = await sendTick(opts.playerBaseUrl, {
          contract_version: CONTRACT_VERSION,
          run_id: RUN_ID,
          sim_time: renderSimTime(anchor, issuedAt),
          guard_wall_s: GUARD_WALL_S,
        });
        clock.resume();
        attributeTo = null;
        log.push({
          kind: "obligation",
          obligation: "tick",
          requestId: ob.requestId,
          travellerRef: null,
          issuedAt,
          deadline: issuedAt,
          outcome: ok ? "ok" : "player_error",
          latencyMs: Date.now() - t0,
          itinerary: null,
        });
        continue;
      }

      const deadline = issuedAt + PLAN_DEADLINE_S;
      const query = world.queries.find((q) => q.id === ob.queryId)!;

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
            request_id: ob.requestId,
            traveller_ref: ob.travellerRef,
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

      // What the traveller actually did.
      //
      // An answer that arrives and works is used. An answer that arrives and
      // is wrong about the world is a modelling failure and the traveller does
      // not arrive. And an obligation the player did not answer at all falls
      // back to the reference policy — the traveller does what they would have
      // done in a city with no integration layer (REFERENCE-POLICY.md §8).
      //
      // That fallback is why declining can never be a winning strategy: the
      // player is charged P1's outcomes *and* a forgone obligation.
      const forgone = answer.itinerary === null;
      const simulated = forgone
        ? fallbackToReference(base.p1Exec)
        : simulateItinerary(world, resolution, table, answer.itinerary, query);

      log.push({
        kind: "obligation",
        obligation: "plan",
        requestId: ob.requestId,
        travellerRef: ob.travellerRef,
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
        travellerRef: ob.travellerRef,
        queryId: query.id,
        departAfter: query.departAfterS,
        arrived: simulated.arrived,
        journeyS: simulated.journeyS,
        waitS: simulated.waitS,
        transfers: simulated.transfers,
        failureReason: simulated.failureReason,
        forgone,
        oracleJourneyS: base.p0,
        referenceJourneyS: base.p1,
        oracleWaitS: base.p0Wait,
        referenceWaitS: base.p1Exec.waitS,
      });
    }

    // Who was materially affected, and by when they needed telling. Recorded
    // here so the scorer never has to consult the world (SCORING.md §1).
    const staleness = new Map(
      world.manifest.operators.map((o) => [
        o.id,
        ((o.manifest as { realtime?: { staleness_s?: number } }).realtime?.staleness_s ?? 0),
      ]),
    );
    const operatorOfJourney = new Map<string, string>();
    {
      const lineOfPattern = new Map(world.patterns.map((p) => [p.id, p.lineId]));
      const opOfLine = new Map(world.lines.map((l) => [l.id, l.operator]));
      for (const j of world.journeys) {
        const line = lineOfPattern.get(j.patternId);
        const op = line ? opOfLine.get(line) : undefined;
        if (op) operatorOfJourney.set(j.id, op);
      }
    }

    // Forgone obligations still owe the traveller a warning. They travel under
    // the reference policy and hit the same trouble, so declining does not make
    // the trouble go away — it only makes the player blind to it. Without these
    // events a player that answers nothing would face no material events at all
    // and score a *perfect* Information family, which is declining your way to
    // a flawless record (REFERENCE-POLICY.md §8).
    // `outcomes` rather than the log: traveller records are appended below,
    // so filtering the log here would iterate an empty list — which it did.
    for (const rec of outcomes) {
      const t = rec as Extract<RunRecord, { kind: "traveller" }>;
      if (t.kind !== "traveller" || !t.forgone) continue;
      const exec = baselines.get(t.queryId)?.p1Exec;
      const hit = exec?.disruptedEncountered[0];
      if (!hit) continue;
      const d = table.get(hit);
      if (!d) continue;
      const sk = staleness.get(operatorOfJourney.get(hit) ?? "") ?? 0;
      log.push({
        kind: "material_event",
        travellerRef: t.travellerRef,
        journeyId: hit,
        disruption: d.kind,
        announcedAtS: d.announcedAtS,
        knowableAtS: d.announcedAtS + sk,
        // No plan was issued, so the deadline is the moment they set out.
        lastDecisionPointS: t.departAfter,
      });
    }

    for (const rec of log.filter((r) => r.kind === "obligation" && r.obligation === "plan")) {
      const o = rec as Extract<RunRecord, { kind: "obligation" }>;
      if (!o.itinerary || !o.travellerRef) continue;

      let previousDepart: number | null = null;
      for (const leg of o.itinerary.legs) {
        if (leg.mode !== "transit") continue;
        const journeyId = resolution.tripToJourney.get(`${leg.operator}:${leg.trip}`);
        const journey = journeyId ? world.journeys.find((j) => j.id === journeyId) : undefined;
        if (!journeyId || !journey) continue;

        const d = table.get(journeyId);
        if (!d) {
          previousDepart = journey.startS;
          continue;
        }

        const sk = staleness.get(operatorOfJourney.get(journeyId) ?? "") ?? 0;
        log.push({
          kind: "material_event",
          travellerRef: o.travellerRef,
          journeyId,
          disruption: d.kind,
          announcedAtS: d.announcedAtS,
          knowableAtS: d.announcedAtS + sk,
          // Once aboard the previous leg the traveller is committed, so that
          // departure is the deadline. If the *first* leg is the one that
          // fails there is no previous leg, and the deadline is that service's
          // own scheduled departure — up to which the traveller is still
          // standing there able to do something else. Using the moment the
          // plan was issued instead, as the first version did, demanded a
          // warning before the player had even answered.
          lastDecisionPointS: previousDepart ?? journey.startS,
        });
        break;
      }
    }

    for (const n of notifications) {
      log.push({
        kind: "notification",
        tau: n.tau,
        travellerRef: n.travellerRef,
        notificationKind: n.kind,
        message: n.message,
      });
    }

    // Ingestion is appended in τ order, so the log reads as a narrative.
    for (const call of ingestion) {
      log.push({
        kind: "ingestion",
        tau: call.tau,
        operator: call.operator,
        endpoint: call.endpoint,
        status: call.status,
        bytes: call.bytes,
        bodyHash: call.bodyHash,
        cause: call.cause,
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

/**
 * The resolution table across every operator.
 *
 * **Keyed by `operator:published_id`, and that is not a convenience.** Two
 * operators number their stops from 1, so `7` denotes a different physical
 * place depending on who published it (catalogue A: ID collisions). A table
 * keyed on the identifier alone would silently fuse them — which is exactly
 * the mistake a careless player makes, and the simulator must not make it
 * while judging them.
 *
 * Values are quay *lists*: an operator publishing at Site granularity has one
 * stop standing for every quay in the Site, so resolving a boarding needs the
 * trip as well as the stop.
 *
 * Kept private. It is the answer to the entity-resolution problem, and is
 * never served over any API (DATA-MODEL.md §4).
 */
interface MergedResolution {
  stopToQuays: Map<string, readonly string[]>;
  tripToJourney: Map<string, string>;
}

function mergeResolutions(world: World, tau: number): MergedResolution {
  const stopToQuays = new Map<string, readonly string[]>();
  const tripToJourney = new Map<string, string>();

  for (const op of world.manifest.operators) {
    const r = projectOperator(world, op.id, tau).resolution;
    for (const [stop, quays] of r.stopToQuays) stopToQuays.set(`${op.id}:${stop}`, quays);
    for (const [trip, journey] of r.tripToJourney) tripToJourney.set(`${op.id}:${trip}`, journey);
  }

  return { stopToQuays, tripToJourney };
}

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

interface PlayerIdentity {
  readonly capabilities: readonly string[];
  readonly tickIntervalS: number | null;
}

async function readIdentity(baseUrl: string): Promise<PlayerIdentity> {
  try {
    const res = await fetch(`${baseUrl}/v1/identity`);
    const body = (await res.json()) as {
      capabilities?: string[];
      tick?: { interval_sim_s?: number };
    };
    return {
      capabilities: body.capabilities ?? [],
      tickIntervalS: body.tick?.interval_sim_s ?? null,
    };
  } catch {
    return { capabilities: [], tickIntervalS: null };
  }
}

async function sendTick(baseUrl: string, body: unknown): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUARD_WALL_S * 1000);
  try {
    const res = await fetch(`${baseUrl}/v1/tick`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
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
 * The documented degraded behaviour for an unanswered obligation.
 *
 * The traveller falls back to the reference policy: they travel as anyone in
 * this city would without an integration layer. They are not stranded, and the
 * run does not abort — robustness is measured, not punished by forfeit
 * (PLAYER-CONTRACT.md §8).
 */
function fallbackToReference(p1: ReturnType<typeof executeReactively>): Simulated {
  return {
    arrived: p1.arrived,
    journeyS: p1.journeyS,
    waitS: p1.waitS,
    transfers: p1.transfers,
    failureReason: p1.arrived ? "forgone_used_reference_policy" : `forgone_and_${p1.failureReason}`,
  };
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
 * P0M1 found exactly that on its first run.
 */
function simulateItinerary(
  world: World,
  resolution: MergedResolution,
  table: DisruptionTable,
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

    // Identifiers are only meaningful *within* an operator: two of them number
    // their stops from 1, so `7` denotes a different place depending on who
    // published it (catalogue A). The simulator must not make the mistake it
    // is judging the player for.
    const journeyId = resolution.tripToJourney.get(`${leg.operator}:${leg.trip}`);
    const journey = journeyId ? journeyById.get(journeyId) : undefined;
    if (!journey) return fail(`unknown_trip:${leg.operator}/${leg.trip}`);
    const pattern = patternById.get(journey.patternId);
    if (!pattern) return fail(`unknown_pattern:${journey.patternId}`);

    // A published stop may stand for several quays — an operator publishing at
    // Site granularity has one stop for a whole interchange — so the *trip*
    // decides which quay the traveller actually boards at.
    const fromQuays = resolution.stopToQuays.get(`${leg.operator}:${leg.from_stop}`);
    const toQuays = resolution.stopToQuays.get(`${leg.operator}:${leg.to_stop}`);
    if (!fromQuays || !toQuays) {
      return fail(`unknown_stop:${leg.operator}/${leg.from_stop}|${leg.to_stop}`);
    }

    const boardIdx = pattern.stops.findIndex((st) => fromQuays.includes(st.quayId));
    const alightIdx = pattern.stops.findIndex((st) => toQuays.includes(st.quayId));
    if (boardIdx < 0 || alightIdx < 0) return fail("trip_does_not_serve_stops");
    if (alightIdx <= boardIdx) return fail("legs_out_of_order");

    const fromQuay = pattern.stops[boardIdx]!.quayId;
    const toQuay = pattern.stops[alightIdx]!.quayId;

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

    // What the world actually does, not what the timetable said.
    if (table.isCancelled(journey.id)) return fail(`trip_cancelled:${leg.trip}`);
    const delayS = table.actualDelayS(journey.id);

    const departS = journey.startS + delayS + pattern.stops[boardIdx]!.departOffsetS;
    const arriveS = journey.startS + delayS + pattern.stops[alightIdx]!.arriveOffsetS;
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
