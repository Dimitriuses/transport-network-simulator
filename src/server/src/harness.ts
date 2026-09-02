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
import type {
  Itinerary,
  ObligationOutcome,
  Leg,
  ReplanPosition,
  ReplanTrigger,
  RunRecord,
  World,
} from "@tns/schema";
import { renderSimTime, parseEpoch, CONTRACT_VERSION, SCORER_VERSION } from "@tns/schema";
import {
  EventQueue,
  makeVirtualClock,
  generateDisruptions,
  DisruptionTable,
  type Disruption,
} from "@tns/core";
import {
  buildIndex,
  route,
  executeReactively,
  MAX_REPLANS,
  type Access,
} from "@tns/router";
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
        : await drivePlan(
            {
              world,
              resolution,
              table,
              scheduleIx,
              disruptions,
              destinations: accessFor(query.id, "destination"),
              anchor,
              playerBaseUrl: opts.playerBaseUrl,
              clock,
              log,
            },
            query,
            ob.travellerRef,
            ob.requestId,
            answer.itinerary.legs,
          );

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
  readonly outcome: ObligationOutcome;
  readonly itinerary: Itinerary | null;
}

async function askPlayer(
  baseUrl: string,
  request: unknown,
  endpoint: "plan" | "replan" = "plan",
): Promise<PlayerAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUARD_WALL_S * 1000);
  try {
    const res = await fetch(`${baseUrl}/v1/${endpoint}`, {
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
    // Replan-only. Both are real answers rather than refusals, and both are
    // charged for what happens next (`PLAYER-CONTRACT.md` §5.5).
    if (first.status === "continue") return { outcome: "continue", itinerary: null };
    if (first.status === "abandon") return { outcome: "abandon", itinerary: null };
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
 * Where a traveller has got to, so a broken plan can be resumed rather than
 * simply abandoned.
 */
interface Progress {
  cursorS: number;
  atQuay: string | null;
  waitS: number;
  transitLegsTaken: number;
}

/**
 * The plan broke somewhere a traveller could perceive it breaking.
 *
 * Carries the operator-scoped position (§7) and the untravelled remainder, so
 * the harness can issue `/v1/replan` and resume from here.
 */
interface PlanBreak {
  kind: "break";
  trigger: ReplanTrigger;
  position: ReplanPosition;
  progress: Progress;
  remaining: readonly Leg[];
  /** The journey the traveller was relying on when it broke. */
  journeyId: string;
}

type StepOutcome = (Simulated & { kind: "settled" }) | PlanBreak;

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
 *
 * **Two kinds of wrong, and only one of them earns a second chance.** A plan
 * naming a trip that does not exist is malformed, and the traveller never sets
 * out — there is nothing to perceive and nothing to replan around. A plan whose
 * vehicle is cancelled, or whose connection is missed, breaks *in front of the
 * traveller*, at a place and a time. That is a `replan` (§5.5), and until P0M7
 * it was scored identically to the malformed case.
 */
function simulateFrom(
  world: World,
  resolution: MergedResolution,
  table: DisruptionTable,
  legs: readonly Leg[] | null,
  query: { id: string; departAfterS: number },
  start: Progress,
): StepOutcome {
  const fail = (reason: string): StepOutcome => ({
    kind: "settled",
    arrived: false,
    journeyS: null,
    waitS: start.waitS,
    transfers: Math.max(0, start.transitLegsTaken - 1),
    failureReason: reason,
  });

  if (!legs) return fail("no_itinerary");

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

  const transitLegs = legs.filter((l) => l.mode === "transit");
  if (transitLegs.length === 0) return fail("no_transit_legs");

  let cursor = start.cursorS;
  let waitS = start.waitS;
  let taken = start.transitLegsTaken;
  let atQuay: string | null = start.atQuay;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    if (leg.mode === "walk") continue; // charged by connectivity below

    // Everything from this leg onward, for the replan payload.
    const remaining = legs.slice(i);
    const at = (trigger: ReplanTrigger, journeyId: string): PlanBreak => ({
      kind: "break",
      trigger,
      position: { kind: "at_stop", operator: leg.operator, stop: leg.from_stop },
      progress: { cursorS: cursor, atQuay, waitS, transitLegsTaken: taken },
      remaining,
      journeyId,
    });

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
      // Mid-journey this is not a malformed plan — the traveller is standing
      // somewhere real and cannot get to the next boarding point. They are
      // stranded, which is something they can perceive and report.
      if (walk === null) return at("stranded", journey.id);
      cursor += walk;
    }
    atQuay = fromQuay;

    // What the world actually does, not what the timetable said.
    if (table.isCancelled(journey.id)) {
      // They find out by standing on the platform and watching it not arrive.
      // The wait is real and is charged (REFERENCE-POLICY.md §4.3).
      const scheduled = journey.startS + pattern.stops[boardIdx]!.departOffsetS;
      waitS += Math.max(0, scheduled - cursor);
      cursor = Math.max(cursor, scheduled);
      return at("vehicle_cancelled", journey.id);
    }
    const delayS = table.actualDelayS(journey.id);

    const departS = journey.startS + delayS + pattern.stops[boardIdx]!.departOffsetS;
    const arriveS = journey.startS + delayS + pattern.stops[alightIdx]!.arriveOffsetS;
    if (departS < cursor) return at("missed_connection", journey.id);

    waitS += departS - cursor;
    cursor = arriveS;
    atQuay = toQuay;
    taken++;
  }

  const finalWalk = accessSeconds("destination", atQuay!);
  if (finalWalk === null) return fail(`destination_unreachable:${atQuay}`);
  cursor += finalWalk;

  return {
    kind: "settled",
    arrived: true,
    journeyS: cursor - query.departAfterS,
    waitS,
    transfers: Math.max(0, taken - 1),
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

/**
 * A traveller stranded mid-journey with no usable advice does what anyone in a
 * city with no integration layer does: replans for themselves, from where they
 * stand, on the published schedule (`REFERENCE-POLICY.md` §4.3 and §8).
 *
 * Time and waiting already spent are carried forward — they happened. This is
 * the *cost* of the player's failed plan, not a fresh start.
 */
function resumeUnderReference(
  world: World,
  scheduleIx: ReturnType<typeof buildIndex>,
  disruptions: readonly Disruption[],
  destinations: readonly Access[],
  brk: PlanBreak,
  query: { id: string; departAfterS: number },
  reason: string,
): Simulated {
  const spentS = brk.progress.cursorS - query.departAfterS;
  const priorWaitS = brk.progress.waitS;
  const priorLegs = brk.progress.transitLegsTaken;

  if (brk.progress.atQuay === null) {
    return {
      arrived: false,
      journeyS: null,
      waitS: priorWaitS,
      transfers: Math.max(0, priorLegs - 1),
      failureReason: reason,
    };
  }

  const exec = executeReactively(
    world,
    scheduleIx,
    disruptions,
    [{ quayId: brk.progress.atQuay, seconds: 0 }],
    destinations,
    brk.progress.cursorS,
    "obvious",
  );

  return {
    arrived: exec.arrived,
    journeyS: exec.journeyS === null ? null : spentS + exec.journeyS,
    waitS: priorWaitS + exec.waitS,
    transfers: Math.max(0, priorLegs + exec.transfers - 1),
    failureReason: exec.arrived ? reason : `${reason}_then_${exec.failureReason}`,
  };
}

interface ReplanContext {
  readonly world: World;
  readonly resolution: MergedResolution;
  readonly table: DisruptionTable;
  readonly scheduleIx: ReturnType<typeof buildIndex>;
  readonly disruptions: readonly Disruption[];
  readonly destinations: readonly Access[];
  readonly anchor: ReturnType<typeof parseEpoch>;
  readonly playerBaseUrl: string;
  readonly clock: ReturnType<typeof makeVirtualClock>;
  readonly log: RunRecord[];
}

/**
 * Walk a player's plan through the day, asking it again whenever the plan
 * breaks in front of the traveller.
 *
 * Specification: `PLAYER-CONTRACT.md` §5.5.
 *
 * Until P0M7 this loop did not exist: a plan that met a cancelled vehicle
 * simply failed. Two things were wrong with that. The obvious one is that half
 * of what a live integration layer is *for* — noticing trouble and rerouting
 * somebody around it — was unmeasurable. The less obvious one is that it
 * suppressed the very thing Gate 3 measures: a player that only answers once,
 * half an hour before departure, has almost nothing to reconcile, so it cannot
 * be punished for reconciling badly (`KNOWN-ISSUES.md` #1).
 */
async function drivePlan(
  ctx: ReplanContext,
  query: { id: string; departAfterS: number },
  travellerRef: string,
  baseRequestId: string,
  initialLegs: readonly Leg[],
): Promise<Simulated> {
  const settle = (s: Extract<StepOutcome, { kind: "settled" }>): Simulated => ({
    arrived: s.arrived,
    journeyS: s.journeyS,
    waitS: s.waitS,
    transfers: s.transfers,
    failureReason: s.failureReason,
  });
  const giveUp = (brk: PlanBreak, reason: string): Simulated => ({
    arrived: false,
    journeyS: null,
    waitS: brk.progress.waitS,
    transfers: Math.max(0, brk.progress.transitLegsTaken - 1),
    failureReason: reason,
  });

  let legs: readonly Leg[] = initialLegs;
  let step = simulateFrom(ctx.world, ctx.resolution, ctx.table, legs, query, {
    cursorS: query.departAfterS,
    atQuay: null,
    waitS: 0,
    transitLegsTaken: 0,
  });

  for (let attempt = 1; step.kind === "break"; attempt++) {
    // The same budget the reference policy gets. A player allowed more
    // attempts than P1 would be compared against a traveller held to a
    // stricter rule than itself.
    if (attempt > MAX_REPLANS) return giveUp(step, "abandoned_after_replans");

    const issuedAt = step.progress.cursorS;
    const deadline = issuedAt + PLAN_DEADLINE_S;
    const requestId = `${baseRequestId}-r${attempt}`;

    ctx.clock.pause();
    const startedMs = Date.now();
    const answer = await askPlayer(
      ctx.playerBaseUrl,
      {
        contract_version: CONTRACT_VERSION,
        run_id: RUN_ID,
        issued_at: renderSimTime(ctx.anchor, issuedAt),
        deadline: renderSimTime(ctx.anchor, deadline),
        guard_wall_s: GUARD_WALL_S,
        requests: [
          {
            request_id: requestId,
            traveller_ref: travellerRef,
            // What the traveller perceives, never why. Naming the cause would
            // hand over the answer to catalogue §2.1 D.
            trigger: step.trigger,
            position: step.position,
            remaining_itinerary: { legs: step.remaining },
          },
        ],
      },
      "replan",
    );
    const latencyMs = Date.now() - startedMs;
    ctx.clock.resume();

    ctx.log.push({
      kind: "obligation",
      obligation: "replan",
      requestId,
      travellerRef,
      issuedAt,
      deadline,
      outcome: answer.outcome,
      latencyMs,
      itinerary: answer.itinerary,
      trigger: step.trigger,
      attempt,
    });

    if (answer.outcome === "ok" && answer.itinerary) {
      legs = answer.itinerary.legs;
      step = simulateFrom(ctx.world, ctx.resolution, ctx.table, legs, query, step.progress);
      continue;
    }

    // The player advised giving up, and is charged for it exactly as it would
    // be charged for failing to route them. Advising abandonment to a traveller
    // who could still have arrived is a real cost, which is what stops
    // `abandon` becoming a cheap way out of a hard reroute.
    if (answer.outcome === "abandon") return giveUp(step, "advised_abandon");

    // `continue`, `no_route`, `declined`, an error or a timeout all leave the
    // traveller standing where they are with no usable advice. `continue`
    // reaches here because the leg it wants to continue onto is the one that
    // just broke.
    return resumeUnderReference(
      ctx.world,
      ctx.scheduleIx,
      ctx.disruptions,
      ctx.destinations,
      step,
      query,
      `replan_${answer.outcome}`,
    );
  }

  return settle(step);
}
