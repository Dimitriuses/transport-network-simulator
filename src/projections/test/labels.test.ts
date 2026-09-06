// The two cosmetic settings that gave the bottom of the ladder a choice.
//
// Specification: KNOWN-ISSUES.md #43, CORECONCEPT.md §2.1 A.
//
// Tier 1 is cosmetic-only and the catalogue held exactly two cosmetic settings,
// so its quota of two drew both and every Tier-1 world was the same world —
// "two worlds of a tier are different worlds of comparable difficulty" made
// true by making it vacuous, the same shape as `#32`.
//
// These tests are about the property that lets them fill that gap: **each
// setting must change what is published, and must change nothing a solver
// reads.** A cosmetic setting that moved a score would be worse than no setting
// at all.

import { test } from "node:test";
import assert from "node:assert/strict";

import { publishedRouteLabel, publishedHeadsign } from "../src/defects.ts";

test("each route label says something different", () => {
  const args = ["NO-R12", "12", ["Foundry Gate", "Harbour"] as const] as const;
  const name = publishedRouteLabel("name", ...args);
  const code = publishedRouteLabel("code", ...args);
  const pair = publishedRouteLabel("terminus_pair", ...args);

  assert.equal(name, "12");
  assert.equal(code, "NO-R12");
  assert.equal(pair, "Foundry Gate - Harbour");
  assert.equal(new Set([name, code, pair]).size, 3, "two styles published the same label");
});

test("a circular line falls back rather than naming one end twice", () => {
  // "Ropewalk - Ropewalk" is not a route long name, it is a bug with a hyphen.
  assert.equal(
    publishedRouteLabel("terminus_pair", "NO-R1", "R1", ["Ropewalk", "Ropewalk"]),
    "R1",
  );
  assert.equal(publishedRouteLabel("terminus_pair", "NO-R1", "R1", null), "R1");
});

test("each headsign style says something different", () => {
  const destination = publishedHeadsign("destination", "12", "inbound", "Linden Park");
  const withRoute = publishedHeadsign("route_and_destination", "12", "inbound", "Linden Park");
  const via = publishedHeadsign("via", "12", "inbound", "Linden Park");

  assert.equal(destination, "inbound");
  assert.equal(withRoute, "12 inbound");
  assert.equal(via, "inbound via Linden Park");
});

test("a via with nothing to name is the bare destination", () => {
  // A two-stop pattern has no midpoint, and an operator would not print a
  // dangling "via".
  assert.equal(publishedHeadsign("via", "12", "inbound", null), "inbound");
  assert.equal(publishedHeadsign("via", "12", "inbound", "inbound"), "inbound");
});

// ------------------------------------------- and they must change nothing else

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { projectOperator } from "../src/index.ts";
import type { World } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

/** The same world with one operator's naming group patched. */
function patch(world: World, id: string, values: Record<string, unknown>): World {
  return {
    ...world,
    manifest: {
      ...world.manifest,
      operators: world.manifest.operators.map((o) =>
        o.id === id
          ? {
              ...o,
              manifest: {
                ...(o.manifest as Record<string, unknown>),
                naming: {
                  ...((o.manifest as Record<string, Record<string, unknown>>)["naming"] ?? {}),
                  ...values,
                },
              },
            }
          : o,
      ),
    },
  } as World;
}

test("a cosmetic label changes the label and nothing else", { skip }, () => {
  // **This is the whole claim.** A cosmetic setting must exist so a world looks
  // like the real problem, and must never carry difficulty (`CORECONCEPT.md`
  // §2.1). At the projection boundary that means exactly one field moves: same
  // stops, same identifiers, same times, same stop sequences.
  const world = loadWorld(worldPath);
  const id = world.manifest.operators[0]!.id;

  const plain = projectOperator(world, id, 0).timetable;
  const labelled = projectOperator(
    patch(world, id, { route_label: "code", headsign: "via" }),
    id,
    0,
  ).timetable;

  assert.deepEqual(labelled.stops, plain.stops, "stops moved");
  assert.deepEqual(
    labelled.routes.map((r) => r.route_id),
    plain.routes.map((r) => r.route_id),
    "route identifiers moved",
  );
  assert.deepEqual(
    labelled.trips.map((t) => ({ ...t, heading: null })),
    plain.trips.map((t) => ({ ...t, heading: null })),
    "something other than the headsign moved",
  );

  // And it did change something, or it is not a setting.
  assert.notDeepEqual(
    labelled.routes.map((r) => r.route_name),
    plain.routes.map((r) => r.route_name),
    "route_label changed no label",
  );
  assert.notDeepEqual(
    labelled.trips.map((t) => t.heading),
    plain.trips.map((t) => t.heading),
    "headsign changed no headsign",
  );
});
