// What a lazy integrator *believes* is happening, from reading published feeds.
//
// Specification: CORECONCEPT.md §2.1 D, REFERENCE-POLICY.md §2.
//
// This exists because of a measurement bug that made an entire catalogue
// section invisible. P2 was being handed the world's true disruption set
// directly, so staleness, silently-dropped cancellations and delays published
// in the wrong unit cost it *exactly nothing* — not because those defects do
// not matter, but because the instrument could not perceive them. Ablation
// dutifully reported them at zero.
//
// A baseline that never reads a feed cannot measure conflicts that live in
// feeds. So this one reads them, and believes what it is told:
//
//   * a delay figure is taken at face value, in seconds, whatever unit the
//     operator actually meant;
//   * a trip that is absent from the feed is assumed to be running, because
//     nothing said otherwise;
//   * a feed describes the present, because it did not occur to anyone to ask
//     what `as_of` was for.
//
// Each of those is a mistake a real integrator makes, and each is now something
// a world can charge for.

import type { World } from "@tns/schema";
import type { Disruption } from "@tns/core";
import { projectOperator, projectRealtime } from "@tns/projections";
import type { OperatorManifest } from "@tns/projections";

/** How often a lazy integrator bothers to poll, in simulated seconds. */
export const NAIVE_POLL_CADENCE_S = 300;

/**
 * The disruption set a naive reader holds at `tau`, having polled since the
 * start of service.
 *
 * Returned in the *naive world's* journey id space (`operator:trip`), ready to
 * hand to a router built over merged published data.
 */
export function believedDisruptions(
  world: World,
  disruptions: readonly Disruption[],
  tau: number,
  cadenceS: number = NAIVE_POLL_CADENCE_S,
): Disruption[] {
  return believedDisruptionsAt(world, disruptions, [tau], cadenceS)[0]!;
}

/**
 * The same, snapshotted at several instants for the price of one.
 *
 * Belief is monotonic in time — it is built by replaying polls in order — so a
 * sweep that asks for many instants can walk the feed once and take a copy at
 * each, rather than replaying the morning from scratch for every question. The
 * conflict-depth probe asks about eighty-odd worlds and would otherwise spend
 * nearly all of its time re-reading the same 06:00 feed.
 */
export function believedDisruptionsAt(
  world: World,
  disruptions: readonly Disruption[],
  taus: readonly number[],
  cadenceS: number = NAIVE_POLL_CADENCE_S,
): Disruption[][] {
  const order = taus.map((t, i) => ({ t, i })).sort((a, b) => a.t - b.t);
  const out: Disruption[][] = new Array(taus.length);
  const believed = new Map<string, Disruption>();
  const startS = 6 * 3600;
  const last = order.length === 0 ? startS : order[order.length - 1]!.t;

  const feeds = world.manifest.operators.map((op) => ({
    id: op.id,
    manifest: op.manifest as OperatorManifest,
    journeyOfTrip: projectOperator(world, op.id, 0).resolution.tripToJourney,
  }));

  let next = 0;
  for (let t = startS; t <= last + cadenceS; t += cadenceS) {
    // Everything believed strictly before this poll is what a planner asking at
    // any instant up to it would have had.
    while (next < order.length && order[next]!.t < t) {
      out[order[next]!.i] = snapshot(believed);
      next += 1;
    }
    if (t > last) break;

    for (const { id, manifest, journeyOfTrip } of feeds) {
      collect(believed, world, id, manifest, journeyOfTrip, disruptions, t);
    }
  }
  while (next < order.length) {
    out[order[next]!.i] = snapshot(believed);
    next += 1;
  }
  return out;
}

function snapshot(believed: Map<string, Disruption>): Disruption[] {
  return [...believed.values()].sort((a, b) => (a.journeyId < b.journeyId ? -1 : 1));
}

function collect(
  believed: Map<string, Disruption>,
  world: World,
  opId: string,
  manifest: OperatorManifest,
  journeyOfTrip: ReadonlyMap<string, string>,
  disruptions: readonly Disruption[],
  t: number,
): void {
  const feed = projectRealtime(world, opId, disruptions, manifest.realtime, t);

  for (const u of feed.updates) {
    const journeyId = journeyOfTrip.get(u.trip_id);
    if (!journeyId) continue;
    const key = `${opId}:${u.trip_id}`;

    if (u.status === "cancelled") {
      believed.set(key, {
        journeyId: key,
        kind: "cancellation",
        delayS: 0,
        announcedAtS: t,
      });
      continue;
    }

    if (u.status === "delayed" && u.delay !== undefined) {
      // Taken at face value, in seconds. An operator publishing whole
      // minutes is therefore believed to be running sixty times less late
      // than it is — and nothing in the payload says otherwise.
      believed.set(key, {
        journeyId: key,
        kind: "delay",
        delayS: u.delay,
        announcedAtS: t,
      });
      continue;
    }

    // `on_time`, or a trip the feed stopped mentioning. A previously
    // believed disruption is cleared, because the feed says it is fine
    // now — which is right for a recovered service and wrong for one that
    // silently vanished.
    if (u.status === "on_time") believed.delete(key);
  }
}
