// The traveller timeline — OBSERVABILITY.md §2's span tree, as data.
//
// Specification: OBSERVABILITY.md §2, §9; SCORING.md §4, §5.
//
// Pure: a run log, the world and the regenerated movements in; one timeline per
// traveller out. The page draws it and decides nothing. **Every number here is
// either read from the log or recomputed by the scorer's own rule**, so a
// timeline cannot tell a different story from the scorecard beside it.

import type {
  IngestionRecord,
  MaterialEventRecord,
  Movement,
  NotificationRecord,
  ObligationRecord,
  RunRecord,
  TravellerOutcome,
  World,
} from "@tns/schema";
import { NON_ARRIVAL_PENALTY_S, WAIT_WEIGHT } from "@tns/scoring";
import type { Regenerated } from "./replay.ts";

/**
 * What a viewer may show (OBSERVABILITY.md §8), as this viewer reads it:
 *
 * * `full` — everything, including where things happened: canonical quays and
 *   journeys, true coordinates, the references' routes.
 * * `attributed` — the disruptions that hit the traveller's own journeys and
 *   when they could be known, reference *totals*, and costs by catalogue
 *   section. **No places**: a canonical quay or journey id is the private
 *   resolution table (DATA-MODEL.md §4), and a true coordinate is what catalogue
 *   C's conflicts disagree about, so either would hand over the answer key.
 * * `outcome` — the player's own actions and outcomes: when it read a feed,
 *   when it warned, when the decision point was. Not what happened or when it
 *   could have been known.
 */
export type Disclosure = "full" | "attributed" | "outcome";

/**
 * A movement as the viewer shows it. Instants are normalised to a span, and the
 * places are present only at `full`.
 */
export interface Step {
  readonly kind: Movement["kind"];
  readonly fromS: number;
  readonly toS: number;
  readonly reason: string | null;
  readonly delayS: number | null;
  readonly journeyId: string | null;
  readonly fromQuay: string | null;
  readonly toQuay: string | null;
}

/**
 * Failure reasons that name a canonical entity rather than one the player
 * published or answered with. `destination_unreachable:q-s1` names the true
 * quay a traveller was left at; `unknown_trip:nordline/215` names the player's
 * own answer, which it already knows.
 */
const CANONICAL_SUFFIX = /^(destination_unreachable|unknown_pattern):.*/;

export function redactReason(reason: string | null, withPlaces: boolean): string | null {
  if (reason === null || withPlaces) return reason;
  return reason.replace(CANONICAL_SUFFIX, "$1");
}

export function toStep(m: Movement, withPlaces: boolean): Step {
  const place = <T>(v: T): T | null => (withPlaces ? v : null);
  switch (m.kind) {
    case "walk":
      return { kind: m.kind, fromS: m.fromS, toS: m.toS, reason: null, delayS: null, journeyId: null, fromQuay: place(m.fromQuay), toQuay: place(m.toQuay) };
    case "wait":
      return { kind: m.kind, fromS: m.fromS, toS: m.toS, reason: null, delayS: null, journeyId: null, fromQuay: place(m.quay), toQuay: place(m.quay) };
    case "ride":
      return { kind: m.kind, fromS: m.fromS, toS: m.toS, reason: null, delayS: m.delayS, journeyId: place(m.journeyId), fromQuay: place(m.fromQuay), toQuay: place(m.toQuay) };
    case "break":
      return { kind: m.kind, fromS: m.atS, toS: m.atS, reason: m.reason, delayS: null, journeyId: place(m.journeyId), fromQuay: place(m.quay), toQuay: null };
    case "arrive":
      return { kind: m.kind, fromS: m.atS, toS: m.atS, reason: null, delayS: null, journeyId: null, fromQuay: null, toQuay: null };
    case "give_up":
      return { kind: m.kind, fromS: m.atS, toS: m.atS, reason: redactReason(m.reason, withPlaces), delayS: null, journeyId: null, fromQuay: null, toQuay: null };
  }
}

export interface ObligationSpan {
  readonly requestId: string;
  readonly obligation: "plan" | "replan";
  readonly issuedAt: number;
  readonly deadline: number;
  readonly outcome: ObligationRecord["outcome"];
  readonly trigger: string | null;
  readonly attempt: number | null;
  /** Transit legs answered, as `operator:trip from→to`. Empty when there was no itinerary. */
  readonly legs: readonly string[];
  /** Operator calls made while this obligation was being answered (OBSERVABILITY.md §3.1). */
  readonly calls: readonly number[];
}

