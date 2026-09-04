// The run log — the substrate scoring is computed from.
//
// Specification: SCORING.md §1, OBSERVABILITY.md §1.
//
// Scoring never happens live. It is a pure function of this log plus the oracle
// results and the world manifest, so a score can be recomputed and audited long
// after the run, and the scorer can be fixed independently of the engine.
//
// Note what is *not* here: operator response bodies. Under the snapshot rule
// they are pure functions of (operator, endpoint, params, τ), so they are
// regenerable and storing them would be waste — the difference between ~14 MB
// and ~3.4 GB for a full run (OBSERVABILITY.md §4).

import type { Itinerary } from "./contract/plan.ts";

export interface RunHeader {
  readonly kind: "run_header";
  readonly runId: string;
  readonly worldSeed: number;
  /** Names the world independently of its SQLite container. */
  readonly worldContentHash: string;
  readonly engineVersion: string;
  readonly scorerVersion: string;
  readonly contractVersion: string;
  readonly timeMode: "virtual" | "realtime" | "scaled";
  readonly latencyMode: "none" | "sim" | "wall";
  readonly referenceCompetence: "habitual" | "timetable" | "single_operator_rt";
  readonly hardwareProfile: string | null;
}

/** One operator API call the player made. Body omitted deliberately. */
export interface IngestionRecord {
  readonly kind: "ingestion";
  readonly tau: number;
  readonly operator: string;
  readonly endpoint: string;
  readonly status: number;
  readonly bytes: number;
  /** Verifies a regenerated body, and doubles as an engine-drift detector. */
  readonly bodyHash: string;
  /** The obligation this call was made while handling, where attributable. */
  readonly cause: string | null;
}

export type ObligationOutcome =
  | "ok"
  | "no_route"
  | "declined"
  | "player_error"
  | "player_timeout"
  // `replan` only (PLAYER-CONTRACT.md §5.5). Both are answers rather than
  // refusals: the player is asserting the current plan is still best, or
  // advising the traveller to give up. Each is charged for what follows.
  | "continue"
  | "abandon";

export interface ObligationRecord {
  readonly kind: "obligation";
  readonly obligation: "plan" | "replan" | "tick";
  readonly requestId: string;
  readonly travellerRef: string | null;
  readonly issuedAt: number;
  readonly deadline: number;
  readonly outcome: ObligationOutcome;
  /** Wall-clock latency. Diagnostic only; inert in `virtual` mode. */
  readonly latencyMs: number;
  readonly itinerary: Itinerary | null;
  /** `replan` only: what the traveller could perceive going wrong. */
  readonly trigger?: string;
  /** `replan` only: which attempt this was, from 1. */
  readonly attempt?: number;
}

/** What actually happened to a scored traveller, against the fixed trajectory. */
export interface TravellerOutcome {
  readonly kind: "traveller";
  readonly travellerRef: string;
  readonly queryId: string;
  readonly departAfter: number;
  readonly arrived: boolean;
  /** Door-to-door seconds, or null if the traveller never arrived. */
  readonly journeyS: number | null;
  readonly waitS: number;
  readonly transfers: number;
  readonly failureReason: string | null;
  /**
   * True when the player did not answer and the traveller fell back to the
   * reference policy. Carries a fixed penalty *and* the resulting P1 outcomes
   * still count in full, so declining is never free (REFERENCE-POLICY.md §8).
   */
  readonly forgone: boolean;
  /** P0 and P1 for this query — the endpoints of the capture scale. */
  readonly oracleJourneyS: number | null;
  readonly referenceJourneyS: number | null;
  /**
   * Waiting done by each, so capture can be computed on *generalised* time.
   *
   * Travellers mind waiting more than riding, so comparing raw door-to-door
   * totals understates a solution that trades a little extra riding for a lot
   * less standing about (SCORING.md §4).
   */
  readonly oracleWaitS: number | null;
  /**
   * The announcement-limited optimum — `P0a`, `REFERENCE-POLICY.md` §2.1.
   *
   * The denominator `capture` is normalised against, because `P0` is
   * clairvoyant and no player can reach it. Optional so that run logs written
   * before this existed still score, against `P0` and with a note saying so.
   */
  readonly announcedJourneyS?: number | null;
  readonly announcedWaitS?: number | null;
  readonly referenceWaitS: number | null;
}

/**
 * A notification the player pushed, stamped with the simulator's own arrival
 * time. The gap between the world event and this instant is the information
 * latency metric (SCORING.md §5).
 */
export interface NotificationRecord {
  readonly kind: "notification";
  readonly tau: number;
  readonly travellerRef: string;
  readonly notificationKind: string;
  readonly message: string;
}

/**
 * A disruption that actually hit a scored traveller's itinerary.
 *
 * Written by the harness so that scoring stays a pure function of the run log
 * (SCORING.md §1) — the scorer must not need the world to work out who was
 * affected.
 */
export interface MaterialEventRecord {
  readonly kind: "material_event";
  readonly travellerRef: string;
  readonly journeyId: string;
  readonly disruption: "delay" | "cancellation";
  readonly announcedAtS: number;
  /** `announced + sₖ` for the operator that runs the journey. */
  readonly knowableAtS: number;
  /** After this a warning cannot change what the traveller does. */
  readonly lastDecisionPointS: number;
}

export type RunRecord =
  | RunHeader
  | IngestionRecord
  | ObligationRecord
  | NotificationRecord
  | MaterialEventRecord
  | TravellerOutcome;
