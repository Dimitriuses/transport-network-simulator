// Executing a plan against the world that actually happens.
//
// Specification: REFERENCE-POLICY.md §4.2 and §4.3.
//
// DETERMINISM RULES APPLY HERE.
//
// The distinction this file exists to enforce: *planning* and *arriving* are
// different things. P1 and P2 plan on published schedules, which say nothing
// about the train that will not run. Judging them on their plans measures what
// they believed; judging them here measures what happened to the traveller.
//
// P1's behaviour is reactive and never anticipatory (REFERENCE-POLICY.md §4.3):
// it finds out a journey is cancelled by standing on a platform and watching it
// not arrive, then replans from there — again on the schedule, again ignorant
// of the next failure. That is precisely the experience a working integration
// layer exists to prevent, and it is what a player is competing against.

import type { World } from "@tns/schema";
import type { Disruption } from "@tns/core";
import { route, type Access, type RouterIndex, type TransferPolicy } from "./raptor.ts";

export interface Execution {
  readonly arrived: boolean;
  /** Door-to-door seconds, or null if the traveller never got there. */
  readonly journeyS: number | null;
  readonly waitS: number;
  readonly transfers: number;
  /** How many times the plan collapsed and had to be remade. */
  readonly replans: number;
  readonly failureReason: string | null;
  /**
   * Journeys this traveller relied on that turned out to be disrupted.
   *
   * Needed because a player that declines an obligation still owes the
   * traveller a warning: they travel under the reference policy and hit the
   * same trouble. Without this, refusing to answer would produce *no material
   * events at all* and score a perfect Information family — declining your way
   * to a flawless record (REFERENCE-POLICY.md §8).
   */
  readonly disruptedEncountered: readonly string[];
}

/**
 * How many times a broken plan may be remade before the traveller gives up.
 *
 * Shared with the harness deliberately: the player gets exactly the budget the
 * reference policy gets. A player allowed more attempts than P1 would be
 * compared against a traveller held to a stricter rule than itself.
 */
export const MAX_REPLANS = 3;

/**
 * Walk a plan through the real day, replanning when it breaks.
 *
 * `scheduleIx` is the index the traveller plans on — the published schedule,
 * which does not know about disruptions. The disruptions are applied here, as
 * the traveller encounters them.
 */
export function executeReactively(
  world: World,
  scheduleIx: RouterIndex,
  disruptions: readonly Disruption[],
  origins: readonly Access[],
  destinations: readonly Access[],
  departAfterS: number,
  policy: TransferPolicy,
): Execution {
  const cancelled = new Set(
    disruptions.filter((d) => d.kind === "cancellation").map((d) => d.journeyId),
  );
  const delayOf = new Map(
    disruptions.filter((d) => d.kind === "delay").map((d) => [d.journeyId, d.delayS]),
  );

  const walkSpeed = world.manifest.walkSpeedMps;
  const destBy = new Map(destinations.map((d) => [d.quayId, d.seconds]));
  const patternById = new Map(world.patterns.map((p) => [p.id, p]));
  const journeyById = new Map(world.journeys.map((j) => [j.id, j]));

  let cursor = departAfterS;
  let waitS = 0;
  let transfers = 0;
  let replans = 0;
  const disruptedEncountered: string[] = [];
  // Where the traveller currently stands. Null means still at the origin.
  let atQuay: string | null = null;

  for (let attempt = 0; attempt <= MAX_REPLANS; attempt++) {
    const from: Access[] = atQuay === null ? [...origins] : [{ quayId: atQuay, seconds: 0 }];
    const plan = route(scheduleIx, from, destinations, cursor, policy);
    if (!plan) {
      return {
        arrived: false,
        journeyS: null,
        waitS,
        transfers,
        replans,
        failureReason: attempt === 0 ? "no_route" : "stranded_after_replan",
        disruptedEncountered,
      };
    }

    let broke = false;

    for (const leg of plan.legs) {
      if (leg.mode === "walk") {
        // Access and transfer walks are charged by the plan's own timings.
        if (leg.fromQuay === null) cursor += leg.arriveS - leg.departS;
        else if (leg.toQuay !== null) {
          const link = world.walkLinks.find(
            (l) => l.fromQuay === leg.fromQuay && l.toQuay === leg.toQuay,
          );
          cursor += link ? Math.ceil(link.metres / walkSpeed) : leg.arriveS - leg.departS;
          atQuay = leg.toQuay;
        }
        continue;
      }

      const journey = journeyById.get(leg.journeyId);
      const pattern = journey ? patternById.get(journey.patternId) : undefined;
      if (!journey || !pattern) {
        return { arrived: false, journeyS: null, waitS, transfers, replans, failureReason: "bad_plan", disruptedEncountered };
      }

      const boardIdx = pattern.stops.findIndex((s) => s.quayId === leg.fromQuay);
      const alightIdx = pattern.stops.findIndex((s) => s.quayId === leg.toQuay);
      if (boardIdx < 0 || alightIdx <= boardIdx) {
        return { arrived: false, journeyS: null, waitS, transfers, replans, failureReason: "bad_plan", disruptedEncountered };
      }

      atQuay = leg.fromQuay;

      // The traveller is standing at the quay. Now they find out.
      if (cancelled.has(leg.journeyId)) {
        disruptedEncountered.push(leg.journeyId);
        // It simply never comes. They waited for it, and that time is gone.
        const scheduled = journey.startS + pattern.stops[boardIdx]!.departOffsetS;
        waitS += Math.max(0, scheduled - cursor);
        cursor = Math.max(cursor, scheduled);
        replans++;
        broke = true;
        break;
      }

      const delay = delayOf.get(leg.journeyId) ?? 0;
      const departS = journey.startS + delay + pattern.stops[boardIdx]!.departOffsetS;
      const arriveS = journey.startS + delay + pattern.stops[alightIdx]!.arriveOffsetS;

      if (departS < cursor) {
        // An earlier delay cost them this connection.
        if (delay > 0) disruptedEncountered.push(leg.journeyId);
        replans++;
        broke = true;
        break;
      }

      waitS += departS - cursor;
      cursor = arriveS;
      atQuay = leg.toQuay;
      transfers++;
    }

    if (broke) continue;

    const finalWalk = atQuay !== null ? destBy.get(atQuay) : undefined;
    if (finalWalk === undefined) {
      return { arrived: false, journeyS: null, waitS, transfers, replans, failureReason: "bad_plan", disruptedEncountered };
    }

    return {
      arrived: true,
      journeyS: cursor + finalWalk - departAfterS,
      waitS,
      transfers: Math.max(0, transfers - 1),
      replans,
      failureReason: null,
      disruptedEncountered,
    };
  }

  return {
    arrived: false,
    journeyS: null,
    waitS,
    transfers,
    replans,
    failureReason: "abandoned_after_replans",
    disruptedEncountered,
  };
}
