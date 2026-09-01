// @tns/core
// Discrete-event simulation engine, L2 state, virtual clock, seeded PRNG.
//
// Specification: DATA-MODEL.md §3, TIME-MODEL.md
//
// DETERMINISM RULES APPLY HERE. No async/await, no wall-clock reads,
// no Math.random, no transcendental Math functions. Enforced by lint.
// See CLAUDE.md and TECHNICAL-RESEARCH.md §11.

export const PACKAGE_NAME = "@tns/core";

export * from "./rng.ts";
export * from "./clock.ts";
export * from "./queue.ts";
export * from "./load.ts";
export * from "./disruptions.ts";
