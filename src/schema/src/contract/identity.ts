// Player contract — identity and health.
//
// Specification: PLAYER-CONTRACT.md §5.2 and §5.3.
//
// These two are defined first because they are the smallest fully-specified
// shapes in the contract, which makes them the right thing to prove the
// schema → JSON Schema → OpenAPI pipeline against.

import { z } from "zod";

/**
 * Capabilities a player may declare.
 *
 * Unclaimed capabilities are scored as *forgone*, not *failed*, so a partial
 * solution is a valid participant (PLAYER-CONTRACT.md §5.2). `tracing` is
 * purely diagnostic: declining it costs precision in the run log, never
 * correctness or score (OBSERVABILITY.md §3).
 */
export const Capability = z.enum([
  "plan",
  "replan",
  "tick",
  "notify",
  "tracing",
]);

/**
 * Simulated-time cadence at which the player wishes to receive ingestion ticks.
 *
 * Must be at least `brief.limits.min_tick_interval_sim_s`. The simulator drives
 * this because in `virtual` mode the simulated clock outruns any player-side
 * polling loop (TIME-MODEL.md §6).
 */
export const TickDeclaration = z
  .object({
    interval_sim_s: z.int().positive(),
  })
  .meta({
    id: "TickDeclaration",
    description: "Requested ingestion cadence, in simulated seconds.",
  });

export const Identity = z
  .object({
    name: z.string().min(1).max(64),
    version: z.string().min(1).max(32),
    contract_versions: z.array(z.string()).min(1),
    capabilities: z.array(Capability),
    tick: TickDeclaration.optional(),
  })
  .meta({
    id: "Identity",
    description:
      "Who the player is, which contract versions it speaks, and what it " +
      "implements. Read once, before the run starts.",
  });

export const HealthStatus = z.enum(["ready", "starting", "unavailable"]);

export const Health = z
  .object({
    status: HealthStatus,
    detail: z.string().max(256).optional(),
  })
  .meta({
    id: "Health",
    description:
      "Readiness. Polled only before the run, with a bounded budget from the brief.",
  });

/**
 * RFC 9457 problem details. Used for errors in both directions
 * (PLAYER-CONTRACT.md §8).
 */
export const Problem = z
  .object({
    type: z.string().default("about:blank"),
    title: z.string(),
    status: z.int().min(400).max(599),
    detail: z.string().optional(),
    instance: z.string().optional(),
  })
  .meta({ id: "Problem", description: "RFC 9457 problem details." });

export type Capability = z.infer<typeof Capability>;
export type TickDeclaration = z.infer<typeof TickDeclaration>;
export type Identity = z.infer<typeof Identity>;
export type Health = z.infer<typeof Health>;
export type Problem = z.infer<typeof Problem>;