/**
 * One disruption that hit this traveller, and what the player did about it.
 *
 * The four marks of the band: the world changed (`announcedAtS`), it could be
 * known (`knowableAtS`, announced plus the operator's staleness), the player
 * *had it in hand* — its first read of that operator's feed after it was
 * knowable (`fetchedAtS`) — and the traveller was warned (`warnedAtS`). Had it
 * in hand, not understood it: the feed may have said it in a way the player
 * could not read, which is catalogue D's point and not the viewer's to decide.
 */
export interface KnowledgeBand {
  /** `full` only. */
  readonly journeyId: string | null;
  /** The operator whose service it was: the traveller's own itinerary names it. */
  readonly operator: string;
  /** Not at `outcome`, which shows only what the player did. */
  readonly disruption: "delay" | "cancellation" | null;
  readonly announcedAtS: number | null;
  readonly knowableAtS: number | null;
  readonly fetchedAtS: number | null;
  readonly warnedAtS: number | null;
  readonly lastDecisionPointS: number;
  /** As the Information family scores it (SCORING.md §5). */
  readonly verdict: "in_time" | "late" | "silent";
  /** Whether a read of the feed fell inside the window a warning could still use. */
  readonly fetchedInTime: boolean;
}

export interface TravellerTimeline {
  readonly travellerRef: string;
  readonly queryId: string;
  readonly departAfterS: number;
  readonly outcome: TravellerOutcome;
  readonly scored: boolean;
  /** Generalised seconds, as capture is computed on them (SCORING.md §4). */
  readonly effectiveS: number;
  readonly referenceS: number | null;
  readonly announcedS: number | null;
  readonly oracleS: number | null;
  /** Generalised seconds lost against the announcement-limited optimum; null when unscored. */
  readonly lossS: number | null;
  readonly obligations: readonly ObligationSpan[];
  readonly steps: readonly Step[];
  /** The references' own steps, `full` only: a route is a list of places. */
  readonly references: { readonly P1: readonly Step[]; readonly P0a: readonly Step[] } | null;
  readonly knowledge: readonly KnowledgeBand[];
  readonly notifications: readonly { readonly tau: number; readonly kind: string; readonly message: string }[];
  /** Plain sentences, in the order things happened, each resting on something above. */
  readonly explanation: readonly string[];
}

const generalised = (journeyS: number, waitS: number): number => journeyS + (WAIT_WEIGHT - 1) * waitS;

