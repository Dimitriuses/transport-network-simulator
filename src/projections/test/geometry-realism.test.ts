// Realism is a property of the combination, not of each setting.
//
// Specification: CORECONCEPT.md §2.1, ROADMAP.md P1M1.
//
// `src/scoring/test/realism.test.ts` holds each setting to its own ceiling, and
// that was believed sufficient until P1M1 generated a world where it was not:
// one operator drew a lat/lon swap, a 130 m offset and 3 dp truncation, every
// one of them inside its ceiling, and published stops 2,200 km from their
// quays. Three declared geometry conflicts, one of them observable.
//
// Two defences, and these tests cover both:
//
//   * the catalogue's `excludes` relation, so a conflict that destroys geometry
//     is never generated beside one that merely nudges it;
//   * the composed measurement, so a combination nobody anticipated is still
//     caught by the consequence it produces.
//
// The second is what makes this safe against a generator, which will reach
// combinations nobody thought about — the risk ROADMAP.md names explicitly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { CATALOGUE } from "@tns/schema";
import { displacements } from "../src/index.ts";
import type { World } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

const HONEST = { precision: 6, source: "quay", offset_m: 0, latlon_order: "lat_lon" } as const;

const CEILING = Number(
  CATALOGUE.find((s) => s.conflict === "C-coordinate-offset")?.plausible?.max ?? 150,
);

const median = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

/** The same world with one operator's geometry patched. */
function patched(world: World, id: string, patch: Record<string, unknown>): World {
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
                geometry: {
                  ...((o.manifest as Record<string, Record<string, unknown>>)["geometry"] ?? {}),
                  ...patch,
                },
              },
            }
          : o,
      ),
    },
  } as World;
}

test("no operator's composed geometry leaves the plausible band", { skip }, () => {
  const world = loadWorld(worldPath);
  for (const op of world.manifest.operators) {
    const ds = displacements(world, op.id, 0, HONEST);
    assert.ok(
      median(ds) <= CEILING,
      `${op.id} publishes stops a median ${median(ds).toFixed(0)} m from their quays. ` +
        `Each setting may be inside its own ceiling and the total still describe a ` +
        `broken map rather than two operators disagreeing.`,
    );
  }
});

test("the composed measurement catches a swap no single ceiling would", { skip }, () => {
  // The failure that motivated all of this. `C-latlon-order` has no numeric
  // ceiling — a swap either happens or it does not — so nothing about the
  // setting is out of bounds. The consequence is 2,200 km.
  const world = loadWorld(worldPath);
  const victim = world.manifest.operators[0]!.id;
  const broken = patched(world, victim, { latlon_order: "lon_lat", offset_m: 130 });
  const ds = displacements(broken, victim, 0, HONEST);
  assert.ok(
    median(ds) > CEILING,
    "a lat/lon swap composed with an offset passed the composed realism check",
  );
});

test("a geometry-destroying conflict declares what it masks", () => {
  const swap = CATALOGUE.find((s) => s.conflict === "C-latlon-order");
  assert.ok(swap, "C-latlon-order is missing from the catalogue");
  assert.ok(
    (swap.excludes ?? []).includes("C-coordinate-offset"),
    "C-latlon-order may be generated beside C-coordinate-offset, which it makes " +
      "unmeasurable. A conflict that masks another teaches one lesson instead of two.",
  );
});

test("every exclusion names a conflict that exists", () => {
  const known = new Set(CATALOGUE.map((s) => s.conflict));
  for (const s of CATALOGUE) {
    for (const other of s.excludes ?? []) {
      assert.ok(known.has(other), `${s.conflict} excludes unknown conflict ${other}`);
      assert.notEqual(other, s.conflict, `${s.conflict} excludes itself`);
    }
  }
});
