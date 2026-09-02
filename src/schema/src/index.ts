// @tns/schema
// Source of truth: Zod definitions generating TypeScript types, JSON Schema and
// OpenAPI documents.
//
// Specification: DATA-MODEL.md §5
//
// One schema source feeds everything downstream — TypeScript types, runtime
// validators, the committed OpenAPI documents under contract/, per-world
// operator documents emitted into world bundles, and the Python models the
// world builder validates against. This is the reason the runtime is
// TypeScript at all (TECHNICAL-RESEARCH.md §11).

export const PACKAGE_NAME = "@tns/schema";

export const CONTRACT_VERSION = "0.3";
export const SCORER_VERSION = "0.1.0";

export * from "./contract/identity.ts";
export * from "./contract/plan.ts";
export * from "./contract/replan.ts";
export * from "./simtime.ts";
export type * from "./world.ts";
export type * from "./runlog.ts";
