// The committed contract must be a document someone else's tooling can read.
//
// Specification: PLAYER-CONTRACT.md §5, §6; contract/README.md.
//
// `contract:check` compares the committed files with the generator's output, so
// it can only say the files are what the generator makes — never that what it
// makes is valid. From P0M0 until P2M7 every component was a `$ref` to a `$defs`
// the document root did not have, and later, briefly, a `$ref` to itself; both
// passed every check there was (`KNOWN-ISSUES.md` #74). These resolve every
// reference the way a client generator would, from the document root.

import { test } from "node:test";
import assert from "node:assert/strict";
import { Brief, Clock, PlanRequest, controlApiDocument, playerApiDocument } from "../src/index.ts";

function resolvePointer(doc: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), doc);
}

/** Every `$ref` in a document, with where it points and what it resolves to. */
function problems(doc: Record<string, unknown>): string[] {
  const out: string[] = [];
  const walk = (node: unknown, at: string) => {
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${at}[${i}]`));
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (typeof obj["$ref"] === "string") {
      const ref = obj["$ref"];
      const target = resolvePointer(doc, ref);
      if (target === undefined) out.push(`${at}: ${ref} resolves to nothing`);
      else if (target === obj) out.push(`${at}: ${ref} refers to itself`);
      else if (typeof (target as Record<string, unknown>)["$ref"] === "string" && Object.keys(target as object).length === 1) {
        out.push(`${at}: ${ref} resolves only to another reference`);
      }
    }
    if ("$defs" in obj) out.push(`${at}: carries $defs, which OpenAPI tooling does not look inside`);
    for (const [k, v] of Object.entries(obj)) walk(v, `${at}.${k}`);
  };
  walk(doc, "#");
  return out;
}

test("every reference in both contract documents resolves to a schema", () => {
  for (const [name, doc] of [
    ["player", playerApiDocument()],
    ["control", controlApiDocument()],
  ] as const) {
    assert.deepEqual(problems(doc), [], `${name}-api has references a client could not follow`);
  }
});

test("the reference check rejects the shapes the contract has actually shipped", () => {
  // As committed from P0M0: a pointer to a `$defs` the root does not have.
  assert.ok(problems({ components: { schemas: { Identity: { $ref: "#/$defs/Identity", $defs: {} } } } }).length > 0);
  // As generated for an hour at P2M7: a component that is only itself.
  const selfRef = problems({ components: { schemas: { PlanRequest: { $ref: "#/components/schemas/PlanRequest" } } } });
  assert.ok(selfRef.some((p) => p.includes("refers to itself") || p.includes("only to another reference")), selfRef.join());
});

test("a component is the schema it names, field for field", () => {
  const schemas = (playerApiDocument()["components"] as { schemas: Record<string, { properties?: object }> }).schemas;
  const control = (controlApiDocument()["components"] as { schemas: Record<string, { properties?: object }> }).schemas;
  assert.deepEqual(Object.keys(schemas["PlanRequest"]!.properties ?? {}), Object.keys(PlanRequest.shape));
  assert.deepEqual(Object.keys(control["Brief"]!.properties ?? {}), Object.keys(Brief.shape));
  assert.deepEqual(Object.keys(control["Clock"]!.properties ?? {}), Object.keys(Clock.shape));
});
