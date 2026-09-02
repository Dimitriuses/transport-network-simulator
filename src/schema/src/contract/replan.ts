// Player contract — the replan obligation.
//
// Specification: PLAYER-CONTRACT.md §5.5.
//
// Issued when a traveller's plan has become unworkable. Specified since
// contract v0.3 and never issued until P0M7; `KNOWN-ISSUES.md` #1 records why
// that mattered more than it looked. A player that only ever answers once, half
// an hour before departure, is barely tested on reconciliation at all, because
// it had almost nothing to reconcile.

import { z } from "zod";
import { Itinerary, OperatorStopRef, Place } from "./plan.ts";

const SimTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);

/**
 * What the traveller can perceive — **never the underlying cause**.
 *
 * A passenger knows their bus did not arrive. They do not know the operator's
 * feed stopped publishing cancellations, and telling them would hand over the
 * answer to catalogue §2.1 D. Every value here is something a person standing
 * on a platform could report.
 */
export const ReplanTrigger = z.enum([
  "missed_connection",
  "vehicle_cancelled",
  "stranded",
  "stop_closed",
  "traveller_initiated",
]);

/**
 * Where the traveller is, in the *operator's* published identifiers (§7).
 *
 * Canonical quay ids would hand over the entity-resolution problem the player
 * is being asked to solve, so a position at a stop is always expressed as the
 * stop that operator publishes — the same reference the player itself used in
 * the itinerary that just broke.
 */
export const ReplanPosition = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("at_stop"), operator: z.string().min(1), stop: z.string().min(1) }),
  z.object({
    kind: z.literal("aboard"),
    operator: z.string().min(1),
    trip: z.string().min(1),
    next_stop: z.string().min(1),
  }),
  z.object({ kind: z.literal("walking"), towards: z.union([Place, OperatorStopRef]) }),
]);

export const ReplanRequestItem = z.object({
  request_id: z.string().min(1),
  traveller_ref: z.string().min(1),
  trigger: ReplanTrigger,
  position: ReplanPosition,
  /**
   * The part of the plan not yet travelled, beginning with the leg that broke.
   *
   * Deliberately not accompanied by the destination. The player was told where
   * this traveller was going when it answered `/v1/plan`, and is expected to
   * have kept it. Re-sending it would make a stateless player indistinguishable
   * from one that tracks its travellers.
   */
  remaining_itinerary: Itinerary.nullable().default(null),
});

export const ReplanRequest = z
  .object({
    contract_version: z.string(),
    run_id: z.string(),
    issued_at: SimTime,
    deadline: SimTime,
    guard_wall_s: z.number().positive(),
    requests: z.array(ReplanRequestItem).min(1),
  })
  .meta({ id: "ReplanRequest" });

/**
 * `continue` asserts the current plan is still the best available; `abandon`
 * advises giving up. Both are answers, and both are charged for what happens
 * next — advising abandonment to a traveller who could have arrived costs the
 * same as failing to route them.
 */
export const ReplanResultStatus = z.enum([
  "ok",
  "continue",
  "abandon",
  "no_route",
  "declined",
]);

export const ReplanResult = z.object({
  request_id: z.string().min(1),
  status: ReplanResultStatus,
  itinerary: Itinerary.nullable().default(null),
});

export const ReplanResponse = z
  .object({ results: z.array(ReplanResult) })
  .meta({ id: "ReplanResponse" });

export type ReplanTrigger = z.infer<typeof ReplanTrigger>;
export type ReplanPosition = z.infer<typeof ReplanPosition>;
export type ReplanRequestItem = z.infer<typeof ReplanRequestItem>;
export type ReplanRequest = z.infer<typeof ReplanRequest>;
export type ReplanResult = z.infer<typeof ReplanResult>;
export type ReplanResponse = z.infer<typeof ReplanResponse>;
