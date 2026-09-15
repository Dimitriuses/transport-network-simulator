// An operator's documentation must be true about that operator.
//
// Specification: DATA-MODEL.md §5, CORECONCEPT.md §2.1 F.
//
// P1M1 serves accurate documentation only. Phase 3 makes it wrong on purpose,
// and when it does these tests become the definition of what "wrong" is a
// departure *from* — so they assert the correspondence rather than the text.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateDisruptions, loadWorld } from "@tns/core";
import { operatorDocs, operatorNotes, projectOperator, projectRealtime } from "../src/index.ts";
import type { World } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const skip = (p: string) => (existsSync(p) ? false : `no world bundle at ${p}`);

const WORLDS = ["m1", "gen-t2", "gen-t3", "gen-t5"].map((n) => ({
  name: n,
  path: join(repoRoot, "worlds", `${n}.world.db`),
}));

const text = (world: World, id: string): string =>
  operatorNotes(world, id)
    .map((n) => n.text)
    .join("\n");

for (const w of WORLDS) {
  test(`${w.name}: documentation describes the format each operator actually uses`, { skip: skip(w.path) }, () => {
    const world = loadWorld(w.path);
    for (const op of world.manifest.operators) {
      const m = op.manifest as Record<string, Record<string, string | number | boolean>>;
      const doc = text(world, op.id);
      const stops = projectOperator(world, op.id, 0).timetable.stops;

      // Identifier scheme: the claim and the data must agree.
      const bare = stops.every((s) => /^\d+$/.test(s.stop_id));
      assert.equal(
        doc.includes("decimal integer"),
        bare,
        `${op.id} documents its ids as ${doc.includes("decimal integer") ? "integers" : "prefixed"} ` +
          `and publishes the opposite`,
      );

      // Granularity.
      assert.equal(
        doc.includes("identifies a station as a whole"),
        m["identity"]!["granularity"] === "site",
        `${op.id} documents the wrong granularity`,
      );

      // Coordinate source — documented, unlike offset and precision.
      assert.equal(
        doc.includes("centre of the station"),
        m["geometry"]!["source"] === "site",
        `${op.id} documents the wrong coordinate source`,
      );

      // Delay unit, and whether there is a delay at all.
      if (m["realtime"]!["publishes_delays"] === false) {
        assert.ok(doc.includes("does not report how"), `${op.id} hides that it publishes no delays`);
      } else {
        assert.ok(
          doc.includes(m["realtime"]!["delay_unit"] === "minutes" ? "**minutes**" : "**seconds**"),
          `${op.id} documents the wrong delay unit`,
        );
      }
    }
  });

  test(`${w.name}: documentation claims nothing about accuracy or another operator`, { skip: skip(w.path) }, () => {
    const world = loadWorld(w.path);
    const others = world.manifest.operators.map((o) => o.name);
    for (const op of world.manifest.operators) {
      const doc = text(world, op.id);
      // The line from `docs.ts`: format and units, never accuracy, freshness or
      // completeness. A world whose documentation gave away a section-D
      // conflict would be measuring reading rather than integration.
      // "UTC offset" is a format statement and legitimate; a *coordinate*
      // offset would not be. The list below is quality vocabulary only.
      //
      // It forbade the word "cancel" until P2M7, which was a proxy for "says
      // something about whether cancellations are reported" and blocked the
      // status vocabulary an operator does document (`C-cancellation-token`).
      // The claims it was standing in for are named instead.
      for (const forbidden of [
        "metre",
        "stale",
        "lag",
        "dropped",
        "omitted",
        "not always",
        "may not",
        "accurate",
        "accuracy",
        "approximate",
        "up to date",
        "may be wrong",
      ]) {
        assert.ok(
          !doc.toLowerCase().includes(forbidden),
          `${op.id}'s documentation mentions "${forbidden}", which is a quality claim`,
        );
      }
      for (const name of others) {
        if (name === world.manifest.operators.find((o) => o.id === op.id)!.name) continue;
        assert.ok(!doc.includes(name), `${op.id}'s documentation names ${name}`);
      }
    }
  });
}

test("the OpenAPI document is served for every operator and is well-formed", { skip: skip(WORLDS[0]!.path) }, () => {
  const world = loadWorld(WORLDS[0]!.path);
  for (const op of world.manifest.operators) {
    const doc = operatorDocs(world, op.id) as Record<string, Record<string, unknown>>;
    assert.equal(doc["openapi"], "3.1.0");
    assert.ok(String(doc["info"]!["title"]).includes(op.name));
    assert.ok(doc["paths"]!["/timetable"], "no /timetable documented");
    assert.ok(doc["paths"]!["/realtime"], "no /realtime documented");
  }
});

test("an unknown operator is an error, not an empty document", () => {
  const world = loadWorld(WORLDS[0]!.path);
  assert.throws(() => operatorDocs(world, "no-such-operator"), /no such operator/);
});

