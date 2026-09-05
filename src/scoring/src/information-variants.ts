// The four candidate Information formulas, scored side by side.
//
// Specification: SCORING.md §5 and its OPEN item, KNOWN-ISSUES.md #19.
//
// The family registers realtime failures and does not score them: ten silent
// events move it by 0.001. `SCORING.md` lists four directions and chooses none,
// and this project's habit is that a scoring change gets ratified against a
// measurement rather than an argument — so all four are implemented here as
// pure functions of the same `(log, events)` and reported together.
//
// **Nothing here is wired into `scoreRun`.** `npm run information` prints the
// comparison; whichever formula is ratified then replaces the one in
// `information.ts`. Implementing a guess into the live scorecard is what
// `CLAUDE.md` forbids for an OPEN item, and it would also make every recorded
// score incomparable before anybody had decided it should be.

import type { MaterialEventRecord, RunRecord, TravellerOutcome } from "@tns/schema";
import type { MaterialEvent } from "./information.ts";

export interface VariantScore {
  readonly name: string;
  readonly score: number;
  /** One line saying what this formula is for. */
  readonly rationale: string;
}

/**
 * The counts every formula above is computed from.
 *
 * Reported beside the scores because a table of four numbers that all failed to
 * move is uninterpretable without them: a formula that cannot see a conflict
 * and a *world* that produced no events to see look identical in the score
 * column and are opposite problems.
 */
export interface InformationCounts {
  readonly materialEvents: number;
  readonly notified: number;
  readonly inTime: number;
  readonly late: number;
  readonly silent: number;
  readonly noisy: number;
}

/** Material events as the scorecard builds them, from the run log. */
export function eventsOf(log: readonly RunRecord[]): MaterialEvent[] {
  return log
    .filter((r): r is MaterialEventRecord => r.kind === "material_event")
    .map((e) => ({
      travellerRef: e.travellerRef,
      announcedAtS: e.announcedAtS,
      knowableAtS: e.knowableAtS,
      lastDecisionPointS: e.lastDecisionPointS,
    }));
}

interface Judged {
  readonly event: MaterialEvent;
  /** `in_time`, `late`, or `silent`. */
  readonly verdict: "in_time" | "late" | "silent";
  /** Share of the usable window left to the traveller; 0 unless in time. */
  readonly timeliness: number;
}

/** The shared front half: who was warned, when, and how much good it did. */
function judge(log: readonly RunRecord[], events: readonly MaterialEvent[]) {
  const notifications = log.filter((r) => r.kind === "notification");
  const firstFor = new Map<string, number>();
  for (const n of notifications) {
    const rec = n as { travellerRef: string; tau: number };
    const seen = firstFor.get(rec.travellerRef);
    if (seen === undefined || rec.tau < seen) firstFor.set(rec.travellerRef, rec.tau);
  }

  const judged: Judged[] = events.map((e) => {
    const warned = firstFor.get(e.travellerRef);
    if (warned === undefined) return { event: e, verdict: "silent" as const, timeliness: 0 };
    if (warned > e.lastDecisionPointS) return { event: e, verdict: "late" as const, timeliness: 0 };
    const window = e.lastDecisionPointS - e.knowableAtS;
    const t = window <= 0 ? 1 : Math.max(0, Math.min(1, (e.lastDecisionPointS - warned) / window));
    return { event: e, verdict: "in_time" as const, timeliness: t };
  });

  const affected = new Set(events.map((e) => e.travellerRef));
  const noisy = [...firstFor.keys()].filter((ref) => !affected.has(ref)).length;
  const inTime = judged.filter((j) => j.verdict === "in_time").length;

  const recall = events.length === 0 ? 1 : inTime / events.length;
  const precision = firstFor.size === 0 ? 1 : (firstFor.size - noisy) / firstFor.size;
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);
  const timeliness =
    inTime === 0 ? 0 : judged.reduce((a, j) => a + j.timeliness, 0) / inTime;

  return { judged, recall, precision, f1, timeliness, warnedCount: firstFor.size, noisy };
}

