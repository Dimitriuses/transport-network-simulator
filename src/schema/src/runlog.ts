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
  /** Simulated seconds per wall second. Recorded outside `virtual` only (TIME-MODEL.md §2.3). */
  readonly speed?: number;
  /**
   * Recorded only for a closed-loop run, so an open-loop header is byte-identical
   * to one written before closed loop existed. Absent means open loop. A
   * closed-loop score is computed by the same machinery and never compares with
   * an open-loop one (SCORING.md §12).
   */
  readonly loop?: "closed";
  /** Closed loop only: the share of scored travellers who use the player (REFERENCE-POLICY.md §3). */
  readonly appUserFraction?: number;
  /**
   * What a viewer of this run may show (OBSERVABILITY.md §8). Absent means
   * `attributed`, the default, so a default header is what it always was.
   */
  readonly disclosure?: "full" | "outcome";
  /** Recorded only at `verbatim`, whose ingestion records carry `body` inline (OBSERVABILITY.md §7). */
  readonly logLevel?: "verbatim";
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
  /**
   * `verbatim` files only: the response body, regenerated at write time. Never
   * in an in-memory log and never hashed — the snapshot rule makes it derivable
   * from `(operator, endpoint, τ)`, which is why `trace` omits it.
   */
  readonly body?: string;
}

/**
 * Something about the log itself rather than the run: at present only that a
 * `verbatim` log reached its cap and carried on at `trace` (OBSERVABILITY.md §7).
 * Written to files, never to the in-memory log.
 */
export interface LogNoteRecord {
  readonly kind: "log_note";
  readonly tau: number;
  readonly note: string;
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
  | "abandon"
  // Never sent (P2M8): the player did not claim the capability, so the
  // traveller acts without it and the obligation counts as forgone
  // (PLAYER-CONTRACT.md §5.2).
  | "unclaimed";

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
  /**
   * `realtime` and `scaled` only: how many simulated seconds past its scheduled
   * instant the obligation was issued, because a slow handler had carried τ
   * beyond it. Wall-derived, absent in `virtual`, and excluded from the golden
   * hash (TIME-MODEL.md §2.3).
   */
  readonly lagS?: number;
  readonly itinerary: Itinerary | null;
  /** `replan` only: what the traveller could perceive going wrong. */
  readonly trigger?: string;
  /** `replan` only: which attempt this was, from 1. */
  readonly attempt?: number;
  /** `tick` only, and only when the player asked for a different cadence (PLAYER-CONTRACT.md §5.6). */
  readonly nextIntervalS?: number;
  /**
   * Recorded without asking the player: an unclaimed capability, or an
   * obligation after the run gave up on the player (`player_failure`). Absent
   * on everything that was sent.
   */
  readonly unsent?: true;
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
  /**
   * Closed loop only. `false` for a traveller outside the app-user fraction, who
   * travels under the reference policy and is never asked about: recorded so the
   * run log holds the whole population, and excluded from every score, because
   * nothing the player did could reach them (REFERENCE-POLICY.md §3).
   */
  readonly appUser?: boolean;
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

/**
 * Someone drove the run from outside it (P2M8): paused it, resumed it, changed
 * its speed or mode, or stopped it. Written at the boundary where the change
 * landed. A run carrying one is not comparable with another, and says so.
 */
export interface ControlRecord {
  readonly kind: "control";
  readonly tau: number;
  readonly action: "pause" | "resume" | "retime" | "stop";
  readonly timeMode?: "virtual" | "realtime" | "scaled";
  readonly speed?: number;
}

/**
 * How a run ended, when it did not simply complete (PLAYER-CONTRACT.md §5.7,
 * §8; TIME-MODEL.md §9). Absent means `completed`, so a completed run's log is
 * what it was before this record existed.
 *
 * * `aborted` — stopped from outside. Kept, never scored.
 * * `player_failure` — too many consecutive unanswered obligations. Scored: the
 *   rest of the day ran without the player, deterministically.
 * * `invalid` — something machine-dependent decided the outcome: a wall guard
 *   breached in `virtual`, or the run's wall budget exhausted. Kept, never scored.
 */
export interface RunEndRecord {
  readonly kind: "run_end";
  readonly tau: number;
  readonly reason: "aborted" | "player_failure" | "invalid";
  readonly detail: string;
}

export type RunRecord =
  | ControlRecord
  | RunEndRecord
  | LogNoteRecord
  | RunHeader
  | IngestionRecord
  | ObligationRecord
  | NotificationRecord
  | MaterialEventRecord
  | TravellerOutcome;
