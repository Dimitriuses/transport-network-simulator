// What map replay draws.
//
// Specification: OBSERVABILITY.md §9, view 2.
//
// **`full` disclosure only.** Positions are canonical coordinates, and where a
// stop really is is exactly what catalogue C's conflicts disagree about; the
// day's delays and cancellations are the disruption stream §8 keeps for `full`.
// The page interpolates a vehicle between consecutive stops, so this ships the
// timetable and the day, not positions.

import type { World } from "@tns/schema";
import { generateDisruptions } from "@tns/core";
import { operatorsOfJourneys } from "./timeline.ts";

export interface MapData {
  readonly quays: readonly { readonly id: string; readonly name: string; readonly lat: number; readonly lon: number }[];
  readonly patterns: readonly {
    readonly id: string;
    readonly operator: string;
    readonly line: string;
    /** Quay index, arrive offset, depart offset — per stop. */
    readonly stops: readonly (readonly [number, number, number])[];
  }[];
  /** Pattern index, start, delay, cancelled. */
  readonly journeys: readonly (readonly [number, number, number, boolean])[];
  readonly journeyIds: readonly string[];
}

export function buildMap(world: World): MapData {
  const quayIndex = new Map(world.quays.map((q, i) => [q.id, i]));
  const patternIndex = new Map(world.patterns.map((p, i) => [p.id, i]));
  const lineById = new Map(world.lines.map((l) => [l.id, l]));
  const operatorOf = operatorsOfJourneys(world);
  const day = generateDisruptions(world.journeys, world.manifest.seed);
  const delay = new Map(day.filter((d) => d.kind === "delay").map((d) => [d.journeyId, d.delayS]));
  const cancelled = new Set(day.filter((d) => d.kind === "cancellation").map((d) => d.journeyId));

  return {
    quays: world.quays.map((q) => ({ id: q.id, name: q.name, lat: q.lat, lon: q.lon })),
    patterns: world.patterns.map((p) => ({
      id: p.id,
      operator: lineById.get(p.lineId)?.operator ?? operatorOf.get(p.id) ?? "?",
      line: lineById.get(p.lineId)?.name ?? p.lineId,
      stops: p.stops.map((s) => [quayIndex.get(s.quayId) ?? -1, s.arriveOffsetS, s.departOffsetS] as const),
    })),
    journeys: world.journeys.map(
      (j) => [patternIndex.get(j.patternId) ?? -1, j.startS, delay.get(j.id) ?? 0, cancelled.has(j.id)] as const,
    ),
    journeyIds: world.journeys.map((j) => j.id),
  };
}
