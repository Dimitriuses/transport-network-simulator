// @tns/router
// RAPTOR journey planning; serves the P0 oracle and the P1 reference policy.
//
// Specification: REFERENCE-POLICY.md §6
//
// DETERMINISM RULES APPLY HERE. No async/await, no wall-clock reads,
// no Math.random, no transcendental Math functions. Enforced by lint.
// See CLAUDE.md and TECHNICAL-RESEARCH.md §11.

/** Package identity. Replaced by real exports as the package is built out. */
export const PACKAGE_NAME = "@tns/router";
