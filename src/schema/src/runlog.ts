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
  | "player_timeout";

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
  /** P0 and P1 for this query — the endpoints of the capture scale. */
  readonly oracleJourneyS: number | null;
  readonly referenceJourneyS: number | null;
}

export type RunRecord =
  | RunHeader
  | IngestionRecord
  | ObligationRecord
  | TravellerOutcome;
