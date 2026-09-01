// @tns/router
// RAPTOR journey planning; serves the P0 oracle and the P1 reference policy.
//
// Specification: REFERENCE-POLICY.md §6.
//
// DETERMINISM RULES APPLY HERE. No async/await, no wall-clock reads,
// no Math.random, no transcendental Math functions. Enforced by lint.
// See CLAUDE.md and TECHNICAL-RESEARCH.md §11.
//
// P0, P1 and P2 are the *same* router with different inputs. Since the oracle
// was already required, the reference policy costs an edge filter and a time
// source, not an implementation:
//
//   P0  full canonical graph   truth at τ           all connectivity
//   P1  full canonical graph   published schedules  obvious interchanges only
//   P2  player-side merge      whatever it matched  coordinate threshold
//
// The difference between P0's transfer set and P1's is where the player's value
// comes from: the connections nobody has declared, discoverable only by joining
// the operators' data (REFERENCE-POLICY.md §4.1).

export const PACKAGE_NAME = "@tns/router";

export * from "./raptor.ts";
export * from "./execute.ts";