// ---------------------------------------------------------------------------
// The schema against the bytes (`KNOWN-ISSUES.md` #73).
//
// The notes above were checked against the manifest from P1M1; the schema never
// was, and for the whole of Phase 1 it documented a `departures` array nobody
// served while leaving out every trip. So: every key path a real response
// carries must be documented, with its JSON type, and every documented path
// must be served unless the schema marks it optional.

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  required?: string[];
  enum?: string[];
};

const jsonType = (v: unknown): string =>
  Array.isArray(v) ? "array" : v === null ? "null" : Number.isInteger(v) ? "integer" : typeof v;

/** Every mismatch between a body and its documented schema, as readable lines. */
export function schemaMismatches(schema: Schema, body: unknown, path = "$"): string[] {
  const out: string[] = [];
  const actual = jsonType(body);
  const expected = schema.type;
  if (expected && !(expected === actual || (expected === "number" && actual === "integer"))) {
    out.push(`${path}: documented ${expected}, served ${actual}`);
    return out;
  }
  if (schema.enum && typeof body === "string" && !schema.enum.includes(body)) {
    out.push(`${path}: served "${body}", documented values ${JSON.stringify(schema.enum)}`);
  }
  if (actual === "array" && schema.items) {
    for (const item of body as unknown[]) {
      const inner = schemaMismatches(schema.items, item, `${path}[]`);
      for (const line of inner) if (!out.includes(line)) out.push(line);
    }
  }
  if (actual === "object" && schema.properties) {
    const obj = body as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const sub = schema.properties[key];
      if (!sub) out.push(`${path}.${key}: served and not documented`);
      else out.push(...schemaMismatches(sub, obj[key], `${path}.${key}`));
    }
    for (const key of schema.required ?? []) {
      if (!(key in obj)) out.push(`${path}.${key}: documented as required and not served`);
    }
  }
  return out;
}

const responseSchema = (doc: Record<string, unknown>, endpoint: string): Schema =>
  (doc["paths"] as Record<string, any>)[endpoint].get.responses["200"].content["application/json"].schema;

for (const w of WORLDS) {
  test(`${w.name}: every response matches its operator's documented schema, all day`, { skip: skip(w.path) }, () => {
    const world = loadWorld(w.path);
    const day = generateDisruptions(world.journeys, world.manifest.seed);
    const departures = world.queries.map((q) => q.departAfterS);
    const first = Math.min(...departures) - 1800;
    const last = Math.max(...departures) + 3600;
    // Every hour of the scored day, so delayed and cancelled rows are among them.
    const instants = Array.from({ length: Math.ceil((last - first) / 3600) + 1 }, (_, i) => first + i * 3600);
    const statuses = new Set<string>();

    for (const op of world.manifest.operators) {
      const doc = operatorDocs(world, op.id);
      const m = op.manifest as { realtime: Parameters<typeof projectRealtime>[3] };
      const problems = new Set<string>();
      for (const tau of instants) {
        const timetable = projectOperator(world, op.id, tau).timetable;
        const realtime = projectRealtime(world, op.id, day, m.realtime, tau);
        for (const line of schemaMismatches(responseSchema(doc, "/timetable"), timetable, "/timetable")) problems.add(line);
        for (const line of schemaMismatches(responseSchema(doc, "/realtime"), realtime, "/realtime")) problems.add(line);
        for (const u of realtime.updates) statuses.add(u.status);
      }
      assert.deepEqual([...problems], [], `${op.id}: its documentation does not describe what it serves`);
    }
    // Not vacuous: the day must have produced something other than on time.
    assert.ok(statuses.size > 1, `only ${[...statuses].join()} was ever served, so the status vocabulary was never exercised`);
  });
}

test("the schema comparison rejects a schema that does not describe the body", { skip: skip(WORLDS[0]!.path) }, () => {
  const world = loadWorld(WORLDS[0]!.path);
  const op = world.manifest.operators[0]!;
  const body = projectOperator(world, op.id, 30000).timetable;
  const doc = operatorDocs(world, op.id);
  const schema = responseSchema(doc, "/timetable");
  assert.deepEqual(schemaMismatches(schema, body), []);

  // The pre-P2M7 shape: a phantom array, and no trips.
  const old: Schema = {
    type: "object",
    required: ["departures"],
    properties: { stops: schema.properties!["stops"]!, departures: { type: "array" } },
  };
  const found = schemaMismatches(old, body);
  assert.ok(found.some((l) => l.includes("trips: served and not documented")), found.join("\n"));
  assert.ok(found.some((l) => l.includes("departures: documented as required and not served")), found.join("\n"));

  // A wrong type, and a status word the documentation does not list.
  assert.ok(schemaMismatches({ type: "integer" }, "08:00").length === 1);
  assert.ok(schemaMismatches({ type: "string", enum: ["on_time"] }, "CANCELLED").length === 1);
});
