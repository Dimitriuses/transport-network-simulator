// L2 dynamics: what goes wrong, and when the world finds out.
//
// Specification: DATA-MODEL.md §3, CORECONCEPT.md §3 (Events).
//
// DETERMINISM RULES APPLY HERE. Every draw comes from the injected seeded PRNG,
// in a fixed order over a sorted journey list, so the same seed produces the
// same day on every machine. Nothing here reads a clock.
//
// The important structure is `announcedAtS`. A disruption is not simply true or
// false — it becomes *knowable* at a moment. Before that instant no feed can
// report it however hard a player polls; after it, whether the player learns
// depends on that operator's lag and honesty. Without this the information
// metric would be measuring nothing: everything would be knowable from the
// start, and polling would be a formality.

import { DEFAULT_DISRUPTION_POLICY, type DisruptionPolicy } from "@tns/schema";
import { makeRng } from "./rng.ts";

export type DisruptionKind = "delay" | "cancellation";

export interface Disruption {
  readonly journeyId: string;
  readonly kind: DisruptionKind;
  /** Seconds added to every stop on the journey. Zero for a cancellation. */
  readonly delayS: number;
  /** When the world knows. Nothing can report it before this. */
  readonly announcedAtS: number;
}

// The policy itself lives in `@tns/schema` (`policy.ts`), not here: the
// generator has to hold `D-staleness` against `noticeLeadS`, and while the two
// numbers sat in different packages nothing could compare them. Re-exported so
// every existing import keeps working.
export { DEFAULT_DISRUPTION_POLICY, type DisruptionPolicy } from "@tns/schema";

export interface JourneyRef {
  readonly id: string;
  readonly startS: number;
}

/**
 * Draw the day's disruptions.
 *
 * Journeys are sorted before drawing so the result depends on the seed alone
 * and never on load order — the kind of thing that reproduces fine on one
 * machine and silently diverges on another.
 */
export function generateDisruptions(
  journeys: readonly JourneyRef[],
  seed: number,
  policy: DisruptionPolicy = DEFAULT_DISRUPTION_POLICY,
): Disruption[] {
  const rng = makeRng(seed);
  const ordered = [...journeys].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const out: Disruption[] = [];
  const span = (r: readonly [number, number]): number => r[0] + (rng() % (r[1] - r[0] + 1));

  for (const j of ordered) {
    // One draw per journey, always, whatever the outcome. Drawing only for
    // affected journeys would make the stream depend on earlier results.
    const roll = rng() % 10_000;
    const cancelCut = Math.round(policy.cancellationRate * 10_000);
    const delayCut = cancelCut + Math.round(policy.delayRate * 10_000);

    if (roll < cancelCut) {
      out.push({
        journeyId: j.id,
        kind: "cancellation",
        delayS: 0,
        announcedAtS: j.startS - span(policy.noticeLeadS),
      });
    } else if (roll < delayCut) {
      out.push({
        journeyId: j.id,
        kind: "delay",
        delayS: span(policy.delayRangeS),
        announcedAtS: j.startS - span(policy.noticeLeadS),
      });
    } else {
      // Burn the draws an affected journey would have used, so a journey's
      // outcome never shifts the stream for those after it.
      span(policy.noticeLeadS);
      span(policy.delayRangeS);
    }
  }

  return out;
}

/**
 * A stable fingerprint of the day itself.
 *
 * The golden trajectory: the world's own event stream, independent of any
 * player. `TECHNICAL-RESEARCH.md` §4 wants a CI test that regenerates a known
 * seed and compares this — any unintended change to the engine then breaks the
 * build immediately, rather than surfacing months later as scores that no
 * longer reproduce.
 *
 * Deliberately *not* a hash of the run log: that contains player responses and
 * wall-clock diagnostics, and differs between players by design.
 */
export function trajectoryFingerprint(disruptions: readonly Disruption[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const feed = (n: number): void => {
    h1 = Math.imul(h1 ^ (n & 0xffff), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((n >>> 16) & 0xffff), 0x85ebca6b) >>> 0;
  };
  for (const d of [...disruptions].sort((a, b) => (a.journeyId < b.journeyId ? -1 : 1))) {
    for (let i = 0; i < d.journeyId.length; i++) feed(d.journeyId.charCodeAt(i));
    feed(d.kind === "cancellation" ? 1 : 2);
    feed(d.delayS);
    feed(d.announcedAtS);
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** Indexed view of the day's disruptions. */
export class DisruptionTable {
  readonly #byJourney: Map<string, Disruption>;

  constructor(disruptions: readonly Disruption[]) {
    this.#byJourney = new Map(disruptions.map((d) => [d.journeyId, d]));
  }

  get(journeyId: string): Disruption | undefined {
    return this.#byJourney.get(journeyId);
  }

  /** What is true of a journey, whether or not anybody has been told yet. */
  actualDelayS(journeyId: string): number {
    const d = this.#byJourney.get(journeyId);
    return d && d.kind === "delay" ? d.delayS : 0;
  }

  isCancelled(journeyId: string): boolean {
    return this.#byJourney.get(journeyId)?.kind === "cancellation";
  }

  /**
   * What is *knowable* at `tau`.
   *
   * The world's own honesty, before any operator gets a chance to lag or lie
   * about it. An operator's published view is this, delayed by its own lag and
   * filtered by its own policy (DATA-MODEL.md §4).
   */
  knownAt(tau: number): Disruption[] {
    return [...this.#byJourney.values()]
      .filter((d) => d.announcedAtS <= tau)
      .sort((a, b) => (a.journeyId < b.journeyId ? -1 : 1));
  }

  get all(): Disruption[] {
    return [...this.#byJourney.values()].sort((a, b) =>
      a.journeyId < b.journeyId ? -1 : 1,
    );
  }
}
