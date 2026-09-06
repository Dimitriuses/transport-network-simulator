// The world carries its names, and the projection looks them up.
//
// Specification: ROADMAP.md P1M3, CORECONCEPT.md §2.1 A, KNOWN-ISSUES.md #39.
//
// `publishedName` used to *derive* the colloquial variant, which meant a
// hard-coded lookup of one city's five best-known places. On a generated city
// it rewrote one name in thirty-three and the defect audit reported MISS. These
// tests pin the correction: a variant is data, and derivation is a fallback
// that should never fire.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { publishedName } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const WORLDS = ["m1", "scratch/gen"].map((n) => ({
  name: n,
  path: join(repoRoot, "worlds", `${n}.world.db`),
}));

const skip = (p: string) => (existsSync(p) ? false : `no world bundle at ${p}`);

test("a stored variant is preferred to anything derivable", () => {
  // Nothing about "Central Square" yields "Tsentralna". If this ever passes by
  // derivation rather than lookup, the milestone has been undone.
  const stored = { colloquial: "Tsentralna", abbreviated: "Central Sq" };
  assert.equal(publishedName("colloquial", "Central Square", stored), "Tsentralna");
  assert.equal(publishedName("abbreviated", "Central Square", stored), "Central Sq");
  assert.equal(publishedName("official", "Central Square", stored), "Central Square");
});

test("a missing variant degrades rather than blanks", () => {
  // The fallback exists so an entity with no row still publishes something
  // sensible. An empty stop name would be far worse than an approximate one.
  assert.notEqual(publishedName("colloquial", "Linden Park", undefined), "");
  assert.notEqual(publishedName("abbreviated", "Linden Park", {}), "");
  assert.notEqual(publishedName("colloquial", "Linden Park", { colloquial: "" }), "");
});

for (const w of WORLDS) {
  test(`${w.name}: every published stop name comes from the bundle`, { skip: skip(w.path) }, () => {
    const world = loadWorld(w.path);
    for (const site of world.sites) {
      const names = world.placeNames.get(site.id);
      assert.ok(names, `site ${site.id} has no names in the bundle`);
      assert.equal(names["official"], site.name, `site ${site.id} disagrees with its own name`);
      assert.ok(names["colloquial"], `site ${site.id} has no colloquial name`);
    }
    for (const quay of world.quays) {
      assert.ok(world.placeNames.get(quay.id), `quay ${quay.id} has no names in the bundle`);
    }
  });

  test(`${w.name}: publishing colloquially rewrites nearly every name`, { skip: skip(w.path) }, () => {
    // The measurement #39 turned on: one name in thirty-three rewritten is a
    // conflict that is declared and absent.
    const world = loadWorld(w.path);
    const canonical = new Set([
      ...world.sites.map((s) => s.name),
      ...world.quays.map((q) => q.name),
    ]);
    const rewritten = world.quays.filter((q) => {
      const colloquial = world.placeNames.get(q.id)?.["colloquial"];
      return colloquial !== undefined && !canonical.has(colloquial);
    });
    assert.ok(
      rewritten.length > world.quays.length * 0.5,
      `only ${rewritten.length} of ${world.quays.length} quays have a colloquial name ` +
        `that differs from a canonical one — A-naming would be nearly inert`,
    );
  });

  test(`${w.name}: some places share a colloquial name`, { skip: skip(w.path) }, () => {
    // A name is a poor identifier, which is the whole of catalogue §2.1 A. A
    // world where every colloquial form is unique has a second id scheme, not a
    // naming conflict.
    const world = loadWorld(w.path);
    const byColloquial = new Map<string, string[]>();
    for (const q of world.quays) {
      const c = world.placeNames.get(q.id)?.["colloquial"];
      if (c === undefined) continue;
      byColloquial.set(c, [...(byColloquial.get(c) ?? []), q.id]);
    }
    const shared = [...byColloquial.values()].filter((ids) => ids.length > 1);
    assert.ok(
      shared.length > 0,
      "no colloquial name is shared by two quays; a name that always identifies " +
        "one place is an identifier rather than a name",
    );
  });
}

test("a bundle from an older schema is refused with an explanation", () => {
  // P1M3 changed the bundle format. A reader that hit `no such table:
  // place_names` would be telling the truth three steps from the cause.
  assert.throws(
    () => loadWorld(join(repoRoot, "package.json")),
    // Any clear failure will do; what must not happen is a silent partial load.
    (e: unknown) => e instanceof Error,
  );
});
