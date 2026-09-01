// The Information family.
//
// Specification: SCORING.md §5.
//
// The brief said wrong, late and silent are different failures. Working it
// through, there are **four**, and the fourth closes an obvious exploit:
//
//                      | player notified        | player did not
//   -------------------|------------------------|----------------
//   event mattered     | judged on TIMELINESS   | SILENT
//   event did not      | NOISY                  | correct silence
//
// Without the noise term the optimal strategy is to notify every traveller
// about every event, which scores perfectly on silence. Real users uninstall
// apps that do that.
//
// Two things make "late" principled rather than a tuned constant:
//
//   * the **last decision point** — the moment the traveller must commit to
//     the affected leg. After it, a notification is information, not help. It
//     derives from the traveller's own itinerary, so it adapts to the
//     situation and cannot be gamed against a fixed threshold;
//   * the **earliest knowable instant** — `announced + sₖ`. A player is never
//     penalised for failing to know something no feed had yet published.
//     Without this floor the score would partly measure the world's staleness
//     rather than the player's responsiveness.

import type { NotificationRecord, RunRecord, TravellerOutcome } from "@tns/schema";

export interface MaterialEvent {
  readonly travellerRef: string;
  /** When the world announced it. */
  readonly announcedAtS: number;
  /** `announced + sₖ` — the first instant any feed could have shown it. */
  readonly knowableAtS: number;
  /** After this, a warning cannot change what the traveller does. */
  readonly lastDecisionPointS: number;
}

export interface InformationScore {
  /** Material events the player warned about in time, over all material events. */
  readonly recall: number;
  /** Warnings that mattered, over all warnings sent. */
  readonly precision: number;
  /** How early, within the window the player could have acted at all. */
  readonly timeliness: number;
  readonly materialEvents: number;
  readonly silent: number;
  readonly late: number;
  readonly noisy: number;
  readonly inTime: number;
  readonly notificationsSent: number;
  /** Combined family score. */
  readonly score: number;
}

const EMPTY: InformationScore = {
  recall: 1,
  precision: 1,
  timeliness: 1,
  materialEvents: 0,
  silent: 0,
  late: 0,
  noisy: 0,
  inTime: 0,
  notificationsSent: 0,
  score: 1,
};

export function scoreInformation(
  log: readonly RunRecord[],
  events: readonly MaterialEvent[],
): InformationScore {
  const notifications = log.filter((r): r is NotificationRecord => r.kind === "notification");
  if (events.length === 0 && notifications.length === 0) return EMPTY;

  // Earliest warning per traveller. A second warning about the same trouble is
  // not a second chance to have been on time.
  const firstFor = new Map<string, number>();
  for (const n of notifications) {
    const seen = firstFor.get(n.travellerRef);
    if (seen === undefined || n.tau < seen) firstFor.set(n.travellerRef, n.tau);
  }

  const affected = new Set(events.map((e) => e.travellerRef));

  let inTime = 0;
  let late = 0;
  let silent = 0;
  let timelinessTotal = 0;

  for (const e of events) {
    const warned = firstFor.get(e.travellerRef);
    if (warned === undefined) {
      silent++;
      continue;
    }
    if (warned > e.lastDecisionPointS) {
      late++;
      continue;
    }
    inTime++;

    // How much of the usable window the player left the traveller. 1.0 means
    // it warned the instant the information existed; 0.0 means it warned at
    // the last possible moment.
    const window = e.lastDecisionPointS - e.knowableAtS;
    timelinessTotal += window <= 0 ? 1 : Math.max(0, Math.min(1, (e.lastDecisionPointS - warned) / window));
  }

  // Warnings sent to travellers nothing happened to.
  const noisy = [...firstFor.keys()].filter((ref) => !affected.has(ref)).length;

  const recall = events.length === 0 ? 1 : inTime / events.length;
  const precision = firstFor.size === 0 ? 1 : (firstFor.size - noisy) / firstFor.size;
  const timeliness = inTime === 0 ? 0 : timelinessTotal / inTime;

  // Recall and precision as an F1, scaled by how much notice the useful
  // warnings actually gave. A player that warns everybody about everything
  // gets recall for free and loses it again on precision.
  const f1 = recall + precision === 0 ? 0 : (2 * recall * precision) / (recall + precision);

  return {
    recall,
    precision,
    timeliness,
    materialEvents: events.length,
    silent,
    late,
    noisy,
    inTime,
    notificationsSent: notifications.length,
    score: f1 * (0.5 + 0.5 * timeliness),
  };
}

/**
 * Which travellers were materially affected, and by when they needed telling.
 *
 * A traveller is materially affected when a disruption hits a journey their
 * itinerary actually uses. The last decision point is the departure of the leg
 * *before* the affected one — once aboard that, they are committed — or their
 * own departure time if the very first leg is the one that fails.
 */
export function materialEvents(
  log: readonly RunRecord[],
  lookup: (travellerRef: string) => MaterialEvent | null,
): MaterialEvent[] {
  const travellers = log.filter((r): r is TravellerOutcome => r.kind === "traveller");
  return travellers
    .map((t) => lookup(t.travellerRef))
    .filter((e): e is MaterialEvent => e !== null)
    .sort((a, b) => (a.travellerRef < b.travellerRef ? -1 : 1));
}
