// @tns/scoring
// Run log to scorecard.
//
// Specification: SCORING.md.
//
// Scoring never happens live. It is a pure function of the run log, so a score
// can be recomputed and audited long after the run, and the scorer can be
// fixed independently of the engine (SCORING.md §1).

import type { RunRecord, TravellerOutcome, RunHeader, ObligationRecord } from "@tns/schema";

export const PACKAGE_NAME = "@tns/scoring";

export interface Scorecard {
  readonly header: RunHeader | null;
  readonly travellers: number;
  readonly arrived: number;
  readonly nonArrivals: number;
  readonly meanJourneyS: number | null;
  readonly meanOracleS: number | null;
  readonly meanReferenceS: number | null;
  /** Fraction of the P1→P0 headroom captured, or null when there is none. */
  readonly capture: number | null;
  readonly captureNote: string | null;
  readonly obligations: Record<string, number>;
  readonly ingestionCalls: number;
  readonly ingestionBytes: number;
  /**
   * Travellers whose journey beat the oracle's — which is impossible.
   *
   * `capture > 1` is the headline leak detector (SCORING.md §2), but it is
   * blind whenever P1 and P0 coincide and there is no headroom to divide by.
   * This per-traveller check is strictly stronger: it holds regardless of
   * headroom, so it catches the same class of fault in worlds where the ratio
   * cannot be formed at all. M1 found a real simulator bug this way.
   */
  readonly impossibleTravellers: readonly string[];
}

const mean = (xs: readonly number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Headroom capture (SCORING.md §2):
 *
 *     capture = ( m(P1) − m(player) ) / ( m(P1) − m(P0) )
 *
 * 1.0 matches the oracle; 0.0 is no better than a city with no integration
 * layer; negative means actively harmful; above 1.0 is impossible and signals a
 * leak, a bug, or a cheat.
 */
export function score(log: readonly RunRecord[]): Scorecard {
  const header = (log.find((r) => r.kind === "run_header") as RunHeader | undefined) ?? null;
  const travellers = log.filter((r): r is TravellerOutcome => r.kind === "traveller");
  const obligationRecords = log.filter((r): r is ObligationRecord => r.kind === "obligation");
  const ingestion = log.filter((r) => r.kind === "ingestion");

  const obligations: Record<string, number> = {};
  for (const o of obligationRecords) {
    obligations[o.outcome] = (obligations[o.outcome] ?? 0) + 1;
  }

  const arrived = travellers.filter((t) => t.arrived);

  // Compare on the travellers where all three numbers exist, so the capture
  // ratio is never assembled from different populations.
  const comparable = travellers.filter(
    (t) => t.journeyS !== null && t.oracleJourneyS !== null && t.referenceJourneyS !== null,
  );

  const player = comparable.map((t) => t.journeyS!);
  const oracle = comparable.map((t) => t.oracleJourneyS!);
  const reference = comparable.map((t) => t.referenceJourneyS!);

  const mPlayer = mean(player);
  const mOracle = mean(oracle);
  const mReference = mean(reference);

  let capture: number | null = null;
  let captureNote: string | null = null;

  if (mPlayer === null || mOracle === null || mReference === null) {
    captureNote = "no comparable travellers";
  } else {
    const headroom = mReference - mOracle;
    if (Math.abs(headroom) < 1) {
      // Expected at M1: one operator and no declared conflicts means P1 can do
      // everything P0 can, so there is nothing for an integration layer to
      // capture. A degenerate score here is a true statement about the world,
      // not a bug (see docs/PHASES.md Phase 0, Gate 2).
      captureNote =
        "no headroom: the reference policy already matches the oracle, so " +
        "there is nothing for integration to capture";
    } else {
      capture = (mReference - mPlayer) / headroom;
    }
  }

  // A single traveller arriving sooner than perfect information allows is
  // enough to invalidate a run, no matter what the aggregate says.
  const impossibleTravellers = comparable
    .filter((t) => t.journeyS! < t.oracleJourneyS! - 1)
    .map((t) => `${t.queryId} (${t.journeyS}s < oracle ${t.oracleJourneyS}s)`);

  return {
    header,
    travellers: travellers.length,
    arrived: arrived.length,
    nonArrivals: travellers.length - arrived.length,
    meanJourneyS: mPlayer,
    meanOracleS: mOracle,
    meanReferenceS: mReference,
    capture,
    captureNote,
    obligations,
    ingestionCalls: ingestion.length,
    ingestionBytes: ingestion.reduce((a, r) => a + r.bytes, 0),
    impossibleTravellers,
  };
}

const mmss = (s: number | null): string =>
  s === null ? "—" : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;

export function renderScorecard(card: Scorecard): string {
  const h = card.header;
  const lines: string[] = [];

  lines.push("");
  lines.push(`  run ${h?.runId ?? "?"}   seed ${h?.worldSeed ?? "?"} · engine ${h?.engineVersion ?? "?"} · scorer ${h?.scorerVersion ?? "?"} · contract ${h?.contractVersion ?? "?"}`);
  lines.push(`             ${h?.timeMode ?? "?"} · latency ${h?.latencyMode ?? "?"} · reference ${h?.referenceCompetence ?? "?"}`);
  lines.push("");
  lines.push("  SERVICE");
  lines.push(`    travellers            ${card.arrived}/${card.travellers} arrived`);
  if (card.nonArrivals > 0) {
    lines.push(`    non-arrivals          ${card.nonArrivals}   <- dominates (SCORING.md §4)`);
  }
  lines.push(`    mean journey          ${mmss(card.meanJourneyS)}`);
  lines.push(`      P0 oracle           ${mmss(card.meanOracleS)}`);
  lines.push(`      P1 reference        ${mmss(card.meanReferenceS)}`);
  lines.push("");
  lines.push("  OBLIGATIONS");
  for (const [outcome, n] of Object.entries(card.obligations).sort()) {
    lines.push(`    ${outcome.padEnd(20)}  ${n}`);
  }
  lines.push("");
  lines.push("  COST");
  lines.push(`    operator API calls    ${card.ingestionCalls}`);
  lines.push(`    bytes                 ${card.ingestionBytes.toLocaleString("en-US")}`);
  lines.push("");

  if (card.capture !== null) {
    lines.push(`  CAPTURE               ${card.capture.toFixed(3)}`);
    if (card.capture > 1) {
      lines.push("    ! capture above 1.0 is impossible — see OBSERVABILITY.md §5");
    }
  } else {
    lines.push("  CAPTURE               n/a");
    lines.push(`    ${card.captureNote}`);
  }

  if (card.impossibleTravellers.length > 0) {
    lines.push("");
    lines.push("  ! INVALID — travellers arrived sooner than perfect information allows:");
    for (const t of card.impossibleTravellers) lines.push(`      ${t}`);
    lines.push("    Run the information-set audit (OBSERVABILITY.md §5).");
  }
  lines.push("");

  return lines.join("\n");
}
