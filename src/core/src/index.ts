// @tns/core
// Discrete-event simulation engine, L2 state, virtual clock, seeded PRNG.
//
// Specification: DATA-MODEL.md §3, TIME-MODEL.md
//
// DETERMINISM RULES APPLY HERE. No async/await, no wall-clock reads,
// no Math.random, no transcendental Math functions. Enforced by lint.
// See CLAUDE.md and TECHNICAL-RESEARCH.md §11.

/** Package identity. Replaced by real exports as the package is built out. */
export const PACKAGE_NAME = "@tns/core";
