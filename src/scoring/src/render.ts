// Rendering a scorecard.
//
// Specification: SCORING.md §13.
//
// The vector is what is canonical; the headline is one weighting of it and says
// so. A reader should be able to see *why* a score is what it is without
// opening the run log.

import type { Scorecard } from "./scorecard.ts";
import type { AuditResult } from "./information-set.ts";

const mmss = (s: number | null): string =>
  s === null ? "—" : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;

const pad = (s: string, n: number): string => s.padEnd(n);

export function renderScorecard(card: Scorecard, audit?: AuditResult): string {
  const h = card.header;
  const L: string[] = [];
  const p = (s = ""): number => L.push(s);

  p();
  p(
    `  run ${h?.runId ?? "?"}   seed ${h?.worldSeed ?? "?"} · world ${(h?.worldContentHash ?? "?").slice(0, 12)}`,
  );
  p(
    `             engine ${h?.engineVersion ?? "?"} · scorer ${h?.scorerVersion ?? "?"} · contract ${h?.contractVersion ?? "?"}`,
  );
  p(
    `             ${h?.timeMode ?? "?"} · latency ${h?.latencyMode ?? "?"} · reference ${h?.referenceCompetence ?? "?"}`,
  );

  const verdict =
    card.verdict === "scored"
      ? card.cleared
        ? "VALID · tier CLEARED"
        : "VALID · tier NOT CLEARED"
      : card.verdict === "quarantined"
        ? "QUARANTINED"
        : "INVALID";
  p(`             ${verdict}`);
  if (card.verdictReason) p(`             ${card.verdictReason}`);
  p();

  // ---- Service -----------------------------------------------------------
  const s = card.service;
  p(`  SERVICE                              capture ${s.capture === null ? "  n/a" : s.capture.toFixed(3)}`);
  if (s.capture === null && s.captureNote) p(`    ${s.captureNote}`);
  p(`    travellers               ${s.arrived}/${s.travellers} arrived`);
  if (s.nonArrivals > 0) {
    p(`    non-arrivals             ${pad(String(s.nonArrivals), 16)} <- dominates`);
  }
  if (s.forgone > 0) {
    p(`    forgone obligations      ${pad(String(s.forgone), 16)} <- charged, plus the fallback's outcome`);
  }
  p(`    mean journey             ${mmss(s.meanJourneyS)}   (capture uses generalised time, waiting x2)`);
  p(`      P0 oracle              ${mmss(s.meanOracleS)}`);
  p(`      P1 reference           ${mmss(s.meanReferenceS)}`);
  p(`    mean wait                ${mmss(s.meanWaitS)}`);
  p(`    mean transfers           ${s.meanTransfers.toFixed(2)}`);
  p();

  // ---- Information -------------------------------------------------------
  const i = card.information;
  p(`  INFORMATION                          score   ${i.score.toFixed(3)}`);
  if (i.materialEvents === 0 && i.notificationsSent === 0) {
    p("    nothing happened worth telling anyone about");
  } else {
    p(`    material events          ${i.materialEvents}`);
    p(`      warned in time         ${i.inTime}`);
    p(`      warned too late        ${i.late}`);
    p(`      never warned           ${pad(String(i.silent), 16)} <- silence is a failure, not a default`);
    p(`    notifications sent       ${i.notificationsSent}`);
    p(`      to nobody affected     ${pad(String(i.noisy), 16)} <- crying wolf`);
    p(`    recall                   ${i.recall.toFixed(3)}`);
    p(`    precision                ${i.precision.toFixed(3)}`);
    p(`    timeliness               ${i.timeliness.toFixed(3)}`);
  }
  p();

  // ---- Cost --------------------------------------------------------------
  const c = card.cost;
  p(`  COST                                 ${c.withinBudget ? "within budget" : "OVER BUDGET"}`);
  p(`    operator API calls       ${c.apiCalls.toLocaleString("en-US")} / ${c.callBudget.toLocaleString("en-US")}`);
  p(`    bytes                    ${c.bytes.toLocaleString("en-US")}`);
  p(`    notifications            ${c.notifications}`);
  p();

  // ---- Headline ----------------------------------------------------------
  if (card.headline !== null) {
    p(`  HEADLINE  profile=${pad(card.profile, 12)} ${card.headline.toFixed(3)}`);
    p(`            clears at ${card.clearanceThreshold.toFixed(3)}`);
  } else {
    p("  HEADLINE  n/a — no capture to weight");
  }
  p();

  // ---- Attribution -------------------------------------------------------
  if (card.attribution.length > 0) {
    p("  WHERE THE CAPTURE WENT");
    for (const a of card.attribution.slice(0, 5)) {
      p(`    ${a.captureLost.toFixed(2).padStart(6)}  ${pad(`${a.travellers} travellers`, 16)} ${a.cause}`);
    }
    p();
  }

  // ---- Forensics ---------------------------------------------------------
  if (card.impossibleTravellers.length > 0) {
    p("  ! travellers arrived sooner than perfect information allows:");
    for (const t of card.impossibleTravellers) p(`      ${t}`);
    p();
  }

  if (audit) {
    if (audit.clean) {
      p(`  INFORMATION-SET AUDIT   clean over ${audit.obligationsChecked} obligations`);
    } else {
      p(`  INFORMATION-SET AUDIT   ${audit.findings.length} LEAK(S) over ${audit.obligationsChecked} obligations`);
      for (const f of audit.findings.slice(0, 6)) {
        p(`    ${pad(f.queryId, 6)} ${f.explanation}`);
      }
      if (audit.findings.length > 6) p(`    ... and ${audit.findings.length - 6} more`);
      p();
      p("    The player answered better than anything it had been served could");
      p("    justify. In practice this is more often our bug than theirs — a feed");
      p("    serving fresher data than its manifest declares (OBSERVABILITY.md §5).");
    }
    p();
  }

  return L.join("\n");
}
