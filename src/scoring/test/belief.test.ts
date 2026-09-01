// The instrument must be able to perceive what it measures.
//
// P0M6's ablation reported every catalogue D conflict at exactly zero. Not
// because staleness and silently-dropped cancellations do not matter, but
// because the baseline being measured was handed the world's true disruption
// set and never read a feed at all. These tests exist so that cannot happen
// again silently: each one plants a feed defect and asserts that a naive
// reader's *belief* changes.
//
// This is the fifth time in this project that something was credited with an
// advantage the world does not owe it. See BUILD-LOG.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld, generateDisruptions } from "@tns/core";
import type { World } from "@tns/schema";
import { believedDisruptions, believedDisruptionsAt, NAIVE_POLL_CADENCE_S } from "../src/belief.ts";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

type Bag = Record<string, Record<string, unknown>>;

function withRealtime(world: World, opId: string, key: string, value: unknown): World {
  const operators = world.manifest.operators.map((o) => {
    if (o.id !== opId) return o;
    const m = structuredClone(o.manifest) as Bag;
    m.realtime![key] = value;
    return { ...o, manifest: m };
  });
  return { ...world, manifest: { ...world.manifest, operators } };
}

const NOON = 12 * 3600;

test("a naive reader believes something, or it is measuring nothing", { skip }, () => {
  const world = loadWorld(worldPath);
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);
  const believed = believedDisruptions(world, disruptions, NOON);

  assert.ok(
    believed.length > 0,
    "a reader that believes nothing all morning cannot be misled by anything, " +
      "which makes every realtime conflict unmeasurable by construction",
  );
});

test("belief is not the truth — a lazy reader is wrong about the day", { skip }, () => {
  const world = loadWorld(worldPath);
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);
  const believed = believedDisruptions(world, disruptions, NOON);

  // If these ever coincide, the baseline has been handed the answer again.
  const truth = new Set(disruptions.map((d) => `${d.kind}:${d.delayS}`));
  const held = new Set(believed.map((d) => `${d.kind}:${d.delayS}`));
  const identical = truth.size === held.size && [...truth].every((k) => held.has(k));
  assert.equal(identical, false, "the lazy reader's belief is exactly the truth");
});

test("publishing delays in minutes changes what is believed", { skip }, () => {
  const world = loadWorld(worldPath);
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);

  const seconds = believedDisruptions(withRealtime(world, "ostline", "delay_unit", "seconds"), disruptions, NOON);
  const minutes = believedDisruptions(withRealtime(world, "ostline", "delay_unit", "minutes"), disruptions, NOON);

  const total = (ds: readonly { delayS: number }[]) => ds.reduce((a, d) => a + d.delayS, 0);
  assert.notEqual(
    total(seconds),
    total(minutes),
    "a delay unit conflict that does not change belief cannot cost anybody anything",
  );
});

test("a staler feed is believed later than a fresh one", { skip }, () => {
  const world = loadWorld(worldPath);
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);

  const fresh = believedDisruptions(withRealtime(world, "ostline", "staleness_s", 0), disruptions, NOON);
  const stale = believedDisruptions(withRealtime(world, "ostline", "staleness_s", 3600), disruptions, NOON);

  assert.notDeepEqual(fresh, stale, "an hour of staleness made no difference to belief");
});

test("silently dropped cancellations are not believed", { skip }, () => {
  const world = loadWorld(worldPath);
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);

  const explicit = believedDisruptions(withRealtime(world, "sudbahn", "cancellations", "explicit"), disruptions, NOON);
  const silent = believedDisruptions(withRealtime(world, "sudbahn", "cancellations", "silent_drop"), disruptions, NOON);

  const cancels = (ds: readonly { kind: string }[]) => ds.filter((d) => d.kind === "cancellation").length;
  assert.ok(
    cancels(silent) < cancels(explicit),
    "dropping a trip from the feed instead of marking it cancelled was still noticed",
  );
});

test("a batched sweep agrees with asking one instant at a time", { skip }, () => {
  const world = loadWorld(worldPath);
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);
  const taus = [8 * 3600, NOON, 7 * 3600 + 137, 15 * 3600];

  const batched = believedDisruptionsAt(world, disruptions, taus);
  taus.forEach((t, i) => {
    assert.deepEqual(
      batched[i],
      believedDisruptions(world, disruptions, t),
      `batched belief at ${t} differs from the single-instant answer`,
    );
  });
  // Including out of order, which is the case the probe actually hits.
  assert.equal(NAIVE_POLL_CADENCE_S > 0, true);
});