/**
 * What each material event actually cost the traveller it happened to, in
 * seconds of journey time over the announcement-limited optimum.
 *
 * A traveller who did not arrive is charged the largest cost seen, rather than
 * an arbitrary constant: it keeps the weighting on one scale, and this project
 * has been bitten repeatedly by two numbers from different scales in one
 * expression.
 */
function costPerTraveller(log: readonly RunRecord[]): Map<string, number> {
  const travellers = log.filter((r): r is TravellerOutcome => r.kind === "traveller");
  const excess = new Map<string, number>();
  let worst = 0;
  for (const t of travellers) {
    if (!t.arrived || t.journeyS === null || t.referenceJourneyS === null) continue;
    const over = Math.max(0, t.journeyS - t.referenceJourneyS);
    excess.set(t.travellerRef, over);
    if (over > worst) worst = over;
  }
  for (const t of travellers) {
    if (!excess.has(t.travellerRef)) excess.set(t.travellerRef, worst);
  }
  return excess;
}

/** The raw tallies, for reading the score table beside. */
export function informationCounts(
  log: readonly RunRecord[],
  events: readonly MaterialEvent[],
): InformationCounts {
  const { judged, warnedCount, noisy } = judge(log, events);
  return {
    materialEvents: events.length,
    notified: warnedCount,
    inTime: judged.filter((j) => j.verdict === "in_time").length,
    late: judged.filter((j) => j.verdict === "late").length,
    silent: judged.filter((j) => j.verdict === "silent").length,
    noisy,
  };
}

/**
 * All four candidates, on one run.
 *
 * `current` reproduces `information.ts` exactly, so the comparison has a
 * baseline that cannot drift away from what is actually scored.
 */
export function informationVariants(
  log: readonly RunRecord[],
  events: readonly MaterialEvent[],
): VariantScore[] {
  const { judged, f1, timeliness, precision } = judge(log, events);

  // 1. As it stands today.
  const current = f1 * (0.5 + 0.5 * timeliness);

  // 2. Direction 1 — remove the floor. A warning that arrives after the
  //    traveller has boarded is worth close to nothing, and the floor says it
  //    is worth half.
  const noFloor = f1 * timeliness;

  // 3. Direction 2 — score per material event rather than in aggregate, so ten
  //    silent events cost ten events' worth rather than a shift in a ratio of
  //    ratios. Precision still scales the result, because otherwise warning
  //    everybody about everything is free.
  const perEvent =
    judged.length === 0
      ? 1
      : judged.reduce((a, j) => a + (j.verdict === "in_time" ? j.timeliness : 0), 0) /
        judged.length;
  const perEventScore = perEvent * precision;

  // 4. Direction 3 — weight each event by what it cost the traveller it
  //    happened to. A missed warning about a cancellation that stranded
  //    somebody should not score the same as one about a two-minute delay.
  const cost = costPerTraveller(log);
  const weights = judged.map((j) => Math.max(1, cost.get(j.event.travellerRef) ?? 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weighted =
    totalWeight === 0
      ? 1
      : judged.reduce(
          (a, j, i) => a + (j.verdict === "in_time" ? j.timeliness : 0) * weights[i]!,
          0,
        ) / totalWeight;
  const weightedScore = weighted * precision;

  return [
    {
      name: "current",
      score: current,
      rationale: "F1(recall, precision) x (0.5 + 0.5 x timeliness)",
    },
    {
      name: "no floor",
      score: noFloor,
      rationale: "F1 x timeliness — lateness can cost the whole family",
    },
    {
      name: "per event",
      score: perEventScore,
      rationale: "mean per-event credit x precision — ten silent events cost ten",
    },
    {
      name: "cost weighted",
      score: weightedScore,
      rationale: "per-event credit weighted by seconds the traveller lost",
    },
  ];
}
