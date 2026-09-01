// L3 realtime — what an operator says is happening now.
//
// Specification: CORECONCEPT.md §2.1 D, DATA-MODEL.md §4, PLAYER-CONTRACT.md §6.4.
//
// This is the highest-value part of the catalogue and the one the whole
// snapshot rule exists to protect:
//
//     realtime(operator, τ) = the world as of (τ − sₖ), filtered by that
//                             operator's policy
//
// Pure in τ. Two calls at the same τ return identical bytes, so polling faster
// than a feed updates costs quota and yields nothing — which is the real lesson
// of transit integration, enforced by the physics of the world rather than by a
// note in the documentation.
//
// What is *not* published: sₖ itself, or any operator's policy. Discovering
// that a feed is ninety seconds behind, or that it drops cancelled trips
// instead of marking them, is the job.

import type { World } from "@tns/schema";
import { renderSimTime, parseEpoch } from "@tns/schema";
import type { Disruption } from "@tns/core";
import { publishedTime, type OperatorManifest } from "./defects.ts";
import { projectOperator } from "./project.ts";

export type CancellationPolicy =
  /** Marks the trip cancelled, as it should. */
  | "explicit"
  /**
   * The trip simply stops appearing. A documented real-world GTFS-RT failure
   * and the cause of "ghost buses": the vehicle is gone and nothing says so,
   * which is indistinguishable from a feed that has not caught up yet.
   */
  | "silent_drop";

export type DelayUnit = "seconds" | "minutes";

export interface RealtimePolicy {
  /** Characteristic lag in seconds. Never published (catalogue D). */
  readonly staleness_s: number;
  readonly cancellations: CancellationPolicy;
  readonly delay_unit: DelayUnit;
  /** Whether delays are reported at all. */
  readonly publishes_delays: boolean;
}

export const DEFAULT_REALTIME_POLICY: RealtimePolicy = {
  staleness_s: 0,
  cancellations: "explicit",
  delay_unit: "seconds",
  publishes_delays: true,
};

export interface PublishedUpdate {
  readonly trip_id: string;
  readonly status: "on_time" | "delayed" | "cancelled";
  /** In the operator's own unit. Absent when it publishes no delays. */
  readonly delay?: number;
}

export interface RealtimeFeed {
  readonly operator: string;
  /**
   * The instant this view describes — *not* the instant it was requested.
   *
   * An honest feed says how old it is. A player that reads this and reasons
   * about it can work out sₖ; one that assumes it is current cannot.
   */
  readonly as_of: string | number;
  readonly updates: readonly PublishedUpdate[];
}

/**
 * Project one operator's realtime view.
 *
 * `disruptions` is the world's own truth. What comes out is that truth aged by
 * `staleness_s` and filtered by policy — and nothing about a journey the world
 * itself has not yet announced, however far behind the feed is.
 */
export function projectRealtime(
  world: World,
  operatorId: string,
  disruptions: readonly Disruption[],
  policy: RealtimePolicy,
  tau: number,
): RealtimeFeed {
  const info = world.manifest.operators.find((o) => o.id === operatorId);
  if (!info) throw new Error(`no such operator in this world: ${operatorId}`);
  const m = info.manifest as OperatorManifest;

  const anchor = parseEpoch(world.manifest.worldEpochIso);
  const observed = tau - policy.staleness_s;

  const { resolution } = projectOperator(world, operatorId, tau);
  const journeyToTrip = new Map(
    [...resolution.tripToJourney.entries()].map(([trip, journey]) => [journey, trip]),
  );

  const byJourney = new Map(disruptions.map((d) => [d.journeyId, d]));
  const updates: PublishedUpdate[] = [];

  // Only this operator's journeys, and only those the world had announced by
  // the moment this view describes.
  for (const [journeyId, tripId] of [...journeyToTrip.entries()].sort((a, b) =>
    a[1] < b[1] ? -1 : 1,
  )) {
    const d = byJourney.get(journeyId);

    if (!d || d.announcedAtS > observed) {
      updates.push({ trip_id: tripId, status: "on_time" });
      continue;
    }

    if (d.kind === "cancellation") {
      // The ghost-trip case: say nothing at all, and let the player work out
      // that absence means something.
      if (policy.cancellations === "silent_drop") continue;
      updates.push({ trip_id: tripId, status: "cancelled" });
      continue;
    }

    if (!policy.publishes_delays) {
      updates.push({ trip_id: tripId, status: "on_time" });
      continue;
    }

    updates.push({
      trip_id: tripId,
      status: "delayed",
      // Units are the operator's own business, and it does not say which
      // (catalogue C). Minutes are truncated, so the published figure is also
      // less precise than the truth.
      delay: policy.delay_unit === "minutes" ? Math.floor(d.delayS / 60) : d.delayS,
    });
  }

  return {
    operator: operatorId,
    as_of: publishedTime(
      m.time.encoding,
      renderSimTime(anchor, observed),
      observed - world.manifest.utcOffsetS,
    ),
    updates,
  };
}
