// The information-set audit.
//
// Specification: OBSERVABILITY.md §5.
//
// The forensic procedure for an impossible score. `capture > 1` and the
// per-traveller `journey ≥ oracle` check say *that* something is wrong; this
// says *where*, and it is the sharper tool because it is narrower.
//
// The question it answers:
//
//   At the moment the player answered, what did the simulator actually serve
//   it — and does its answer depend on anything outside that?
//
// The legitimate information set is exactly the union of every response served
// up to that τ. It is computable from the ingestion trace, and — because the
// simulator sits on both sides of every request — it is complete whether or not
// the player cooperates. A player trying to hide simply cannot.
//
// The bound below is stronger than comparing against the oracle. The oracle
// knows the whole day; a player planning at τ could not have. So the honest
// ceiling is *the best outcome achievable by a perfect planner that knew only
// what had been published by then*, and beating that is not skill.
//
// In practice this catches our own projection bugs more often than a cheating
// player — a feed serving fresher data than its manifest declares — and that is
// the more valuable outcome.

import type { IngestionRecord, ObligationRecord, RunRecord, TravellerOutcome, World } from "@tns/schema";
import type { Disruption } from "@tns/core";
import { generateDisruptions } from "@tns/core";
import { buildIndex, executeReactively, type Access } from "@tns/router";

export interface LeakFinding {
  readonly travellerRef: string;
  readonly queryId: string;
  /** What the player achieved. */
  readonly actualS: number;
  /** The best achievable from what it had been served by then. */
  readonly boundS: number;
  /** Seconds by which it beat its own information set. */
  readonly excessS: number;
  /** What it appears to have known early. */
  readonly explanation: string;
}

export interface AuditResult {
  readonly obligationsChecked: number;
  readonly findings: readonly LeakFinding[];
  readonly clean: boolean;
}

const TOLERANCE_S = 30;

/**
 * What the player had legitimately been told, by `tau`.
 *
 * Every operator response served up to that instant, aged by that operator's
 * own lag. A disruption enters the set only once some feed could actually have
 * shown it.
 */
function knowableBy(
  world: World,
  disruptions: readonly Disruption[],
  ingestion: readonly IngestionRecord[],
  tau: number,
): Disruption[] {
  const staleness = new Map(
    world.manifest.operators.map((o) => [
      o.id,
      (o.manifest as { realtime?: { staleness_s?: number } }).realtime?.staleness_s ?? 0,
    ]),
  );

  // The latest moment each operator's feed was actually read.
  const lastRead = new Map<string, number>();
  for (const call of ingestion) {
    if (call.tau > tau) continue;
    const seen = lastRead.get(call.operator);
    if (seen === undefined || call.tau > seen) lastRead.set(call.operator, call.tau);
  }

  const operatorOfJourney = new Map<string, string>();
  const lineOfPattern = new Map(world.patterns.map((p) => [p.id, p.lineId]));
  const opOfLine = new Map(world.lines.map((l) => [l.id, l.operator]));
  for (const j of world.journeys) {
    const line = lineOfPattern.get(j.patternId);
    const op = line ? opOfLine.get(line) : undefined;
    if (op) operatorOfJourney.set(j.id, op);
  }

  return disruptions.filter((d) => {
    const op = operatorOfJourney.get(d.journeyId);
    if (op === undefined) return false;
    const readAt = lastRead.get(op);
    if (readAt === undefined) return false; // never looked at this operator
    // The feed read at `readAt` describes the world as of `readAt − sₖ`.
    return d.announcedAtS <= readAt - (staleness.get(op) ?? 0);
  });
}

export function auditInformationSets(
  world: World,
  log: readonly RunRecord[],
): AuditResult {
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);
  const ingestion = log.filter((r): r is IngestionRecord => r.kind === "ingestion");
  const obligations = log.filter(
    (r): r is ObligationRecord => r.kind === "obligation" && r.obligation === "plan",
  );
  const outcomes = new Map(
    log
      .filter((r): r is TravellerOutcome => r.kind === "traveller")
      .map((t) => [t.travellerRef, t]),
  );

  const accessFor = (queryId: string, endpoint: "origin" | "destination"): Access[] =>
    world.queryAccess
      .filter((a) => a.queryId === queryId && a.endpoint === endpoint)
      .map((a) => ({ quayId: a.quayId, seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps) }))
      .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

  const findings: LeakFinding[] = [];

  for (const o of obligations) {
    if (!o.travellerRef) continue;
    const outcome = outcomes.get(o.travellerRef);
    if (!outcome || !outcome.arrived || outcome.journeyS === null) continue;

    const query = world.queries.find((q) => q.id === outcome.queryId);
    if (!query) continue;

    // The ceiling: a perfect planner, restricted to what had been served.
    const known = knowableBy(world, disruptions, ingestion, o.issuedAt);
    const boundIx = buildIndex(world, known);
    const bound = executeReactively(
      world,
      boundIx,
      disruptions,
      accessFor(query.id, "origin"),
      accessFor(query.id, "destination"),
      query.departAfterS,
      "all",
    );

    if (!bound.arrived || bound.journeyS === null) continue;
    const excess = bound.journeyS - outcome.journeyS;
    if (excess <= TOLERANCE_S) continue;

    // What it seems to have known: a disruption on this traveller's day that
    // was true, that it avoided, and that no feed had yet shown it.
    const early = disruptions.filter(
      (d) => !known.includes(d) && d.announcedAtS <= query.departAfterS + (outcome.journeyS ?? 0),
    );

    findings.push({
      travellerRef: o.travellerRef,
      queryId: outcome.queryId,
      actualS: outcome.journeyS,
      boundS: bound.journeyS,
      excessS: excess,
      explanation:
        early.length > 0
          ? `beat its information set by ${Math.round(excess)}s; ${early.length} disruption(s) ` +
            `affecting this day were not yet visible in any feed it had read`
          : `beat its information set by ${Math.round(excess)}s with no unread disruption to explain it`,
    });
  }

  return {
    obligationsChecked: obligations.length,
    findings,
    clean: findings.length === 0,
  };
}
