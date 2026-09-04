// The scorecard: three families, a declared profile, and three levels of verdict.
//
// Specification: SCORING.md §3–§10.
//
// The score is a **vector**. Any weighting across three non-substitutable
// families is a value judgement, and burying it inside a single number hides an
// editorial decision. So the vector is canonical, a headline comes from a
// *named published profile*, and every reported headline names its profile.

import type {
  MaterialEventRecord,
  ObligationRecord,
  RunHeader,
  RunRecord,
  TravellerOutcome,
} from "@tns/schema";
import { scoreInformation, type InformationScore } from "./information.ts";

/**
 * How much more a traveller minds waiting than riding.
 *
 * *Decided at P0M5.* Transit practice conventionally values waiting at around
 * twice in-vehicle time, and adopting a published convention beats inventing
 * one. It is a parameter rather than a constant because a world can reasonably
 * disagree — sheltered interchanges are not draughty bus stops — but it is not
 * a knob to tune until a score looks nice.
 */
export const WAIT_WEIGHT = 2.0;

/** A traveller who never arrives is not a slow journey. It is another category. */
export const NON_ARRIVAL_PENALTY_S = 3600;

export interface ServiceScore {
  readonly capture: number | null;
  readonly captureNote: string | null;
  /**
   * Capture against the clairvoyant oracle, reported **only** when the player
   * passed the reachable ceiling.
   *
   * `capture` normalises against `P0a`, which a real solution can legitimately
   * exceed. Above 1.0 is therefore no longer a leak signal on its own — this
   * is, because nothing can beat `P0`.
   */
  readonly captureVsOracle: number | null;
  readonly travellers: number;
  readonly arrived: number;
  readonly nonArrivals: number;
  readonly forgone: number;
  /** Capture lost to declining, before it was subtracted. §8's penalty. */
  readonly forgonePenalty: number;
  /**
   * Raw door-to-door means, over the same population, for a human to read.
   *
   * Capture is computed on *generalised* time (waiting weighted), but reporting
   * generalised minutes would be reporting a number nobody experiences. These
   * three are directly comparable with each other and with a clock.
   */
  readonly meanJourneyS: number | null;
  readonly meanOracleS: number | null;
  readonly meanReferenceS: number | null;
  readonly meanWaitS: number;
  readonly meanTransfers: number;
}

export interface CostScore {
  readonly apiCalls: number;
  readonly bytes: number;
  readonly notifications: number;
  readonly callBudget: number;
  readonly withinBudget: boolean;
}

export type Verdict = "scored" | "quarantined" | "invalid";

export interface ProfileWeights {
  readonly name: string;
  readonly service: number;
  readonly information: number;
  readonly cost: number;
}

/**
 * Named profiles. The weights are honest guesses and should be treated as such
 * — a starting point for argument, not a result. What matters structurally is
 * that the profile is named wherever a headline appears.
 */
export const PROFILES: Record<string, ProfileWeights> = {
  balanced: { name: "balanced", service: 0.6, information: 0.4, cost: 0 },
  passenger: { name: "passenger", service: 1.0, information: 0.0, cost: 0 },
  realtime: { name: "realtime", service: 0.3, information: 0.7, cost: 0 },
  efficient: { name: "efficient", service: 0.5, information: 0.3, cost: 0.2 },
};

export interface Attribution {
  readonly cause: string;
  readonly travellers: number;
  readonly captureLost: number;
}

export interface Scorecard {
  readonly header: RunHeader | null;
  readonly verdict: Verdict;
  readonly verdictReason: string | null;
  readonly cleared: boolean;
  readonly clearanceThreshold: number;
  readonly service: ServiceScore;
  readonly information: InformationScore;
  readonly cost: CostScore;
  readonly headline: number | null;
  readonly profile: string;
  readonly attribution: readonly Attribution[];
  /** Travellers who arrived sooner than perfect information allows. */
  readonly impossibleTravellers: readonly string[];
  readonly obligations: Record<string, number>;
}

const mean = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * What declining one traveller's obligation costs, as a share of the headroom
 * that traveller represented.
 *
 * PROVISIONAL — see the note where it is applied. `REFERENCE-POLICY.md` §8
 * requires the penalty and does not fix its size.
 */
