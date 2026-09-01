// The defect library and the audit gate.
//
// Specification: CORECONCEPT.md §2.1, DATA-MODEL.md §4 and §7.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { auditWorld, projectOperator, publishedName, publishedCoords } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

test("a systematic offset defeats a threshold that truncation would not", () => {
  // The distinction the defect library rests on. Truncation is noise a
  // generous threshold absorbs; an offset moves every stop the same way, so
  // widening the threshold recovers nothing and only adds wrong pairs.
  const truncated = publishedCoords(3, "lat_lon", 0, 50.4506, 30.5076);
  const offset = publishedCoords(6, "lat_lon", 130, 50.4506, 30.5076);

  const driftM = (lat: number): number => Math.abs(lat - 50.4506) * 111_320;
  assert.ok(driftM(truncated.lat) < 60, "truncation moved a stop further than expected");
  assert.ok(driftM(offset.lat) > 100, "the offset did not displace the stop");
});

test("abbreviation collapses two quays onto one published name", () => {
  // Not cosmetic: the operator stops distinguishing stands, so a player using
  // names as identifiers fuses two physically different boarding points.
  const a = publishedName("abbreviated", "Central Square, stand A");
  const b = publishedName("abbreviated", "Central Square, stand B");
  assert.equal(a, b);
  assert.equal(a, "Central Sq");
});

test("the same place gets a different identity from each operator", { skip }, () => {
  const world = loadWorld(worldPath);

  const identities = world.manifest.operators
    .map((op) => {
      const { timetable, resolution } = projectOperator(world, op.id, 0);
      const stopId = [...resolution.stopToQuays.entries()].find(([, quays]) =>
        quays.some((q) => world.quays.find((w) => w.id === q)?.siteId === "site-central"),
      )?.[0];
      const stop = timetable.stops.find((s) => s.stop_id === stopId);
      return stop ? { operator: op.id, id: stop.stop_id, name: stop.stop_name } : null;
    })
    .filter((x): x is { operator: string; id: string; name: string } => x !== null);

  assert.equal(identities.length, 3, "not all three operators serve Central Square");
  assert.equal(
    new Set(identities.map((i) => i.name)).size,
    3,
    `all three publish the same name: ${identities.map((i) => i.name).join(", ")}`,
  );
});

test("declared conflicts are all actually present", { skip }, () => {
  const report = auditWorld(loadWorld(worldPath));

  // The gate that catches a world silently easier than it claims. It found a
  // real one on its first run: Sudbahn declared Site granularity while having
  // only one quay per Site, so publishing at Site level changed nothing.
  assert.deepEqual(report.missing, [], "conflicts declared but absent from the projections");
  assert.ok(report.ok);
  assert.ok(report.declared.length >= 10, `only ${report.declared.length} conflicts declared`);
});
