// Player contract — ticks, lifecycle, and the control API.
//
// Specification: PLAYER-CONTRACT.md §5.6, §5.7, §6.1–§6.3.
//
// **What the simulator sends and accepts, not what it one day will.** Until
// P2M7 these messages had no schema at all: their shapes lived in the harness
// and the control API, and `contract/` described two endpoints of nine. A
// field the contract specifies and the simulator does not yet honour is left
// out of the schema and listed in `NOT_YET_HONOURED` instead, so a player
// reading the published contract is never told to rely on it
// (`KNOWN-ISSUES.md` #72).

import { z } from "zod";

const SimTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/)
  .describe("RFC 3339 with an explicit offset, in simulated time.");

// ---- the player API, continued ---------------------------------------------

export const TickRequest = z
  .object({
    contract_version: z.string(),
    run_id: z.string(),
    sim_time: SimTime,
    guard_wall_s: z.number().positive(),
  })
  .meta({
    id: "TickRequest",
    description:
      "Fetch from the operators now. The simulated clock is paused while you do, so " +
      "every call inside this handler sees the world as of `sim_time`. No simulated " +
      "deadline: only `guard_wall_s` applies.",
  });

export const TickResponse = z
  .object({
    status: z.literal("ok"),
    next_interval_sim_s: z
      .int()
      .positive()
      .optional()
      .describe(
        "Ask for the next tick this many simulated seconds after this one. Never below the " +
          "brief's `min_tick_interval_sim_s`; left out, the cadence stays as it was.",
      ),
  })
  .meta({
    id: "TickResponse",
    description: "Any 2xx acknowledges the tick; any other status is recorded as `player_error`.",
  });

export const RunStartNotice = z
  .object({
    run_id: z.string(),
    brief_digest: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .describe("SHA-256 of the brief's JSON as `/v1/brief` serves it, so a player can tell it read the brief this run is using."),
  })
  .meta({ id: "RunStartNotice", description: "The run has started. Responses are ignored and never scored." });

export const RunEndReason = z.enum(["completed", "aborted", "player_failure", "invalid"]);

export const RunEndNotice = z
  .object({ run_id: z.string(), reason: RunEndReason })
  .meta({ id: "RunEndNotice", description: "The run has ended. Responses are ignored and never scored." });

// ---- the control API ---------------------------------------------------------

export const BriefOperator = z.object({
  id: z.string(),
  name: z.string(),
  base_url: z.string(),
  docs_url: z.string(),
  auth: z.object({ scheme: z.literal("none") }),
});

export const Brief = z
  .object({
    contract_version: z.string(),
    run_id: z.string(),
    world: z.object({
      seed: z.int(),
      engine_version: z.string(),
      timezone: z.string().describe("IANA name of the world's zone."),
      utc_offset: z
        .string()
        .regex(/^[+-]\d{2}:\d{2}$/)
        .describe("The world's offset from UTC. Stated here and nowhere else."),
    }),
    run: z.object({
      wall_budget_s: z
        .number()
        .positive()
        .nullable()
        .describe(
          "The whole run's wall-clock budget in `virtual`; exhausting it makes the run `invalid`. " +
            "Null in `realtime` and `scaled`, whose length is the day's.",
        ),
      pause_queue_depth: z
        .int()
        .positive()
        .describe("How many operator calls may wait out a manual pause; past it they are refused with `503`."),
      abort_after_consecutive_failures: z
        .int()
        .positive()
        .describe("After this many unanswered obligations in a row the run carries on without you, as `player_failure`."),
      mode: z.enum(["open_loop", "closed_loop"]),
      app_user_fraction: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Closed loop only: the share of scored travellers who consult you."),
      cold_start: z.boolean(),
      tier: z.int(),
      time_mode: z.enum(["virtual", "realtime", "scaled"]),
      latency_mode: z.enum(["none", "sim", "wall"]),
    }),
    preparation: z.object({
      wall_budget_s: z
        .number()
        .positive()
        .describe("How long, in wall seconds, you may take to report `ready` on `/v1/health` before the run will not start."),
    }),
    operators: z.array(BriefOperator),
    obligations: z.array(z.enum(["plan", "replan", "tick", "notify"])),
    limits: z.object({
      min_tick_interval_sim_s: z.int().positive(),
      max_walk_m: z.number().positive().describe("A traveller will not walk further than this to or from a stop."),
      walk_speed_mps: z.number().positive().describe("The speed every walk is charged at."),
    }),
  })
  .meta({
    id: "Brief",
    description:
      "Where the operators are and the rules of the world. Nothing about their schemas, " +
      "their quality or how their data relates: discovering that is the game.",
  });

export const RunState = z.enum(["preparation", "running", "paused", "ended"]);

export const Clock = z
  .object({
    sim_time: SimTime,
    state: RunState,
    time_mode: z.enum(["virtual", "realtime", "scaled"]),
    speed: z.number().positive(),
  })
  .meta({ id: "Clock", description: "Simulated time and run state. Unmetered, and never queued." });

export const NotifyRequest = z
  .object({
    traveller_ref: z.string().min(1),
    kind: z.enum(["disruption", "itinerary_update", "info"]).default("info"),
    message: z.string().default(""),
    sent_at: SimTime.optional().describe(
      "Advisory only. The simulator stamps arrival itself, and that stamp is what is scored.",
    ),
  })
  .meta({
    id: "NotifyRequest",
    description:
      "Warn a traveller. The simulator stamps arrival in simulated time; the gap between " +
      "the world changing and that stamp is what the Information family scores.",
  });

export const NotifyAccepted = z
  .object({ accepted: z.literal(true) })
  .meta({ id: "NotifyAccepted", description: "Recorded. Returned with 202." });

// ---- the gap, stated ------------------------------------------------------------

/**
 * What `PLAYER-CONTRACT.md` specifies and the simulator does not yet do.
 *
 * One list, rendered wherever the contract is published, so a player is never
 * invited to depend on something that does not happen — and deleted from, with
 * the schema above gaining the field, when it does (`KNOWN-ISSUES.md` #72).
 */
export const NOT_YET_HONOURED: readonly { readonly what: string; readonly spec: string }[] = [
  {
    what: "`preferences` on a plan request.",
    spec: "PLAYER-CONTRACT.md §5.4",
  },
  {
    what: "Per-operator auth schemes other than `none`: every operator API is open, and only the control API and your service are guarded by the run token.",
    spec: "PLAYER-CONTRACT.md §6.1",
  },
  {
    what: "`itinerary` on a notification: it is accepted and ignored.",
    spec: "PLAYER-CONTRACT.md §6.3",
  },
]

export type TickRequest = z.infer<typeof TickRequest>;
export type TickResponse = z.infer<typeof TickResponse>;
export type RunStartNotice = z.infer<typeof RunStartNotice>;
export type RunEndNotice = z.infer<typeof RunEndNotice>;
export type Brief = z.infer<typeof Brief>;
export type Clock = z.infer<typeof Clock>;
export type NotifyRequest = z.infer<typeof NotifyRequest>;
export type NotifyAccepted = z.infer<typeof NotifyAccepted>;
