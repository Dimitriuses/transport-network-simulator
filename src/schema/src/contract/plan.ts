// Player contract — the plan obligation.
//
// Specification: PLAYER-CONTRACT.md §5.1, §5.4 and §7.

import { z } from "zod";

/** RFC 3339 with an explicit offset, in simulated time. */
const SimTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

export const Place = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const PlanRequestItem = z.object({
  request_id: z.string().min(1),
  traveller_ref: z.string().min(1),
  origin: Place,
  destination: Place,
  depart_after: SimTime.nullable().default(null),
  arrive_by: SimTime.nullable().default(null),
});

/**
 * The batch envelope, carrying both budgets.
 *
 * `deadline` is simulated and is a fact about the world; in `virtual` mode an
 * answer takes effect at it regardless of how fast the player replied.
 * `guard_wall_s` is real, generous, and never scored (TIME-MODEL.md §4).
 */
export const PlanRequest = z
  .object({
    contract_version: z.string(),
    run_id: z.string(),
    issued_at: SimTime,
    deadline: SimTime,
    guard_wall_s: z.number().positive(),
    requests: z.array(PlanRequestItem).min(1),
  })
  .meta({ id: "PlanRequest" });

/**
 * A leg reference names a place using *that operator's own* published
 * identifiers, never the simulator's canonical ones. Canonical ids would hand
 * over the solved entity-resolution problem (PLAYER-CONTRACT.md §7).
 */
export const OperatorStopRef = z.object({
  operator: z.string().min(1),
  stop: z.string().min(1),
});

export const WalkLeg = z.object({
  mode: z.literal("walk"),
  from: z.union([Place, OperatorStopRef]),
  to: z.union([Place, OperatorStopRef]),
  depart: SimTime,
  arrive: SimTime,
});

export const TransitLeg = z.object({
  mode: z.literal("transit"),
  operator: z.string().min(1),
  route: z.string().min(1),
  trip: z.string().min(1),
  from_stop: z.string().min(1),
  to_stop: z.string().min(1),
  depart: SimTime,
  arrive: SimTime,
});

export const Leg = z.discriminatedUnion("mode", [WalkLeg, TransitLeg]);

export const Itinerary = z.object({ legs: z.array(Leg).min(1) });

export const PlanResultStatus = z.enum(["ok", "no_route", "declined"]);

export const PlanResult = z.object({
  request_id: z.string().min(1),
  status: PlanResultStatus,
  itinerary: Itinerary.nullable().default(null),
});

export const PlanResponse = z
  .object({ results: z.array(PlanResult) })
  .meta({ id: "PlanResponse" });

export type Place = z.infer<typeof Place>;
export type PlanRequestItem = z.infer<typeof PlanRequestItem>;
export type PlanRequest = z.infer<typeof PlanRequest>;
export type Leg = z.infer<typeof Leg>;
export type Itinerary = z.infer<typeof Itinerary>;
export type PlanResult = z.infer<typeof PlanResult>;
export type PlanResponse = z.infer<typeof PlanResponse>;
