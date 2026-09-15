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
  Movement,
  MovementObserver,
  RunRecord,
  World,
} from "@tns/schema";
import {
  renderSimTime,
  parseEpoch,
  CONTRACT_VERSION,
  SCORER_VERSION,
  PlanResponse,
  ReplanResponse,
} from "@tns/schema";
import {
  EventQueue,
  makeVirtualClock,
  generateDisruptions,
  DisruptionTable,
  makeRng,
  below,
  type Disruption,
  type TimeMode,
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
  ABORT_AFTER_CONSECUTIVE_FAILURES,
  GUARD_WALL_S,
  MIN_TICK_INTERVAL_S,
  PREPARATION_WALL_BUDGET_S,
  RUN_WALL_BUDGET_S,
} from "./limits.ts";
import {
  briefDigest,
  buildBrief,
  startControlApi,
  startOperatorApi,
  type NotificationRecord,
  type OperatorCall,
} from "./apis.ts";
import { makePacer, systemTimer, type Pacer, type WallTimer } from "./pacing.ts";
import { PAUSE_QUEUE_DEPTH, type ControlRequest, type RunControl } from "./control.ts";

const RUN_ID = "m1-demo";
/** At one instant a tick goes before a plan or replan (PLAYER-CONTRACT.md §5.6). */
const RANK_TICK = 0;
const RANK_OBLIGATION = 1;
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
export const PLAN_LEAD_S = 1800;
/** Simulated seconds a traveller will wait for a plan before acting alone. */
export const PLAN_DEADLINE_S = 20;
export {
  ABORT_AFTER_CONSECUTIVE_FAILURES,
  GUARD_WALL_S,
  PREPARATION_WALL_BUDGET_S,
  RUN_WALL_BUDGET_S,
} from "./limits.ts";

export interface HarnessOptions {
  readonly world: World;
  readonly playerBaseUrl: string;
  /** First operator port; each operator gets the next one. */
  readonly operatorPort: number;
  readonly controlPort: number;
  /**
   * How τ advances (TIME-MODEL.md §2). `virtual` — the default, and the only
   * mode whose scores compare — jumps from event to event and stops while the
   * player answers. `realtime` tracks wall time 1:1 and `scaled` runs at
   * `speed`×; both keep the clock running during handlers and enforce plan
   * deadlines in wall time.
   */
  readonly timeMode?: TimeMode;
  /** `scaled` only: simulated seconds per wall second. `realtime` is 1 by definition. */
  readonly speed?: number;
  /** The wall clock, injectable so pacing can be tested without waiting on it. */
  readonly timer?: WallTimer;
  /**
   * Whether a traveller's journey is walked when its plan is answered (`open`,
   * the default) or on the clock as it happens (`closed`).
   *
   * **In closed loop a replan is asked when the traveller reaches the break**,
   * with τ there, so the player answers with the world as it stands rather than
   * as it stood half an hour earlier (`KNOWN-ISSUES.md` #66), and a replan's
   * deadline binds in wall time. Only the scored travellers are real so far: with
   * no background population and no vehicle capacity, a traveller's choice
   * changes its own journey and nobody else's. Closed-loop scores never compare
   * with open-loop ones (SCORING.md §12).
   */
  readonly loop?: "open" | "closed";
  /**
   * Closed loop only: the share of scored travellers who use the player
   * (REFERENCE-POLICY.md §3). The rest travel under the reference policy and are
   * never asked about. Defaults to 1.
   */
  readonly appUserFraction?: number;
  /**
   * An earlier run's log, whose recorded answers are given back in place of a
   * player (SCORING.md §12, Q19). A closed-loop run is not reproducible live and
   * is reproducible this way; an answer the log does not hold means the run
   * diverged, and throws.
   */
  readonly replay?: readonly RunRecord[];
  /**
   * Told every step each traveller takes, and every step `P1` and `P0a` take
   * for its query. For the viewer, which regenerates movements by replaying a
   * run rather than reading them from a log (`OBSERVABILITY.md` §10). Nothing
   * the harness decides reads what an observer does.
   */
  readonly observe?: RunObserver;
  /**
   * Told each record as it happens, for a run file that survives a crash
   * (OBSERVABILITY.md §7). An ingestion record comes with its response body, for
   * a `verbatim` writer; a writer at `trace` ignores it. Material events are
   * derived at the end and arrive only in the returned log.
   */
  readonly stream?: RunStream;
  /** Recorded in the header when not the default `attributed` (OBSERVABILITY.md §8). */
  readonly disclosure?: "full" | "attributed" | "outcome";
  /** Recorded in the header at `verbatim`; the writer is what enforces it. */
  readonly logLevel?: "trace" | "verbatim";
  /**
   * Drive the run from outside: pause, resume, change speed or mode, stop
   * (`control.ts`, P2M8). Every change lands between obligations and is written
   * to the log, and a run that carries one does not compare with another.
   */
  readonly control?: RunControl;
  /**
   * The run token (PLAYER-CONTRACT.md §3). Sent to the player on every request
   * and required by the control API. Absent, nothing is authenticated — which
   * the tests and instruments that drive a reference player in-process rely
   * on, and which `npm run demo` and `npm run sim` never do.
   */
  readonly token?: string;
  /** Wall seconds a request may run before it is abandoned. The contract's is 30; tests shorten it. */
  readonly guardWallS?: number;
  /**
   * Handed, once, a read-only view of the run's clock — for a dashboard that
   * shows τ between records. Reading it changes nothing.
   */
  readonly expose?: (clock: { tau(): number; mode(): TimeMode; speed(): number }) => void;
  /**
   * Told the player's identity once it is ready and speaks this contract — the
   * end of preparation's checks (PLAYER-CONTRACT.md §4).
   */
  readonly onReady?: (identity: { readonly capabilities: readonly string[]; readonly contractVersions: readonly string[] }) => void;
  /**
   * Held after preparation and before `run-start`, until it resolves: a
   * session's Start button (P2M8). If it rejects, the run never starts, and
   * `runOpenLoop` rejects with that reason once the APIs are down.
   */
  readonly awaitStart?: () => Promise<void>;
  /** Told whenever run state changes, for a dashboard. Never read back. */
  readonly onState?: (state: "preparation" | "running" | "paused" | "ended") => void;
}

export interface RunStream {
  record(record: RunRecord, body?: string): void;
}

export interface RunObserver {
  traveller(travellerRef: string, movement: Movement): void;
  reference(queryId: string, policy: "P1" | "P0a", movement: Movement): void;
}

type Obligation =
  | { kind: "plan"; queryId: string; travellerRef: string; requestId: string }
  | { kind: "tick"; requestId: string }
  // Closed loop only: a traveller has reached the point where its plan broke.
  | {
      kind: "replan";
      queryId: string;
      travellerRef: string;
      /** The plan's request id; the attempt is appended to it. */
      baseRequestId: string;
      attempt: number;
      brk: PlanBreak;
    };

