// A player that knows more than it should.
//
// **A test fixture, not a competitor.** It opens the world bundle directly and
// plans with the oracle's information — every cancellation and delay, including
// ones no feed has published yet. Nothing in the contract permits this; that is
// the point.
//
// It exists so the information-set audit has a known leak to catch
// (OBSERVABILITY.md §5, ROADMAP.md P0M5 exit condition). An audit that has never
// been shown to fire on a real violation is an assertion, not a check.

import { loadWorld, generateDisruptions } from "@tns/core";
import { buildIndex, route, type Access } from "@tns/router";
import { projectOperator } from "@tns/projections";

export interface CheatPlanner {
  plan: (
    origin: { lat: number; lon: number },
    destination: { lat: number; lon: number },
    departAfterS: number,
  ) => { legs: Record<string, unknown>[] } | null;
  timeOf: (iso: string) => number;
}

export function makeCheatPlanner(worldPath: string): CheatPlanner {
  const world = loadWorld(worldPath);
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);
  // Perfect information: the index already knows which services will not run.
  const ix = buildIndex(world, disruptions);

  const quayToPublished = new Map<string, { operator: string; stop: string }>();
  const journeyToPublished = new Map<string, { operator: string; trip: string; route: string }>();
  for (const op of world.manifest.operators) {
    const { resolution } = projectOperator(world, op.id, 0);
    for (const [quay, stop] of resolution.quayToStop) {
      quayToPublished.set(`${op.id}:${quay}`, { operator: op.id, stop });
    }
    for (const [trip, journey] of resolution.tripToJourney) {
      journeyToPublished.set(journey, { operator: op.id, trip, route: "" });
    }
  }

  const nearby = (lat: number, lon: number): Access[] =>
    world.quays
      .map((q) => {
        const dLat = (q.lat - lat) * 111_320;
        const dLon = (q.lon - lon) * 71_000;
        return { quayId: q.id, metres: Math.sqrt(dLat * dLat + dLon * dLon) };
      })
      .filter((x) => x.metres <= world.manifest.maxWalkM)
      .map((x) => ({ quayId: x.quayId, seconds: Math.ceil(x.metres / world.manifest.walkSpeedMps) }))
      .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

  return {
    timeOf: (iso: string): number => {
      const t = /T(\d{2}):(\d{2}):(\d{2})/.exec(iso);
      const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
      if (!t || !d) return Number.NaN;
      return (Number(d[3]) - 7) * 86400 + Number(t[1]) * 3600 + Number(t[2]) * 60 + Number(t[3]);
    },
    plan: (origin, destination, departAfterS) => {
      const r = route(ix, nearby(origin.lat, origin.lon), nearby(destination.lat, destination.lon), departAfterS, "all");
      if (!r) return null;

      const legs: Record<string, unknown>[] = [];
      for (const leg of r.legs) {
        if (leg.mode !== "transit") continue;
        const trip = journeyToPublished.get(leg.journeyId);
        const from = quayToPublished.get(`${trip?.operator}:${leg.fromQuay}`);
        const to = quayToPublished.get(`${trip?.operator}:${leg.toQuay}`);
        if (!trip || !from || !to) return null;
        legs.push({
          mode: "transit",
          operator: trip.operator,
          route: trip.route || "x",
          trip: trip.trip,
          from_stop: from.stop,
          to_stop: to.stop,
          depart: "2031-04-07T00:00:00+03:00",
          arrive: "2031-04-07T00:00:00+03:00",
        });
      }
      return legs.length > 0 ? { legs } : null;
    },
  };
}
