// @tns/scoring
// Run log to scorecard.
//
// Specification: SCORING.md.
//
// Scoring never happens live. It is a pure function of the run log, so a score
// can be recomputed and audited long after the run, and the scorer can be
// fixed independently of the engine (SCORING.md §1).

export const PACKAGE_NAME = "@tns/scoring";

export * from "./baselines.ts";
export * from "./information.ts";
export * from "./scorecard.ts";
export * from "./information-set.ts";
export * from "./belief.ts";
export * from "./probe.ts";
export * from "./render.ts";
export * from "./scorecard.ts";
export * from "./information-set.ts";
export * from "./belief.ts";
export * from "./probe.ts";

