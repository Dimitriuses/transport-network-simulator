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
 * *Decided at M5.* Transit practice conventionally values waiting at around
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
  readonly travellers: number;
  readonly arrived: number;
  readonly nonArrivals: number;
  readonly forgone: number;
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

  let capture: number | null = null;
  let captureNote: string | null = null;
  if (mPlayer === null || mOracle === null || mReference === null) {
    captureNote = "no comparable travellers";
  } else if (Math.abs(mReference - mOracle) < 1) {
    captureNote =
      "no headroom: the reference policy already matches the oracle, so there is " +
      "nothing for integration to capture";
  } else {
    capture = (mReference - mPlayer) / (mReference - mOracle);
  }

  const arrived = travellers.filter((t) => t.arrived);
  const service: ServiceScore = {
    capture,
    captureNote,
    travellers: travellers.length,
    arrived: arrived.length,
    nonArrivals: travellers.length - arrived.length,
    forgone: travellers.filter((t) => t.forgone).length,
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
  } else if (impossibleTravellers.length > 0 || (capture !== null && capture > 1)) {
    // *Decided at M5: quarantine, do not invalidate.* Hard-invalidating risks
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
