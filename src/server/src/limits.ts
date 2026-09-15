// The numbers a brief publishes and the simulator enforces, in one place.
//
// Specification: PLAYER-CONTRACT.md §4, §5.6, §6.1, §8; TIME-MODEL.md §4, §9.
//
// Two numbers that decide something together must live together: the brief
// states each of these and the harness holds a player to it, and a copy in each
// would be how the two came to disagree.

/** Wall seconds a request may run before it is abandoned (TIME-MODEL.md §4). */
export const GUARD_WALL_S = 30;
/** How long a player may take to become ready: `preparation.wall_budget_s`. */
export const PREPARATION_WALL_BUDGET_S = 300;
/** A `virtual` run's whole wall budget: `run.wall_budget_s`. */
export const RUN_WALL_BUDGET_S = 3600;
/** `run.abort_after_consecutive_failures`. */
export const ABORT_AFTER_CONSECUTIVE_FAILURES = 50;
/** The fastest a player may ask for ticks: `limits.min_tick_interval_sim_s`. */
export const MIN_TICK_INTERVAL_S = 5;
