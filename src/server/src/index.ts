// @tns/server
// Operator API servers, control API, and obligation issuing.
//
// Specification: PLAYER-CONTRACT.md
//
// The boundary. Async, wall clock and I/O are all fine here; the determinism
// rules bind src/core and src/router. What must never happen is any of that
// reaching the model.

export const PACKAGE_NAME = "@tns/server";

export * from "./apis.ts";
export * from "./harness.ts";