export const FORGONE_PENALTY_SHARE = 1.0;

/** Per-tier minimum capture to clear. Tier 0 asks only that you turn up. */
const CLEARANCE: Record<number, number> = { 0: 0.0, 1: 0.1, 2: 0.25, 3: 0.35, 4: 0.4, 5: 0.45 };

export interface ScoreOptions {
  readonly profile?: string;
  readonly tier?: number;
  readonly callBudget?: number;
  /** Set when the harness aborted for a machine-dependent reason. */
  readonly invalidReason?: string | null;
}

export function scoreRun(log: readonly RunRecord[], opts: ScoreOptions = {}): Scorecard {
  const header = (log.find((r) => r.kind === "run_header") as RunHeader | undefined) ?? null;
  const travellers = log.filter((r): r is TravellerOutcome => r.kind === "traveller");
  const obligationRecords = log.filter((r): r is ObligationRecord => r.kind === "obligation");
  const ingestion = log.filter((r) => r.kind === "ingestion");
  const notifications = log.filter((r) => r.kind === "notification");

  const obligations: Record<string, number> = {};
  for (const o of obligationRecords) obligations[o.outcome] = (obligations[o.outcome] ?? 0) + 1;

  // ---- Service -----------------------------------------------------------
  //
  // Compared only on travellers where all three numbers exist, so the ratio is
  // never assembled from different populations. Non-arrivals are handled
  // separately and heavily: buying a good mean by stranding the hard cases is
  // exactly what §4 exists to prevent.
  const comparable = travellers.filter(
    (t) => t.journeyS !== null && t.oracleJourneyS !== null && t.referenceJourneyS !== null,
  );
  void comparable;

  // Generalised time: riding counts once, waiting counts WAIT_WEIGHT times.
  // Comparing raw door-to-door totals would understate a solution that trades
  // a little extra riding for a lot less standing about — which is exactly the
  // trade a good journey planner makes.
  const generalised = (journeyS: number, waitS: number): number =>
    journeyS + (WAIT_WEIGHT - 1) * waitS;

  const effective = (t: TravellerOutcome): number =>
    t.arrived && t.journeyS !== null
      ? generalised(t.journeyS, t.waitS)
      : NON_ARRIVAL_PENALTY_S;

  const scored = travellers.filter((t) => t.oracleJourneyS !== null && t.referenceJourneyS !== null);
  const mPlayer = mean(scored.map(effective));
  const mOracle = mean(scored.map((t) => generalised(t.oracleJourneyS!, t.oracleWaitS ?? 0)));
  const mReference = mean(
    scored.map((t) => generalised(t.referenceJourneyS!, t.referenceWaitS ?? 0)),
  );

  // **Normalised against P0a, not P0** (decided 2026-09-04, SCORING.md §2).
  //
  // P0 is clairvoyant: it routes around a cancellation announced after it
  // planned. On the P0M9 world it sits 2.10 min below P1 out of 3.35 min of
  // headroom, so a solution reconciling perfectly and reading every feed the
  // instant it published still tops out near 0.37 against it. A capture of 1.0
  // against P0 is not hard, it is impossible, and quoting a score on a scale
  // whose maximum cannot be reached is the failure §2 was written to avoid.
  const withAnnounced = scored.filter(
    (t) => t.announcedJourneyS !== null && t.announcedJourneyS !== undefined,
  );
  const usingAnnounced = withAnnounced.length === scored.length && scored.length > 0;
  const mAnnounced = usingAnnounced
    ? mean(withAnnounced.map((t) => generalised(t.announcedJourneyS!, t.announcedWaitS ?? 0)))
    : null;

  // The ceiling actually used. Falls back to P0 for run logs written before P0a
  // was recorded, and says so rather than silently changing scale.
  const mCeiling = usingAnnounced ? mAnnounced : mOracle;

  // **The forgone-obligation penalty.** `REFERENCE-POLICY.md` §8 requires it and
  // calls it "a requirement rather than a preference", naming the hazard
  // exactly: *a half-built solution that answers badly could plausibly score
  // worse than one that answers not at all.*
  //
  // It was never implemented. Declining was free — a forgone traveller received
  // P1's outcome and nothing more, so its capture contribution was zero rather
  // than negative. Measured at P0M10: the naive solution declines 42 of 132
  // obligations and outscores the competent solution, which declines 12 and
  // answers the rest. The predicted exploit was live for ten milestones.
  //
  // Expressed as a share of the headroom each declined traveller represented,
  // so it scales with the world rather than being an absolute number of
  // seconds that means different things in different cities.
  //
  // **The magnitude is PROVISIONAL.** §8 asks for "strictly worse than a
  // competent answer and roughly comparable to a poor one" and does not fix a
  // number. 1.0 forfeits the whole of what integration was worth to that
  // traveller. It is deliberately reported separately so the effect of changing
  // it is visible rather than baked into one figure.
  const forgoneCount = travellers.filter((t) => t.forgone).length;
  const forgonePenalty =
    travellers.length === 0 ? 0 : FORGONE_PENALTY_SHARE * (forgoneCount / travellers.length);

  let capture: number | null = null;
  let captureNote: string | null = null;
  let captureVsOracle: number | null = null;

  if (mPlayer === null || mOracle === null || mReference === null || mCeiling === null) {
    captureNote = "no comparable travellers";
  } else if (Math.abs(mReference - mCeiling) < 1) {
    captureNote =
      "no headroom: the best reachable outcome already matches the reference policy, " +
      "so there is nothing for integration to capture";
  } else {
    capture = (mReference - mPlayer) / (mReference - mCeiling) - forgonePenalty;
    if (!usingAnnounced) {
      captureNote =
        "normalised against P0, the clairvoyant oracle: this run log predates P0a " +
        "and its capture is on a scale whose maximum no player can reach";
    } else if (capture > 1) {
      // **Not an error.** P0a is a well-informed strategy rather than a proven
      // bound (KNOWN-ISSUES.md #15), so a real solution can legitimately beat
      // it — it plans once on what was announced and only replans when its plan
      // breaks. What remains impossible is beating P0, which sees the whole day
      // in advance. So the invariant moves to a second line of defence rather
      // than disappearing: when a player passes the reachable ceiling, check it
      // against the unreachable one.
      captureVsOracle = (mReference - mPlayer) / (mReference - mOracle);
      captureNote =
        captureVsOracle > 1
          ? `beat the clairvoyant oracle (${captureVsOracle.toFixed(3)} against P0) — ` +
            "impossible, so information has leaked; see OBSERVABILITY.md §5"
          : `beat the announcement-limited optimum (${captureVsOracle.toFixed(3)} against P0), ` +
            "which is legitimate: P0a is a strategy, not a bound";
    }
  }

  const arrived = travellers.filter((t) => t.arrived);
  const service: ServiceScore = {
    capture,
    captureNote,
    captureVsOracle,
    travellers: travellers.length,
    arrived: arrived.length,
    nonArrivals: travellers.length - arrived.length,
    forgone: forgoneCount,
    forgonePenalty,
    // Raw, and over the same population as each other.
    meanJourneyS: mean(
      scored.map((t) => (t.arrived && t.journeyS !== null ? t.journeyS : NON_ARRIVAL_PENALTY_S)),
    ),
    meanOracleS: mean(scored.map((t) => t.oracleJourneyS!)),
    meanReferenceS: mean(scored.map((t) => t.referenceJourneyS!)),
    meanWaitS: mean(travellers.map((t) => t.waitS)) ?? 0,
    meanTransfers: mean(travellers.map((t) => t.transfers)) ?? 0,
  };

  // ---- Information -------------------------------------------------------
  const information = scoreInformation(
    log,
    log
      .filter((r): r is MaterialEventRecord => r.kind === "material_event")
      .map((e) => ({
        travellerRef: e.travellerRef,
        announcedAtS: e.announcedAtS,
        knowableAtS: e.knowableAtS,
        lastDecisionPointS: e.lastDecisionPointS,
      })),
  );

  // ---- Cost --------------------------------------------------------------
  //
  // A contractual quota, not a virtue. Within budget it costs nothing: nobody
  // praises an aggregator for making fewer calls than its contract allows.
  const callBudget = opts.callBudget ?? 5000;
  const cost: CostScore = {
    apiCalls: ingestion.length,
    bytes: ingestion.reduce((a, r) => a + (r.kind === "ingestion" ? r.bytes : 0), 0),
    notifications: notifications.length,
    callBudget,
    withinBudget: ingestion.length <= callBudget,
  };

  // ---- Validity ----------------------------------------------------------
  const impossibleTravellers = comparable
    .filter((t) => t.journeyS! < t.oracleJourneyS! - 1)
    .map((t) => `${t.queryId} (${t.journeyS}s < oracle ${t.oracleJourneyS}s)`);

  let verdict: Verdict = "scored";
  let verdictReason: string | null = null;

  if (opts.invalidReason) {
    verdict = "invalid";
    verdictReason = opts.invalidReason;
    // **The trigger is beating P0, not beating `capture`'s own denominator.**
    // Since 2026-09-04 capture normalises against P0a, which a real solution
    // may legitimately exceed (KNOWN-ISSUES.md #15) — quarantining on that
    // would punish a player for being better than a heuristic reference.
    // Arriving sooner than perfect information allows remains impossible, and
    // that is what is checked: per traveller, and in aggregate.
  } else if (
    impossibleTravellers.length > 0 ||
    (captureVsOracle !== null && captureVsOracle > 1)
  ) {
    // *Decided at P0M5: quarantine, do not invalidate.* Hard-invalidating risks
    // punishing a player for our bug — and during Phase 0 every single
    // occurrence of this signal was our bug, three times over. The run is
    // scored and withheld from comparison pending the information-set audit
    // (OBSERVABILITY.md §5).
    verdict = "quarantined";
    verdictReason =
      "a traveller arrived sooner than perfect information allows; " +
      "run the information-set audit before trusting this score";
  } else if (!cost.withinBudget) {
    verdictReason = `over the API call budget (${cost.apiCalls}/${callBudget})`;
  }

  // ---- Headline ----------------------------------------------------------
  const profile = PROFILES[opts.profile ?? "balanced"] ?? PROFILES["balanced"]!;
  const costTerm = cost.withinBudget ? 1 : Math.max(0, 1 - (cost.apiCalls - callBudget) / callBudget);
  const headline =
    capture === null
      ? null
      : profile.service * capture +
        profile.information * information.score +
        profile.cost * costTerm;

  // ---- Clearance ---------------------------------------------------------
  const tier = opts.tier ?? header?.worldSeed ?? 0;
  const threshold = CLEARANCE[opts.tier ?? 0] ?? 0;
  const cleared = verdict === "scored" && headline !== null && headline >= threshold;
  void tier;

  return {
    header,
    verdict,
    verdictReason,
    cleared,
    clearanceThreshold: threshold,
    service,
    information,
    cost,
    headline,
    profile: profile.name,
    attribution: attribute(travellers),
    impossibleTravellers,
    obligations,
  };
}