export function buildTimelines(
  world: World,
  log: readonly RunRecord[],
  regenerated: Regenerated,
  disclosure: Disclosure,
): TravellerTimeline[] {
  const full = disclosure === "full";
  const obligations = log.filter((r): r is ObligationRecord => r.kind === "obligation");
  const ingestion = log.filter((r): r is IngestionRecord => r.kind === "ingestion");
  const notifications = log.filter((r): r is NotificationRecord => r.kind === "notification");
  const material = log.filter((r): r is MaterialEventRecord => r.kind === "material_event");

  const callsByCause = new Map<string, number[]>();
  ingestion.forEach((c, i) => {
    if (c.cause === null) return;
    const list = callsByCause.get(c.cause) ?? [];
    list.push(i);
    callsByCause.set(c.cause, list);
  });

  const operatorOfJourney = operatorsOfJourneys(world);
  const firstWarning = new Map<string, number>();
  for (const n of notifications) {
    const seen = firstWarning.get(n.travellerRef);
    if (seen === undefined || n.tau < seen) firstWarning.set(n.travellerRef, n.tau);
  }

  return log
    .filter((r): r is TravellerOutcome => r.kind === "traveller")
    .map((t) => {
      const own = obligations
        .filter((o) => o.travellerRef === t.travellerRef && o.obligation !== "tick")
        .sort((a, b) => a.issuedAt - b.issuedAt || (a.attempt ?? 0) - (b.attempt ?? 0));
      const spans: ObligationSpan[] = own.map((o) => ({
        requestId: o.requestId,
        obligation: o.obligation as "plan" | "replan",
        issuedAt: o.issuedAt,
        deadline: o.deadline,
        outcome: o.outcome,
        trigger: o.trigger ?? null,
        attempt: o.attempt ?? null,
        legs: (o.itinerary?.legs ?? [])
          .filter((l) => l.mode === "transit")
          .map((l) => `${l.operator}:${l.trip} ${l.from_stop}→${l.to_stop}`),
        calls: callsByCause.get(o.requestId) ?? [],
      }));

      const knowledge: KnowledgeBand[] = material
        .filter((e) => e.travellerRef === t.travellerRef)
        .map((e) => {
          const operator = operatorOfJourney.get(e.journeyId) ?? "?";
          const fetch = ingestion.find(
            (c) => c.operator === operator && c.endpoint === "GET /realtime" && c.tau >= e.knowableAtS,
          );
          const warned = firstWarning.get(t.travellerRef) ?? null;
          // Whether it was fetched in time is the player's own action, and is
          // decided against the true knowable instant even where that instant
          // is not shown.
          return {
            journeyId: full ? e.journeyId : null,
            operator,
            disruption: disclosure === "outcome" ? null : e.disruption,
            announcedAtS: disclosure === "outcome" ? null : e.announcedAtS,
            knowableAtS: disclosure === "outcome" ? null : e.knowableAtS,
            fetchedAtS: fetch?.tau ?? null,
            warnedAtS: warned,
            lastDecisionPointS: e.lastDecisionPointS,
            verdict: warned === null ? "silent" : warned > e.lastDecisionPointS ? "late" : "in_time",
            fetchedInTime: fetch !== undefined && fetch.tau <= e.lastDecisionPointS,
          };
        });

      const scored = t.appUser !== false && t.oracleJourneyS !== null && t.referenceJourneyS !== null;
      const effectiveS =
        t.arrived && t.journeyS !== null ? generalised(t.journeyS, t.waitS) : NON_ARRIVAL_PENALTY_S;
      const referenceS = t.referenceJourneyS === null ? null : generalised(t.referenceJourneyS, t.referenceWaitS ?? 0);
      const announcedS =
        t.announcedJourneyS === null || t.announcedJourneyS === undefined
          ? null
          : generalised(t.announcedJourneyS, t.announcedWaitS ?? 0);
      const oracleS = t.oracleJourneyS === null ? null : generalised(t.oracleJourneyS, t.oracleWaitS ?? 0);
      const movements = regenerated.travellers.get(t.travellerRef) ?? [];
      const refs = regenerated.references.get(t.queryId) ?? { P1: [], P0a: [] };

      const timeline: Omit<TravellerTimeline, "explanation"> = {
        travellerRef: t.travellerRef,
        queryId: t.queryId,
        departAfterS: t.departAfter,
        outcome: full ? t : { ...t, failureReason: redactReason(t.failureReason, false) },
        scored,
        effectiveS,
        referenceS,
        announcedS,
        oracleS,
        lossS: scored && announcedS !== null ? effectiveS - announcedS : null,
        obligations: spans,
        steps: movements.map((m) => toStep(m, full)),
        references: full
          ? { P1: refs.P1.map((m) => toStep(m, true)), P0a: refs.P0a.map((m) => toStep(m, true)) }
          : null,
        knowledge,
        notifications: notifications
          .filter((n) => n.travellerRef === t.travellerRef)
          .map((n) => ({ tau: n.tau, kind: n.notificationKind, message: n.message })),
      };
      return { ...timeline, explanation: explain(timeline) };
    });
}

export function operatorsOfJourneys(world: World): Map<string, string> {
  const lineOfPattern = new Map(world.patterns.map((p) => [p.id, p.lineId]));
  const operatorOfLine = new Map(world.lines.map((l) => [l.id, l.operator]));
  const out = new Map<string, string>();
  for (const j of world.journeys) {
    const op = operatorOfLine.get(lineOfPattern.get(j.patternId) ?? "");
    if (op) out.set(j.id, op);
  }
  return out;
}

const clock = (s: number): string => {
  const day = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const hms = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return day > 0 ? `d${day} ${hms}` : hms;
};
const minutes = (s: number): string => `${(s / 60).toFixed(1)} min`;

/**
 * Why this traveller's outcome is what it is, in sentences each resting on a
 * record above: an obligation, a movement, a band, or the outcome itself.
 *
 * Deliberately no inference past the records. "The player routed badly" is not
 * a sentence here; "arrived 6.2 min later than the best announced route" is.
 */
