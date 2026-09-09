// "Clean plus one conflict" must mean clean plus one conflict.
//
// `npm run fallback` and `npm run gates`' attribution both build one world per
// declared conflict, each with that conflict alone switched on over a clean
// base, and read the difference as what the conflict costs. The whole reading
// depends on the base being clean and on the variant differing from it by one
// thing.
//
// At P1M8 neither held. `baselines.ts` kept its own hand-written copy of the
// catalogue, twelve entries against the catalogue's sixteen, and switching off
// a conflict it did not know about was written `?? out` — keep the world as it
// is. So every "clean" world still carried the DST offset on three operators
// and a private cancellation token on three more, and every variant carried
// them too. Seventeen unrelated conflicts came back on one figure to two
// decimal places, and a **cosmetic** setting appeared to cost nine minutes
// (`KNOWN-ISSUES.md` #55).
//
// Nothing caught it because every committed bundle predates the four settings,
// so a test that reads one would have passed. These tests are driven from
// `CATALOGUE` instead: a setting added tomorrow is covered the moment it is
// added, which is the only property that would have made the difference.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { CATALOGUE, type World } from "@tns/schema";
import {
  withNoConflicts,
  conflictVariants,
  declaredConflicts,
  valueCleanWorld,
  STRUCTURAL_CONFLICTS,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

type Bag = Record<string, Record<string, unknown>>;

/**
 * A manifest carrying every catalogue setting, honest unless `on` says
 * otherwise.
 *
 * Written out in full rather than patched onto the bundle's own manifest,
 * because the bundle's manifest is exactly what cannot be trusted to be
 * complete: `m1` was built before four of these settings existed.
 */
function manifestWith(on: Record<string, unknown>): Bag {
  const bag: Bag = {};
  for (const s of CATALOGUE) {
    bag[s.group] ??= {};
    bag[s.group]![s.key] = s.conflict in on ? on[s.conflict] : s.off;
  }
  return bag;
}

/** The bundle's world with synthetic manifests, and conflicts to match. */
function worldWith(world: World, bags: readonly Bag[]): World {
  const operators = world.manifest.operators.map((o, i) => ({
    ...o,
    manifest: { ...(o.manifest as object), ...(bags[i] ?? manifestWith({})) },
  }));
  const next = { ...world, manifest: { ...world.manifest, operators } } as World;
  return {
    ...next,
    manifest: { ...next.manifest, activeConflicts: declaredConflicts(next) },
  } as World;
}

/** The first value a generator would draw — a real setting, not an invented one. */
const dirtyValue = (conflict: string): unknown =>
  CATALOGUE.find((s) => s.conflict === conflict)!.generate[0];

test("every catalogue setting can be switched off, not just the ones we remembered", { skip }, () => {
  const world = loadWorld(worldPath);

  for (const setting of CATALOGUE) {
    const dirty = worldWith(world, [manifestWith({ [setting.conflict]: dirtyValue(setting.conflict) })]);
    assert.ok(
      dirty.manifest.activeConflicts.some((c) => c.startsWith(`${setting.conflict}:`)),
      `${setting.conflict} did not become a declared conflict at its own generate[0] — ` +
        `the test cannot demonstrate anything about switching it off`,
    );

    const clean = withNoConflicts(dirty);
    const left = declaredConflicts(clean).filter(
      (c) => !STRUCTURAL_CONFLICTS.has(c.split(":")[0] ?? ""),
    );

    if (setting.structural ?? STRUCTURAL_CONFLICTS.has(setting.conflict)) {
      // Held deliberately: switching granularity off changes how many stops
      // exist, which varies the opportunity set and the difficulty together
      // (`KNOWN-ISSUES.md` #14).
      assert.deepEqual(left, [], `${setting.conflict} is structural; nothing else should survive`);
      continue;
    }

    assert.deepEqual(
      left,
      [],
      `withNoConflicts left ${setting.conflict} switched on. A base that still carries a ` +
        `conflict makes every measurement against it a comparison between two things that ` +
        `differ by something nobody named (KNOWN-ISSUES.md #55).`,
    );
  }
});

test("a conflict with no switch is an error, not a shrug", { skip }, () => {
  const world = loadWorld(worldPath);
  const dirty = worldWith(world, [manifestWith({ "D-staleness": 900 })]);
  const invented = {
    ...dirty,
    manifest: {
      ...dirty.manifest,
      activeConflicts: [...dirty.manifest.activeConflicts, "E-something-nobody-implemented:x"],
    },
  } as World;

  assert.throws(
    () => withNoConflicts(invented),
    /E-something-nobody-implemented/,
    "swallowing an unswitchable conflict is the defect itself",
  );
});

test("each variant differs from the clean base by exactly the conflict it names", { skip }, () => {
  const world = loadWorld(worldPath);
  // Two dirty operators, so a variant naming one has a chance to leak the
  // other — which is the shape the real worlds have and the shape #55 hid in.
  const dirty = worldWith(world, [
    manifestWith({
      "B-dst-offset": 3600,
      "C-cancellation-token": "C",
      "D-staleness": 900,
      "A-route-label": "code",
    }),
    manifestWith({
      "C-coordinate-offset": 130,
      "B-time-encoding": "epoch_s",
      "A-granularity": "site",
    }),
  ]);

  const base = declaredConflicts(withNoConflicts(dirty));
  assert.deepEqual(
    base.filter((c) => !STRUCTURAL_CONFLICTS.has(c.split(":")[0] ?? "")),
    [],
    "the base of every attributed comparison must be clean",
  );

  const variants = conflictVariants(dirty);
  const attributable = dirty.manifest.activeConflicts.filter(
    (c) => !STRUCTURAL_CONFLICTS.has(c.split(":")[0] ?? ""),
  );
  assert.deepEqual(
    variants.map((v) => v.conflict).sort(),
    // The structural conflict is present in every variant and attributed to
    // none, so it gets no row of its own.
    attributable.slice().sort(),
    "every attributable conflict owes a row, and nothing else may have one",
  );

  for (const { conflict, world: only } of variants) {
    const extra = declaredConflicts(only).filter((c) => !base.includes(c));
    assert.deepEqual(
      extra,
      [conflict],
      `the world for ${conflict} carries ${JSON.stringify(extra)}. Whatever it measures is ` +
        `not the cost of ${conflict} (KNOWN-ISSUES.md #55).`,
    );
  }
});

test("the bundle's declared conflicts are the ones its manifests actually hold", { skip }, () => {
  // Two things that must agree, in different places: `_declared_conflicts` in
  // `tools/worldbuild/build.py` writes the list, and this reads it back off the
  // manifests it was written from. Until now they were compared by nothing.
  const world = loadWorld(worldPath);
  assert.deepEqual(
    declaredConflicts(world),
    [...world.manifest.activeConflicts].sort(),
    "the bundle declares a different set of conflicts than its operator manifests carry",
  );
});

test("the two ways of writing 'conflicts off' agree", { skip }, () => {
  // `withNoConflicts` switches off what the manifest *declares*;
  // `valueCleanWorld` switches off every catalogue setting on every operator.
  // The ablation uses the first and `npm run gates`' honest-values run uses the
  // second, and Gate 3 subtracts one from the other. They were two independent
  // readings of one idea, and one of them was derived from the catalogue while
  // the other was not — which is how they came to disagree by four conflicts
  // (`KNOWN-ISSUES.md` #55).
  const world = loadWorld(worldPath);
  const dirty = worldWith(world, [
    manifestWith({ "B-dst-offset": 3600, "D-staleness": 900, "A-headsign": "via" }),
    manifestWith({ "C-cancellation-token": "C", "A-granularity": "site" }),
  ]);

  assert.deepEqual(
    declaredConflicts(withNoConflicts(dirty)),
    declaredConflicts(valueCleanWorld(dirty)),
    "the ablation's floor and the gate's honest-values world must be the same world",
  );
});
