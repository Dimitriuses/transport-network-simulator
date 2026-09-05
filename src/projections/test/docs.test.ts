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

import { loadWorld } from "@tns/core";
import { operatorDocs, operatorNotes, projectOperator } from "../src/index.ts";
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
      for (const forbidden of [
        "metre",
        "stale",
        "lag",
        "cancel",
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