export function explain(t: Omit<TravellerTimeline, "explanation">): string[] {
  const out: string[] = [];
  const o = t.outcome;

  if (o.appUser === false) {
    out.push("Outside the app-user fraction: never asked about, rode the reference policy, and not scored.");
    return out;
  }

  const plan = t.obligations.find((s) => s.obligation === "plan");
  if (plan) {
    out.push(
      plan.outcome === "ok"
        ? `${clock(plan.issuedAt)} plan answered with ${plan.legs.length} transit leg${plan.legs.length === 1 ? "" : "s"}, ` +
            `after ${plan.calls.length} operator call${plan.calls.length === 1 ? "" : "s"}.`
        : `${clock(plan.issuedAt)} plan answered \`${plan.outcome}\`: no itinerary, so the traveller fell back to the reference policy.`,
    );
  }
  if (o.forgone) out.push("Declined obligations are charged the forgone penalty on top of the fallback's outcome (REFERENCE-POLICY.md §8).");

  const replans = t.obligations.filter((s) => s.obligation === "replan");
  let r = 0;
  for (const m of t.steps) {
    if (m.kind === "break") {
      out.push(`${clock(m.fromS)} the plan broke: ${(m.reason ?? "").replace(/_/g, " ")}${m.fromQuay ? ` at ${m.fromQuay}` : ""}.`);
      const answer = replans[r++];
      if (answer) {
        out.push(
          answer.outcome === "ok"
            ? `${clock(answer.issuedAt)} replan ${answer.attempt} answered with ${answer.legs.length} transit leg${answer.legs.length === 1 ? "" : "s"}.`
            : `${clock(answer.issuedAt)} replan ${answer.attempt} answered \`${answer.outcome}\`.`,
        );
      }
    } else if (m.kind === "give_up") {
      out.push(`${clock(m.fromS)} gave up: ${(m.reason ?? "").replace(/_/g, " ")}.`);
    }
  }

  for (const b of t.knowledge) {
    const fetched =
      b.fetchedAtS === null
        ? "the player never read that feed afterwards"
        : b.fetchedInTime
          ? `the player read that feed at ${clock(b.fetchedAtS)}, in time to warn`
          : `the player's next read of that feed was ${clock(b.fetchedAtS)}, after the decision point`;
    const warned =
      b.verdict === "silent"
        ? "and never warned the traveller"
        : b.verdict === "late"
          ? `and warned at ${clock(b.warnedAtS!)}, too late`
          : `and warned at ${clock(b.warnedAtS!)}, in time`;
    const what = b.disruption === null ? `A disruption on ${b.operator}` : `A ${b.disruption} on ${b.operator}`;
    const when = b.knowableAtS === null ? "" : ` was knowable at ${clock(b.knowableAtS)}, and`;
    out.push(`${what}${when} had a decision point at ${clock(b.lastDecisionPointS)}; ${fetched}, ${warned}.`);
    // Two things the scorer does that this timeline makes visible (KNOWN-ISSUES.md #71).
    if (b.knowableAtS !== null && b.knowableAtS > b.lastDecisionPointS) {
      out.push(
        "No warning could have been in time: nothing was knowable until after the decision point, " +
          "and the Information family counts the event anyway (KNOWN-ISSUES.md #71).",
      );
    }
    if (b.knowableAtS !== null && b.verdict === "in_time" && b.warnedAtS !== null && b.warnedAtS < b.knowableAtS) {
      out.push(
        `Credited as warned in time by a warning sent at ${clock(b.warnedAtS)}, before this was knowable: ` +
          "the scorer takes a traveller's earliest warning, whatever it was about (KNOWN-ISSUES.md #71).",
      );
    }
  }

  if (!o.arrived) {
    out.push(`Did not arrive (${o.failureReason ?? "unknown"}), which scores as ${minutes(NON_ARRIVAL_PENALTY_S)} (SCORING.md §4).`);
  } else if (o.journeyS !== null) {
    out.push(`Arrived after ${minutes(o.journeyS)}, ${minutes(o.waitS)} of it waiting.`);
  }

  if (!t.scored) {
    out.push("Not scored: a reference could not route this journey, so there is no scale to place it on.");
  } else if (t.lossS !== null && t.announcedS !== null) {
    const d = t.lossS;
    out.push(
      Math.abs(d) < 1
        ? "As good as the best route knowable when it planned (P0a), in generalised time."
        : d > 0
          ? `${minutes(d)} worse than the best route knowable when it planned (P0a), in generalised time.`
          : !o.arrived
            ? `Scored ${minutes(-d)} better than P0a only because a non-arrival costs ${minutes(NON_ARRIVAL_PENALTY_S)} ` +
              "and P0a's journey took longer: not arriving is scored as the better outcome here (KNOWN-ISSUES.md #68)."
            : `${minutes(-d)} better than P0a in generalised time — legitimate, because P0a is a strategy rather than a bound.`,
    );
  }
  return out;
}
