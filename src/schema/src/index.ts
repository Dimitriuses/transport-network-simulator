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
//
// M0 defines only the two simplest contract shapes, to establish the pipeline
// end to end. The rest arrive with the milestones that need them.

export const PACKAGE_NAME = "@tns/schema";

export const CONTRACT_VERSION = "0.3";

export * from "./contract/identity.ts";