/**
 * Attribution, stage one: where the lost capture went.
 *
 * Bookkeeping over the run log, and cheap. Stage two — re-running the query set
 * with one declared conflict neutralised at a time — is opt-in, because its
 * cost scales with the conflict count (SCORING.md §10).
 */
function attribute(travellers: readonly TravellerOutcome[]): Attribution[] {
  const buckets = new Map<string, { travellers: number; lost: number }>();

  for (const t of travellers) {
    if (t.oracleJourneyS === null || t.referenceJourneyS === null) continue;
    const headroom = t.referenceJourneyS - t.oracleJourneyS;
    if (Math.abs(headroom) < 1) continue;

    const actual = t.arrived && t.journeyS !== null ? t.journeyS : NON_ARRIVAL_PENALTY_S;
    const lost = (actual - t.oracleJourneyS) / headroom;
    if (lost <= 0) continue;

    const cause = t.forgone
      ? "forgone obligation — fell back to the reference policy"
      : !t.arrived
        ? `did not arrive: ${t.failureReason ?? "unknown"}`
        : "arrived, but slower than the oracle";

    const b = buckets.get(cause) ?? { travellers: 0, lost: 0 };
    b.travellers++;
    b.lost += lost;
    buckets.set(cause, b);
  }

  return [...buckets.entries()]
    .map(([cause, b]) => ({ cause, travellers: b.travellers, captureLost: b.lost }))
    .sort((a, b) => b.captureLost - a.captureLost);
}