export async function runOpenLoop(opts: HarnessOptions): Promise<RunRecord[]> {
  const { world } = opts;
  const anchor = parseEpoch(world.manifest.worldEpochIso);
  const log: RunRecord[] = [];
  const emit = (record: RunRecord, body?: string): void => opts.stream?.record(record, body);

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
      p0aExec: ReturnType<typeof executeReactively>;
      /** P1's steps, kept only when observed: a traveller who falls back takes exactly these. */
      p1Moves: readonly Movement[];
    }
  >();
  for (const q of world.queries) {
    const o = accessFor(q.id, "origin");
    const d = accessFor(q.id, "destination");
    const p0 = route(oracleIx, o, d, q.departAfterS, "all");
    // P1 is *executed*, not merely planned: it discovers each failure by
    // standing on a platform and replanning (REFERENCE-POLICY.md §4.3).
    const p1Moves: Movement[] = [];
    const p1 = executeReactively(
      world,
      scheduleIx,
      disruptions,
      o,
      d,
      q.departAfterS,
      "obvious",
      opts.observe ? (m) => p1Moves.push(m) : undefined,
    );
    for (const m of p1Moves) opts.observe?.reference(q.id, "P1", m);

    // P0a — the best a perfect integrator could have done knowing only what had
    // been announced when it planned (REFERENCE-POLICY.md §2.1). Computed
    // exactly as P1 is, and differing from it in the two ways that matter: it
    // plans on an index that carries the announced disruptions rather than the
    // bare schedule, and it may use any transfer rather than only the obvious
    // ones.
    //
    // This is what `capture` is normalised against. P0 is clairvoyant — it
    // routes around a cancellation announced after it planned — so a capture of
    // 1.0 against P0 is not merely hard but impossible, and every score the
    // project recorded before 2026-09-04 was scaled against a ceiling nobody
    // could reach (SCORING.md §2).
    const announced = disruptions.filter((x) => x.announcedAtS <= q.departAfterS - PLAN_LEAD_S);
    const p0aExec = executeReactively(
      world,
      buildIndex(world, announced),
      disruptions,
      o,
      d,
      q.departAfterS,
      "all",
      opts.observe ? (m) => opts.observe?.reference(q.id, "P0a", m) : undefined,
    );
    baselines.set(q.id, {
      p0: p0 ? p0.arriveS - q.departAfterS : null,
      p0Wait: p0 ? p0.waitS : null,
      p1: p1.journeyS,
      p1Exec: p1,
      p0aExec,
      p1Moves,
    });
  }

  // ---- the clock and the event queue -------------------------------------
  // Obligations are issued well before the traveller wants to leave, so the
  // run starts earlier than the earliest departure.
  const firstTau = Math.min(...world.queries.map((q) => q.departAfterS - PLAN_LEAD_S));
  const clock = makeVirtualClock(firstTau);
  // When τ may advance. In `virtual` this is the clock itself; in `realtime`
  // and `scaled` it is wall time, and nothing downstream can tell which
  // (`pacing.ts`, TIME-MODEL.md §2.3).
  const timeMode: TimeMode = opts.timeMode ?? "virtual";
  const pacer = makePacer(timeMode, clock, opts.speed, opts.timer ?? systemTimer);
  opts.expose?.({ tau: () => pacer.tau(), mode: () => pacer.mode, speed: () => pacer.speed });
  const queue = new EventQueue<Obligation>();

  const loop = opts.loop ?? "open";
  if (loop === "open" && opts.appUserFraction !== undefined) {
    throw new Error("appUserFraction applies only to a closed-loop run (REFERENCE-POLICY.md §3)");
  }
  const appUserFraction = opts.appUserFraction ?? 1;
  const appUsers =
    loop === "closed"
      ? selectAppUsers(
          world.queries.map((q) => q.id),
          appUserFraction,
          world.manifest.seed,
        )
      : null;
  const guardS = opts.guardWallS ?? GUARD_WALL_S;
  const rawPlayer = opts.replay ? replayPlayer(opts.replay) : httpPlayer(opts.playerBaseUrl, opts.token, guardS);

  let state: "preparation" | "running" | "paused" | "ended" = "preparation";
  // How the run ends, if it does not simply complete; the strongest reason wins.
  let runEnd: RunEnd | null = null;
  const setState = (next: typeof state): void => {
    state = next;
    opts.onState?.(next);
  };
  const control = opts.control;
  const ingestion: (Omit<OperatorCall, "body"> & { operator: string; cause: string | null })[] = [];
  // The obligation currently being handled, for temporal attribution.
  let attributeTo: string | null = null;
  const notifications: NotificationRecord[] = [];

  // One API per operator, on its own host and port. They know nothing about
  // each other.
  const operatorUrls = new Map<string, string>();
  const servers: Server[] = [];

  // A replay has no player to call them: its answers are already written down.
  for (const [i, op] of opts.replay ? [] : world.manifest.operators.entries()) {
    const port = opts.operatorPort + i;
    operatorUrls.set(op.id, `http://127.0.0.1:${port}`);
    servers.push(
      await startOperatorApi(
        world,
        op.id,
        disruptions,
        () => pacer.tau(),
        ({ body, ...call }: OperatorCall) => {
          const record = { ...call, operator: op.id, cause: attributeTo };
          ingestion.push(record);
          emit(
            {
              kind: "ingestion",
              tau: call.tau,
              operator: op.id,
              endpoint: call.endpoint,
              status: call.status,
              bytes: call.bytes,
              bodyHash: call.bodyHash,
              cause: record.cause,
            },
            body,
          );
        },
        port,
        control ? () => control.admit() : undefined,
      ),
    );
  }

  if (!opts.replay) servers.push(
    await startControlApi(
      world,
      () => pacer.tau(),
      () => state,
      operatorUrls,
      (n) => {
        notifications.push(n);
        emit({ kind: "notification", tau: n.tau, travellerRef: n.travellerRef, notificationKind: n.kind, message: n.message });
      },
      opts.controlPort,
      () => ({ mode: pacer.mode, speed: pacer.speed }),
      { mode: loop, appUserFraction },
      {
        ...(opts.token ? { token: opts.token } : {}),
        pauseQueueDepth: control?.pauseQueueDepth ?? PAUSE_QUEUE_DEPTH,
      },
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
      timeMode,
      // Recorded only where it means something, so a `virtual` log is
      // byte-identical to one written before the other modes existed.
      ...(timeMode === "virtual" ? {} : { speed: pacer.speed }),
      // The same rule for the loop: absent means open, so an open-loop log is
      // what it was before closed loop existed.
      ...(loop === "closed" ? { loop: "closed" as const, appUserFraction } : {}),
      ...(opts.disclosure && opts.disclosure !== "attributed" ? { disclosure: opts.disclosure } : {}),
      ...(opts.logLevel === "verbatim" ? { logLevel: "verbatim" as const } : {}),
      latencyMode: "none",
      referenceCompetence: "timetable",
      hardwareProfile: null,
    });
    emit(log[0]!);

    // ---- lifecycle -------------------------------------------------------
    // Preparation: the clock stands still while the player gets ready, within
    // the brief's budget (PLAYER-CONTRACT.md §4).
    const identity = await rawPlayer.ready(PREPARATION_WALL_BUDGET_S * 1000);
    // **Versions are agreed before the run, never during it** (§3).
    if (!opts.replay && !identity.contractVersions.includes(CONTRACT_VERSION)) {
      throw new ContractMismatch(
        `the player speaks contract ${identity.contractVersions.join(", ") || "(none declared)"} and this ` +
          `simulator speaks ${CONTRACT_VERSION}: the run will not start (PLAYER-CONTRACT.md §3)`,
      );
    }
    opts.onReady?.({ capabilities: identity.capabilities, contractVersions: identity.contractVersions });
    // Still preparation: the clock stands where the day begins until told to go.
    await opts.awaitStart?.();
    const player = enforcing(rawPlayer, identity, pacer, (e) => {
      if (!runEnd || runEndPrecedence(e.reason) > runEndPrecedence(runEnd.reason)) runEnd = e;
    });
    await player.notify("/v1/run-start", {
      run_id: RUN_ID,
      brief_digest: briefDigest(
        buildBrief(world, operatorUrls, { mode: pacer.mode, speed: pacer.speed }, { mode: loop, appUserFraction }, {
          pauseQueueDepth: control?.pauseQueueDepth ?? PAUSE_QUEUE_DEPTH,
        }),
      ),
    });
    setState("running");
    const wallStartMs = performance.now();
    let pausedWallMs = 0;
    let pausedSinceMs: number | null = null;
    // Wall time starts counting here, not at preparation (PLAYER-CONTRACT.md §4).
    pacer.start();

    // Ingestion cadence is simulator-driven. In `virtual` mode the clock
    // outruns any player-side polling loop, so a player that slept between
    // fetches would poll once for the whole day (TIME-MODEL.md §6).
    //
    // **Ticks are scheduled one at a time** (P2M8), each after the one before
    // is answered, so a tick's `next_interval_sim_s` can move the next one
    // (PLAYER-CONTRACT.md §5.6). With a constant interval that is the same set
    // of ticks the whole day was queued as until then.
    const tickEnd = Math.max(...world.queries.map((q) => q.departAfterS)) + 3600;
    let tickInterval = identity.capabilities.includes("tick")
      ? Math.max(MIN_TICK_INTERVAL_S, identity.tickIntervalS ?? 60)
      : 0;
    let tickCount = 0;
    const scheduleTick = (at: number): void => {
      if (tickInterval <= 0 || at > tickEnd) return;
      queue.push(at, { kind: "tick", requestId: `tick-${String(tickCount++).padStart(4, "0")}` }, RANK_TICK);
    };
    scheduleTick(firstTau);

    // **A tick at an obligation's instant is delivered first** (§5.6, §9.3), and
    // the queue's rank is what keeps that: ticks rank before plans and replans
    // however they were queued. Until P2M2 plans were queued before ticks and
    // answered before them at 47 of the committed world's 98 shared instants
    // (`KNOWN-ISSUES.md` #67); until P2M8 the fix was the order of the loops.
    for (const q of world.queries) {
      // Outside the app-user fraction nobody asks the player anything.
      if (appUsers && !appUsers.has(q.id)) continue;
      queue.push(
        q.departAfterS - PLAN_LEAD_S,
        { kind: "plan", queryId: q.id, travellerRef: `trv-${q.id}`, requestId: `req-${q.id}` },
        RANK_OBLIGATION,
      );
    }

    // ---- the run ---------------------------------------------------------
    // The resolution table, merged across operators. Private: it is how the
    // simulator reads a player's operator-scoped references back into
    // canonical entities, and it is never served (DATA-MODEL.md §4).
    const resolution = mergeResolutions(world, pacer.tau());
    const outcomes: RunRecord[] = [];
    const queryById = new Map(world.queries.map((q) => [q.id, q]));
    const settleOutcome = (record: RunRecord): void => {
      outcomes.push(record);
      emit(record);
    };

    // One traveller's observer, or none — so an unobserved run allocates nothing.
    const observerFor = (travellerRef: string): MovementObserver | undefined =>
      opts.observe ? (m) => opts.observe?.traveller(travellerRef, m) : undefined;
    // A traveller who falls back to P1 takes P1's steps, which were walked once already.
    const replayReference = (queryId: string, travellerRef: string): void => {
      const observe = observerFor(travellerRef);
      if (observe) for (const m of baselines.get(queryId)!.p1Moves) observe(m);
    };

    const contextFor = (queryId: string, travellerRef: string): ReplanContext => ({
      guardS,
      world,
      resolution,
      table,
      scheduleIx,
      disruptions,
      destinations: accessFor(queryId, "destination"),
      anchor,
      player,
      clock,
      pacer,
      log,
      observe: observerFor(travellerRef),
      emit,
    });

    const travellerRecord = (
      query: World["queries"][number],
      travellerRef: string,
      simulated: Simulated,
      forgone: boolean,
      /** Closed loop only; left out of an open-loop record so its hash stands. */
      appUser?: boolean,
    ): RunRecord => {
      const base = baselines.get(query.id)!;
      return {
        kind: "traveller",
        travellerRef,
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
        // **An optimum must dominate every achievable strategy, and P1 is one.**
        // P1 plans on the bare schedule with no disruption knowledge at all,
        // which is strictly less than "everything announced by now", so where
        // P1 does better, P1's outcome *is* the announcement-limited optimum.
        // The same rule `baselines.ts` applies for the same reason: without it
        // a reference that fails to arrive reports no ceiling at all, and
        // capture silently falls back to the clairvoyant scale.
        //
        // In closed loop these are the unchanged day's references — the world
        // with nobody's choices in it (SCORING.md §12). Until riders reach each
        // other through capacity that is also the day that happened.
        announcedJourneyS: betterOf(base.p0aExec, base.p1Exec).journeyS,
        announcedWaitS: betterOf(base.p0aExec, base.p1Exec).waitS,
        ...(appUser === undefined ? {} : { appUser }),
      };
    };

    // Closed loop: a traveller whose plan broke goes back on the queue, to be
    // asked about when it reaches the break. Queued behind anything already at
    // that instant, a tick included (§5.6).
    const advance = (
      query: World["queries"][number],
      travellerRef: string,
      baseRequestId: string,
      step: StepOutcome,
      attempt: number,
    ): void => {
      if (step.kind === "settled") {
        settleOutcome(travellerRecord(query, travellerRef, settled(step), false, true));
      } else if (attempt > MAX_REPLANS) {
        // The budget P1 gets, as in open loop.
        observerFor(travellerRef)?.({ kind: "give_up", atS: step.progress.cursorS, reason: "abandoned_after_replans" });
        settleOutcome(
          travellerRecord(query, travellerRef, gaveUp(step, "abandoned_after_replans"), false, true),
        );
      } else {
        queue.push(
          step.progress.cursorS,
          { kind: "replan", queryId: query.id, travellerRef, baseRequestId, attempt, brk: step },
          RANK_OBLIGATION,
        );
      }
    };

    // Outside the app-user fraction a traveller does what anyone in a city with
    // no integration layer does, and nothing the player does can reach them.
    // Recorded, so the log holds the whole population, and never scored.
    if (appUsers) {
      for (const q of world.queries) {
        if (appUsers.has(q.id)) continue;
        replayReference(q.id, `trv-${q.id}`);
        const p1 = baselines.get(q.id)!.p1Exec;
        const simulated: Simulated = {
          arrived: p1.arrived,
          journeyS: p1.journeyS,
          waitS: p1.waitS,
          transfers: p1.transfers,
          failureReason: p1.failureReason,
        };
        settleOutcome(travellerRecord(q, `trv-${q.id}`, simulated, false, false));
      }
    }

    // A change asked for from outside lands here, between obligations, and is
    // written down where it landed (`control.ts`).
    const applyControl = (r: ControlRequest): void => {
      if (r.action === "pause") {
        pacer.hold();
        pausedSinceMs = performance.now();
        setState("paused");
      } else if (r.action === "resume") {
        pacer.release();
        if (pausedSinceMs !== null) pausedWallMs += performance.now() - pausedSinceMs;
        pausedSinceMs = null;
        setState("running");
      } else if (r.action === "retime") {
        pacer.retime(r.timeMode, r.speed);
      }
      const record: RunRecord = {
        kind: "control",
        tau: pacer.tau(),
        action: r.action,
        ...(r.action === "retime" ? { timeMode: pacer.mode, speed: pacer.speed } : {}),
      };
      log.push(record);
      emit(record);
    };
    const atBoundary = async (): Promise<boolean> => {
      if (!control) return true;
      if ((await control.boundary(applyControl)) === "continue") return true;
      runEnd = { reason: "aborted", detail: "stopped from outside the run" };
      return false;
    };
    // TIME-MODEL.md §9: a `virtual` run's wall time is a property of the machine,
    // so running out of it ends the run as `invalid`, never as a bad score. Wall
    // time spent manually paused is not counted.
    const overWallBudget = (): boolean => {
      if (pacer.mode !== "virtual") return false;
      const usedS = (performance.now() - wallStartMs - pausedWallMs) / 1000;
      if (usedS <= RUN_WALL_BUDGET_S) return false;
      runEnd = { reason: "invalid", detail: `the run's wall budget of ${RUN_WALL_BUDGET_S} s ran out` };
      return true;
    };

    for (;;) {
      if (!(await atBoundary())) break;
      if (overWallBudget()) break;
      const next = queue.pop();
      if (!next) break;

      // `virtual` moves the clock to the event. `realtime` and `scaled` wait on
      // the wall until τ reaches it — or, if a slow handler has already carried
      // τ past, issue it at once. Either way it is issued *as of* its scheduled
      // instant, so its deadline is where it always was; the lag is recorded as
      // a wall diagnostic and kept out of the golden hash. A pause or a change
      // of speed asked for while waiting interrupts the wait, lands, and the
      // wait begins again.
      let lagS: number | null = null;
      while (lagS === null) {
        lagS = await pacer.waitFor(next.tau, control ? () => control.pending : undefined);
        if (lagS === null && !(await atBoundary())) break;
      }
      if (lagS === null) break;
      // A recording that stopped early — from outside, or out of wall budget —
      // holds no answer past the stop, so a replay stops where it did.
      const recordedStop = opts.replay?.find((r) => r.kind === "run_end" && r.reason !== "player_failure");
      if (recordedStop && recordedStop.kind === "run_end" && !rawPlayer.has?.(requestIdOf(next.payload))) {
        runEnd = { reason: recordedStop.reason, detail: recordedStop.detail };
        break;
      }
      const issuedAt = next.tau;
      // Absent in `virtual`, so a `virtual` log is what it always was — unless a
      // switch from a wall-driven mode left this event late.
      const lag = pacer.mode === "virtual" && lagS === 0 ? {} : { lagS };
      // Bind once so the discriminant narrows across the early return below.
      const ob = next.payload;

      // Ticks come first at an equal instant, so the player is asked questions
      // with the freshest data it could have had (PLAYER-CONTRACT.md §5.6).
      if (ob.kind === "tick") {
        if (pacer.pausesForHandlers) clock.pause();
        // Everything the player fetches from here until resume happens at this
        // τ, and the clock is frozen — so those calls are *provably* part of
        // this handler, whether or not the player propagates trace context
        // (OBSERVABILITY.md §3.1).
        attributeTo = ob.requestId;
        const t0 = Date.now();
        const tick = await player.tick(ob.requestId, {
          contract_version: CONTRACT_VERSION,
          run_id: RUN_ID,
          sim_time: renderSimTime(anchor, issuedAt),
          guard_wall_s: guardS,
        });
        const ok = tick.ok;
        if (pacer.pausesForHandlers) clock.resume();
        attributeTo = null;
        // The player may move its own cadence, never below the brief's floor.
        if (tick.nextIntervalS !== null) tickInterval = Math.max(MIN_TICK_INTERVAL_S, tick.nextIntervalS);
        scheduleTick(issuedAt + tickInterval);
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
          ...lag,
          // Only when the player asked, so a constant-cadence log is unchanged.
          ...(tick.nextIntervalS !== null ? { nextIntervalS: tick.nextIntervalS } : {}),
          ...(tick.unsent ? { unsent: true as const } : {}),
        });
        emit(log.at(-1)!);
        continue;
      }

      if (ob.kind === "replan") {
        // Closed loop: the traveller is standing where the plan broke, and τ is
        // there too — so the player reads the world as it is now (#66).
        const query = queryById.get(ob.queryId)!;
        const ctx = contextFor(query.id, ob.travellerRef);
        const answer = await askReplan(ctx, ob.travellerRef, ob.baseRequestId, ob.attempt, ob.brk, lag);
        const after = afterReplan(ctx, query, ob.brk, answer);
        if (after.kind === "done") {
          settleOutcome(travellerRecord(query, ob.travellerRef, after.simulated, false, true));
        } else {
          advance(query, ob.travellerRef, ob.baseRequestId, after.step, ob.attempt + 1);
        }
        continue;
      }

      const deadline = issuedAt + PLAN_DEADLINE_S;
      const query = queryById.get(ob.queryId)!;

      // The clock stops while the player thinks. Safe only because operator
      // responses are pure functions of τ (TIME-MODEL.md §3). The wall-driven
      // modes keep it running: that is what makes them alive.
      if (pacer.pausesForHandlers) clock.pause();

      const startedMs = Date.now();
      const answer = await player.ask(
        ob.requestId,
        {
          contract_version: CONTRACT_VERSION,
          run_id: RUN_ID,
          issued_at: renderSimTime(anchor, issuedAt),
          deadline: renderSimTime(anchor, deadline),
          guard_wall_s: guardS,
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
        },
        "plan",
        pacer.timeoutMs(deadline, guardS * 1000),
      );
      const latencyMs = Date.now() - startedMs;

      if (pacer.pausesForHandlers) clock.resume();

      const base = baselines.get(query.id)!;
      const planRecord: RunRecord = {
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
        ...lag,
        ...(answer.unsent ? { unsent: true as const } : {}),
      };

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

      if (loop === "open") {
        // The whole journey is walked now, replans included, ahead of the clock.
        if (forgone) replayReference(query.id, ob.travellerRef);
        const simulated = forgone
          ? fallbackToReference(base.p1Exec)
          : await drivePlan(
              contextFor(query.id, ob.travellerRef),
              query,
              ob.travellerRef,
              ob.requestId,
              answer.itinerary.legs,
            );
        log.push(planRecord);
        emit(planRecord);
        settleOutcome(travellerRecord(query, ob.travellerRef, simulated, forgone));
        continue;
      }

      log.push(planRecord);
      emit(planRecord);
      if (forgone) {
        replayReference(query.id, ob.travellerRef);
        settleOutcome(travellerRecord(query, ob.travellerRef, fallbackToReference(base.p1Exec), true, true));
      } else {
        // Walked only as far as its first break; the rest happens on the clock.
        const step = simulateFrom(
          world,
          resolution,
          table,
          answer.itinerary.legs,
          query,
          setOut(query),
          observerFor(ob.travellerRef),
        );
        advance(query, ob.travellerRef, ob.requestId, step, 1);
      }
    }

    // Closed loop settles travellers in the order their journeys end; the log
    // reads in the order the query set does, as an open-loop log always has.
    if (appUsers) {
      const order = new Map(world.queries.map((q, i) => [q.id, i]));
      const queryOf = (r: RunRecord): number =>
        r.kind === "traveller" ? (order.get(r.queryId) ?? 0) : 0;
      outcomes.sort((a, b) => queryOf(a) - queryOf(b));
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

    const ended = runEnd as RunEnd | null;
    if (ended) {
      const record: RunRecord = { kind: "run_end", tau: pacer.tau(), reason: ended.reason, detail: ended.detail };
      log.push(record);
      emit(record);
    }

    setState("ended");
    await rawPlayer.notify("/v1/run-end", { run_id: RUN_ID, reason: ended?.reason ?? "completed" });

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

/**
 * Wait, up to the preparation budget, for a player to report `ready`.
 *
 * **Not part of the simulation.** A player is usually a separate process that
 * must start a runtime and read the brief before it can answer, none of which
 * the world cares about. The wait was five seconds once, and a cold CI runner
 * failed on it; then sixty; since P2M8 it is the brief's own
 * `preparation.wall_budget_s`, because a player preparing is exactly what
 * that budget bounds (PLAYER-CONTRACT.md §4). Waiting costs nothing when the
 * player is quick: the loop exits on the first healthy response.
 */

async function waitForHealth(baseUrl: string, headers: Record<string, string>, budgetMs: number): Promise<void> {
  const startedMs = Date.now();
  let lastError = "no response";
  while (Date.now() - startedMs < budgetMs) {
    try {
      const res = await fetch(`${baseUrl}/v1/health`, { headers });
      if (res.ok) {
        const body = (await res.json()) as { status?: string };
        if (body.status === "ready") return;
        lastError = `health says ${JSON.stringify(body.status)}`;
      } else {
        lastError = `health returned ${res.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `player at ${baseUrl} never became ready after ` +
      `${(budgetMs / 1000).toFixed(0)}s. Last: ${lastError}. ` +
      `If the player process exited, its stderr is where to look — a player ` +
      `started before the control API must retry until the API answers.`,
  );
}

interface PlayerIdentity {
  readonly capabilities: readonly string[];
  readonly tickIntervalS: number | null;
  readonly contractVersions: readonly string[];
}

async function readIdentity(baseUrl: string, headers: Record<string, string>): Promise<PlayerIdentity> {
  try {
    const res = await fetch(`${baseUrl}/v1/identity`, { headers });
    const body = (await res.json()) as {
      capabilities?: string[];
      tick?: { interval_sim_s?: number };
      contract_versions?: string[];
    };
    return {
      capabilities: body.capabilities ?? [],
      tickIntervalS: body.tick?.interval_sim_s ?? null,
      contractVersions: body.contract_versions ?? [],
    };
  } catch {
    return { capabilities: [], tickIntervalS: null, contractVersions: [] };
  }
}

/** The run will not start: the player and the simulator do not share a contract version. */
export class ContractMismatch extends Error {}

/** Every request the simulator sends a player carries these (PLAYER-CONTRACT.md §3). */
function playerHeaders(token: string | undefined): Record<string, string> {
  return {
    "X-TNS-Contract": CONTRACT_VERSION,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

type RunEnd = { readonly reason: "aborted" | "player_failure" | "invalid"; readonly detail: string };

/** When two things would end a run, which is recorded: a stop over an invalid run over a failed player. */
function runEndPrecedence(reason: RunEnd["reason"]): number {
  return reason === "aborted" ? 3 : reason === "invalid" ? 2 : 1;
}

/**
 * The player as the rules see it (P2M8): what it did not claim is not asked
 * (PLAYER-CONTRACT.md §5.2); after `ABORT_AFTER_CONSECUTIVE_FAILURES`
 * unanswered obligations in a row the run carries on without it (§8); and a
 * wall guard breached in `virtual` makes the run `invalid`, because the machine
 * decided that answer (TIME-MODEL.md §9).
 *
 * Wrapped round a live player and a replay alike, so a replayed run makes the
 * same decisions from its recorded answers.
 */
function enforcing(
  inner: PlayerPort,
  identity: PlayerIdentity,
  pacer: Pacer,
  end: (e: RunEnd) => void,
): PlayerPort {
  let streak = 0;
  let gaveUp = false;
  const counted = (outcome: ObligationOutcome, requestId: string): void => {
    if (outcome === "player_timeout" && pacer.mode === "virtual") {
      end({ reason: "invalid", detail: `the wall guard was breached answering ${requestId}` });
    }
    if (outcome === "player_error" || outcome === "player_timeout") {
      streak++;
      if (streak >= ABORT_AFTER_CONSECUTIVE_FAILURES && !gaveUp) {
        gaveUp = true;
        end({
          reason: "player_failure",
          detail: `${ABORT_AFTER_CONSECUTIVE_FAILURES} obligations in a row went unanswered, ending at ${requestId}`,
        });
      }
    } else {
      streak = 0;
    }
  };
  return {
    ready: (budgetMs) => inner.ready(budgetMs),
    notify: (path, body) => inner.notify(path, body),
    async tick(requestId, body) {
      if (gaveUp) return { ok: false, nextIntervalS: null, timedOut: false, unsent: true };
      const answer = await inner.tick(requestId, body);
      counted(answer.ok ? "ok" : answer.timedOut ? "player_timeout" : "player_error", requestId);
      return answer;
    },
    async ask(requestId, request, endpoint, timeoutMs) {
      if (!identity.capabilities.includes(endpoint)) {
        return { outcome: "unclaimed", itinerary: null, unsent: true };
      }
      if (gaveUp) return { outcome: "player_error", itinerary: null, unsent: true };
      const answer = await inner.ask(requestId, request, endpoint, timeoutMs);
      counted(answer.outcome, requestId);
      return answer;
    },
  };
}

/**
 * W3C Trace Context for one obligation (`OBSERVABILITY.md` §3.2, contract v0.3).
 *
 * Derived from the run and the request id rather than drawn, so the header an
 * obligation carries is the same on every run and every machine — a trace id
 * that changed between replays would make two identical runs look unrelated.
 * The trace id names the run; the span id names the obligation.
 */
export function traceparentFor(runId: string, requestId: string): string {
  const hex = (s: string, n: number) => createHash("sha256").update(s).digest("hex").slice(0, n);
  return `00-${hex(`trace:${runId}`, 32)}-${hex(`span:${runId}:${requestId}`, 16)}-01`;
}

/** The request id an event will be issued under. */
function requestIdOf(ob: Obligation): string {
  return ob.kind === "replan" ? `${ob.baseRequestId}-r${ob.attempt}` : ob.requestId;
}

/** A tick's acknowledgement, and the cadence the player asked for next, if it asked. */
export interface TickAnswer {
  readonly ok: boolean;
  readonly nextIntervalS: number | null;
  /** The guard ran out, rather than the player answering badly. */
  readonly timedOut?: boolean;
  /** Not sent: the run had given up on the player. */
  readonly unsent?: boolean;
}

async function sendTick(
  baseUrl: string,
  headers: Record<string, string>,
  guardMs: number,
  requestId: string,
  body: unknown,
): Promise<TickAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), guardMs);
  try {
    const res = await fetch(`${baseUrl}/v1/tick`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", traceparent: traceparentFor(RUN_ID, requestId) },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, nextIntervalS: null };
    // Any 2xx acknowledges; a body that asks for another cadence is honoured if
    // it says so plainly, and ignored if it does not (PLAYER-CONTRACT.md §5.6).
    let next: number | null = null;
    try {
      const body = (await res.json()) as { next_interval_sim_s?: unknown };
      if (Number.isInteger(body.next_interval_sim_s) && (body.next_interval_sim_s as number) > 0) {
        next = body.next_interval_sim_s as number;
      }
    } catch {
      // An empty or non-JSON acknowledgement is still an acknowledgement.
    }
    return { ok: true, nextIntervalS: next };
  } catch (err) {
    return { ok: false, nextIntervalS: null, timedOut: err instanceof Error && err.name === "AbortError" };
  } finally {
    clearTimeout(timer);
  }
}

async function post(baseUrl: string, headers: Record<string, string>, path: string, body: unknown): Promise<void> {
  try {
    await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
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
  /** Recorded without asking: an unclaimed capability, or a player the run gave up on. */
  readonly unsent?: boolean;
}

async function askPlayer(
  baseUrl: string,
  headers: Record<string, string>,
  requestId: string,
  request: unknown,
  endpoint: "plan" | "replan" = "plan",
  /** The guard in `virtual`; in the wall-driven modes, no longer than the deadline allows. */
  timeoutMs: number = GUARD_WALL_S * 1000,
): Promise<PlayerAnswer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/v1/${endpoint}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", traceparent: traceparentFor(RUN_ID, requestId) },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!res.ok) return { outcome: "player_error", itinerary: null };

    // **An answer is held to the published schema** (`contract/player-api.yaml`,
    // P2M7). Until then anything with a `results` array was read field by field,
    // so the contract described a shape nothing enforced. A response that does
    // not parse is a transport-level failure, and the traveller falls back.
    const parsed = (endpoint === "plan" ? PlanResponse : ReplanResponse).safeParse(await res.json());
    if (!parsed.success) return { outcome: "player_error", itinerary: null };
    const first = parsed.data.results[0] as { status: string; itinerary: Itinerary | null } | undefined;
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
/**
 * The better of two executions, preferring one that arrived.
 *
 * A non-arrival is worse than any arrival, and between two arrivals the shorter
 * journey wins.
 */
function betterOf(
  a: ReturnType<typeof executeReactively>,
  b: ReturnType<typeof executeReactively>,
): ReturnType<typeof executeReactively> {
  if (a.journeyS === null) return b;
  if (b.journeyS === null) return a;
  return a.journeyS <= b.journeyS ? a : b;
}

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
  /** Told each step as it is walked; never read back (`@tns/schema` movement.ts). */
  observe?: MovementObserver,
): StepOutcome {
  let cursor = start.cursorS;
  let waitS = start.waitS;
  let taken = start.transitLegsTaken;
  // What the traveller had waited and ridden by the time it failed, not by the
  // time this walk began: a plan that strands someone after two rides and a
  // quarter of an hour on a platform cost them both (`KNOWN-ISSUES.md` #70).
  const fail = (reason: string): StepOutcome => {
    observe?.({ kind: "give_up", atS: cursor, reason });
    return {
      kind: "settled",
      arrived: false,
      journeyS: null,
      waitS,
      transfers: Math.max(0, taken - 1),
      failureReason: reason,
    };
  };

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

  let atQuay: string | null = start.atQuay;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!;
    if (leg.mode === "walk") continue; // charged by connectivity below

    // Everything from this leg onward, for the replan payload.
    const remaining = legs.slice(i);
    const at = (trigger: ReplanTrigger, journeyId: string): PlanBreak => {
      observe?.({ kind: "break", atS: cursor, quay: atQuay, journeyId, reason: trigger });
      return {
        kind: "break",
        trigger,
        position: { kind: "at_stop", operator: leg.operator, stop: leg.from_stop },
        progress: { cursorS: cursor, atQuay, waitS, transitLegsTaken: taken },
        remaining,
        journeyId,
      };
    };

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
      observe?.({ kind: "walk", fromS: cursor, toS: cursor + access, fromQuay: null, toQuay: fromQuay });
      cursor += access;
    } else {
      const walk = walkBetween(atQuay, fromQuay);
      // Mid-journey this is not a malformed plan — the traveller is standing
      // somewhere real and cannot get to the next boarding point. They are
      // stranded, which is something they can perceive and report.
      if (walk === null) return at("stranded", journey.id);
      if (walk > 0) observe?.({ kind: "walk", fromS: cursor, toS: cursor + walk, fromQuay: atQuay, toQuay: fromQuay });
      cursor += walk;
    }
    atQuay = fromQuay;

    // What the world actually does, not what the timetable said.
    if (table.isCancelled(journey.id)) {
      // They find out by standing on the platform and watching it not arrive.
      // The wait is real and is charged (REFERENCE-POLICY.md §4.3).
      const scheduled = journey.startS + pattern.stops[boardIdx]!.departOffsetS;
      waitS += Math.max(0, scheduled - cursor);
      if (scheduled > cursor) observe?.({ kind: "wait", fromS: cursor, toS: scheduled, quay: fromQuay });
      cursor = Math.max(cursor, scheduled);
      return at("vehicle_cancelled", journey.id);
    }
    const delayS = table.actualDelayS(journey.id);

    const departS = journey.startS + delayS + pattern.stops[boardIdx]!.departOffsetS;
    const arriveS = journey.startS + delayS + pattern.stops[alightIdx]!.arriveOffsetS;
    if (departS < cursor) return at("missed_connection", journey.id);

    waitS += departS - cursor;
    if (departS > cursor) observe?.({ kind: "wait", fromS: cursor, toS: departS, quay: fromQuay });
    observe?.({ kind: "ride", fromS: departS, toS: arriveS, journeyId: journey.id, fromQuay, toQuay, delayS });
    cursor = arriveS;
    atQuay = toQuay;
    taken++;
  }

  const finalWalk = accessSeconds("destination", atQuay!);
  if (finalWalk === null) return fail(`destination_unreachable:${atQuay}`);
  observe?.({ kind: "walk", fromS: cursor, toS: cursor + finalWalk, fromQuay: atQuay, toQuay: null });
  cursor += finalWalk;
  observe?.({ kind: "arrive", atS: cursor });

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
  const deterministic = log.map((record) => {
    if (record.kind === "ingestion" && record.body !== undefined) {
      // A `verbatim` file's bodies are regenerable and would make a verbatim
      // log hash differently from the trace log of the same run.
      const withoutBody: Record<string, unknown> = { ...record };
      delete withoutBody["body"];
      return withoutBody;
    }
    if (record.kind !== "obligation") return record;
    // `lagS` is wall-derived too, and absent from `virtual` records, so
    // dropping it leaves every `virtual` hash exactly what it was.
    const deterministicRecord: Record<string, unknown> = { ...record, latencyMs: null };
    delete deterministicRecord["lagS"];
    return deterministicRecord;
  });
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
  observe?: MovementObserver,
): Simulated {
  const spentS = brk.progress.cursorS - query.departAfterS;
  const priorWaitS = brk.progress.waitS;
  const priorLegs = brk.progress.transitLegsTaken;

  if (brk.progress.atQuay === null) {
    observe?.({ kind: "give_up", atS: brk.progress.cursorS, reason });
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
    observe,
  );

  return {
    arrived: exec.arrived,
    journeyS: exec.journeyS === null ? null : spentS + exec.journeyS,
    waitS: priorWaitS + exec.waitS,
    // Rides before the break and rides after it: counted as rides, because
    // transfers do not add across a replan (`KNOWN-ISSUES.md` #70).
    transfers: Math.max(0, priorLegs + exec.legsRidden - 1),
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
  readonly player: PlayerPort;
  readonly clock: ReturnType<typeof makeVirtualClock>;
  readonly pacer: Pacer;
  readonly log: RunRecord[];
  readonly observe: MovementObserver | undefined;
  readonly emit: (record: RunRecord) => void;
  readonly guardS: number;
}

/** Where a traveller stands before setting out: at the origin, at its departure time. */
function setOut(query: { departAfterS: number }): Progress {
  return { cursorS: query.departAfterS, atQuay: null, waitS: 0, transitLegsTaken: 0 };
}

function settled(s: Extract<StepOutcome, { kind: "settled" }>): Simulated {
  return {
    arrived: s.arrived,
    journeyS: s.journeyS,
    waitS: s.waitS,
    transfers: s.transfers,
    failureReason: s.failureReason,
  };
}

function gaveUp(brk: PlanBreak, reason: string): Simulated {
  return {
    arrived: false,
    journeyS: null,
    waitS: brk.progress.waitS,
    transfers: Math.max(0, brk.progress.transitLegsTaken - 1),
    failureReason: reason,
  };
}

/**
 * Ask the player about a broken plan, and record the asking.
 *
 * Open loop asks while walking the whole journey at plan time; closed loop asks
 * when the traveller reaches the break. The request, the deadline and the record
 * are the same either way — only the τ the player reads the world at differs.
 */
async function askReplan(
  ctx: ReplanContext,
  travellerRef: string,
  baseRequestId: string,
  attempt: number,
  brk: PlanBreak,
  lag: { lagS?: number } = {},
): Promise<PlayerAnswer> {
  const issuedAt = brk.progress.cursorS;
  const deadline = issuedAt + PLAN_DEADLINE_S;
  const requestId = `${baseRequestId}-r${attempt}`;

  if (ctx.pacer.pausesForHandlers) ctx.clock.pause();
  const startedMs = Date.now();
  const answer = await ctx.player.ask(
    requestId,
    {
      contract_version: CONTRACT_VERSION,
      run_id: RUN_ID,
      issued_at: renderSimTime(ctx.anchor, issuedAt),
      deadline: renderSimTime(ctx.anchor, deadline),
      guard_wall_s: ctx.guardS,
      requests: [
        {
          request_id: requestId,
          traveller_ref: travellerRef,
          // What the traveller perceives, never why. Naming the cause would
          // hand over the answer to catalogue §2.1 D.
          trigger: brk.trigger,
          position: brk.position,
          remaining_itinerary: { legs: brk.remaining },
        },
      ],
    },
    "replan",
    ctx.pacer.timeoutMs(deadline, ctx.guardS * 1000),
  );
  const latencyMs = Date.now() - startedMs;
  if (ctx.pacer.pausesForHandlers) ctx.clock.resume();

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
    trigger: brk.trigger,
    attempt,
    ...lag,
    ...(answer.unsent ? { unsent: true as const } : {}),
  });
  ctx.emit(ctx.log.at(-1)!);
  return answer;
}

/**
 * What a replan's answer does to the traveller: a new plan to walk, or an end.
 */
function afterReplan(
  ctx: ReplanContext,
  query: { id: string; departAfterS: number },
  brk: PlanBreak,
  answer: PlayerAnswer,
): { kind: "step"; step: StepOutcome } | { kind: "done"; simulated: Simulated } {
  if (answer.outcome === "ok" && answer.itinerary) {
    return {
      kind: "step",
      step: simulateFrom(
        ctx.world,
        ctx.resolution,
        ctx.table,
        answer.itinerary.legs,
        query,
        brk.progress,
        ctx.observe,
      ),
    };
  }

  // The player advised giving up, and is charged for it exactly as it would
  // be charged for failing to route them. Advising abandonment to a traveller
  // who could still have arrived is a real cost, which is what stops
  // `abandon` becoming a cheap way out of a hard reroute.
  if (answer.outcome === "abandon") {
    ctx.observe?.({ kind: "give_up", atS: brk.progress.cursorS, reason: "advised_abandon" });
    return { kind: "done", simulated: gaveUp(brk, "advised_abandon") };
  }

  // `continue`, `no_route`, `declined`, an error or a timeout all leave the
  // traveller standing where they are with no usable advice. `continue`
  // reaches here because the leg it wants to continue onto is the one that
  // just broke.
  return {
    kind: "done",
    simulated: resumeUnderReference(
      ctx.world,
      ctx.scheduleIx,
      ctx.disruptions,
      ctx.destinations,
      brk,
      query,
      `replan_${answer.outcome}`,
      ctx.observe,
    ),
  };
}

/**
 * Walk a player's plan through the day, asking it again whenever the plan
 * breaks in front of the traveller. Open loop only: closed loop walks the same
 * steps on the clock.
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
  let step = simulateFrom(ctx.world, ctx.resolution, ctx.table, initialLegs, query, setOut(query), ctx.observe);

  for (let attempt = 1; step.kind === "break"; attempt++) {
    // The same budget the reference policy gets. A player allowed more
    // attempts than P1 would be compared against a traveller held to a
    // stricter rule than itself.
    if (attempt > MAX_REPLANS) {
      ctx.observe?.({ kind: "give_up", atS: step.progress.cursorS, reason: "abandoned_after_replans" });
      return gaveUp(step, "abandoned_after_replans");
    }

    // In open loop a traveller's journey is walked when its plan is answered,
    // so a replan is asked then, ahead of the clock: its deadline lies in the
    // simulated future and never binds in wall time (KNOWN-ISSUES.md #66).
    const answer = await askReplan(ctx, travellerRef, baseRequestId, attempt, step);
    const after = afterReplan(ctx, query, step, answer);
    if (after.kind === "done") return after.simulated;
    step = after.step;
  }

  return settled(step);
}

// ---------------------------------------------------------------------------

/**
 * Who uses the player's app, in closed loop (REFERENCE-POLICY.md §3).
 *
 * A seeded shuffle of the sorted query ids, cut at the fraction. **One shuffle
 * for every fraction**, so the app users at a quarter are among those at a half:
 * comparing two fractions compares nested populations rather than two draws.
 * Its own stream, salted off the world seed, so drawing it spends nothing any
 * other part of the world draws from.
 */
export function selectAppUsers(
  queryIds: readonly string[],
  fraction: number,
  seed: number,
): Set<string> {
  if (!(fraction >= 0 && fraction <= 1)) {
    throw new Error(`appUserFraction must lie in [0, 1], not ${fraction}`);
  }
  const ids = [...queryIds].sort();
  const rng = makeRng((seed ^ APP_USER_SALT) >>> 0);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = below(rng, i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return new Set(ids.slice(0, Math.round(fraction * ids.length)));
}

/** "appu". Any constant would do; this one is not shared with another stream. */
const APP_USER_SALT = 0x61707075;

/**
 * Who answers the obligations: a live player over HTTP, or an earlier run's
 * recorded answers. The harness cannot tell which, and must not.
 */
interface PlayerPort {
  ready(budgetMs: number): Promise<PlayerIdentity>;
  notify(path: "/v1/run-start" | "/v1/run-end", body: unknown): Promise<void>;
  tick(requestId: string, body: unknown): Promise<TickAnswer>;
  /** Replay only: whether the recording holds an answer to this request. */
  has?(requestId: string): boolean;
  ask(
    requestId: string,
    request: unknown,
    endpoint: "plan" | "replan",
    timeoutMs: number,
  ): Promise<PlayerAnswer>;
}

function httpPlayer(baseUrl: string, token: string | undefined, guardS: number): PlayerPort {
  const headers = playerHeaders(token);
  return {
    ready: async (budgetMs) => {
      await waitForHealth(baseUrl, headers, budgetMs);
      return readIdentity(baseUrl, headers);
    },
    notify: (path, body) => post(baseUrl, headers, path, body),
    tick: (requestId, body) => sendTick(baseUrl, headers, guardS * 1000, requestId, body),
    ask: (requestId, request, endpoint, timeoutMs) =>
      askPlayer(baseUrl, headers, requestId, request, endpoint, timeoutMs),
  };
}

/**
 * The recorded answers, given back by request id (SCORING.md §12, Q19).
 *
 * The player is the only input a seed does not fix, so a run replayed on its
 * own answers decides every traveller and every obligation as it did. What it
 * does not reproduce is what the player *did* while answering — its feed reads
 * and its warnings — because nobody is reading or warning.
 */
function replayPlayer(recorded: readonly RunRecord[]): PlayerPort {
  type Answered = Extract<RunRecord, { kind: "obligation" }>;
  const answers = new Map<string, Answered>();
  for (const r of recorded) if (r.kind === "obligation") answers.set(r.requestId, r);
  const ticks = recorded.filter((r): r is Answered => r.kind === "obligation" && r.obligation === "tick");

  const answerTo = (requestId: string): Answered => {
    const r = answers.get(requestId);
    if (!r) {
      throw new Error(
        `replay diverged: the recorded run was never asked ${requestId}, so this run is not the one recorded`,
      );
    }
    return r;
  };

  // What the recorded player claimed, read back from what it was asked.
  const asked = (kind: "plan" | "replan") =>
    recorded.some((r) => r.kind === "obligation" && r.obligation === kind && r.outcome !== "unclaimed");
  return {
    has: (requestId) => answers.has(requestId),
    ready: () =>
      Promise.resolve({
        capabilities: [
          ...(ticks.length > 0 ? ["tick"] : []),
          ...(asked("plan") ? ["plan"] : []),
          ...(asked("replan") ? ["replan"] : []),
        ],
        tickIntervalS: ticks.length > 1 ? ticks[1]!.issuedAt - ticks[0]!.issuedAt : null,
        contractVersions: [CONTRACT_VERSION],
      }),
    notify: () => Promise.resolve(),
    tick: (requestId) => {
      const r = answerTo(requestId);
      return Promise.resolve({
        ok: r.outcome === "ok",
        nextIntervalS: r.nextIntervalS ?? null,
        timedOut: r.outcome === "player_timeout",
      });
    },
    ask: (requestId) => {
      const r = answerTo(requestId);
      return Promise.resolve({ outcome: r.outcome, itinerary: r.itinerary });
    },
  };
}
