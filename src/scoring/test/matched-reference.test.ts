// Gate 3 must divide by a gap it can actually attribute.
//
// P0 is clairvoyant by design (`REFERENCE-POLICY.md` §2 grants it "full L1 +
// perfect realtime"), so it routes around a cancellation announced after it
// planned. No player can. Until P1M0, Gate 3 divided the conflict cost by a
// shortfall containing that advantage — and at the harness's 30-minute planning
// lead the foresight term is over twenty times the conflict term, so conflicts
// were reported at 4 % of a problem most of which nobody could ever have solved.
//
// P0-announced is the same optimum held to the same announcement horizon as the
// baseline it is compared against. These tests assert the properties that make
// it a valid denominator.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { calibrate, cleanWorld } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

test("with no conflicts, a lazy integrator matches an optimum on its own horizon", { skip }, () => {
  const clean = cleanWorld(loadWorld(worldPath));
  const c = calibrate(clean);

  // The load-bearing property. If reconciliation is the only thing separating
  // P2rt from P0a, then removing every conflict must close the gap entirely.
  // A non-zero residual here means the gate is attributing something to
  // conflicts that conflicts did not cause.
  assert.ok(
    Math.abs(c.gapP0aP2rt) < 10,
    `a conflict-free world still costs a lazy integrator ${(c.gapP0aP2rt / 60).toFixed(2)}m ` +
      `against a matched optimum — that residual is not attributable to conflicts`,
  );
});

test("the clairvoyance term is real, large, and excluded from the gate", { skip }, () => {
  const c = calibrate(loadWorld(worldPath));

  assert.ok(c.gapP0P0a > 60, "P0 gains nothing from foresight, which contradicts its definition");
  // The specific trap: it must dominate, or nobody would have been misled.
  assert.ok(
    c.gapP0P0a > c.gapP0aP2rt,
    "foresight no longer dominates; re-check whether Gate 3 still needs a matched reference",
  );
});

test("conflicts cost something once the reference is matched", { skip }, () => {
  const world = loadWorld(worldPath);
  const cost = calibrate(world).gapP0aP2rt - calibrate(cleanWorld(world)).gapP0aP2rt;

  assert.ok(cost > 0, `the declared conflicts cost a lazy integrator ${cost}s, which is not positive`);
});

test("a shorter planning lead gives conflicts more room, not less", { skip }, () => {
  const world = loadWorld(worldPath);
  const at = (planLeadS: number) =>
    calibrate(world, { planLeadS }).gapP0aP2rt - calibrate(cleanWorld(world), { planLeadS }).gapP0aP2rt;

  // A planner that never replans is mostly blind, and a blind planner cannot be
  // punished for reconciling badly. This is the measured form of the argument
  // that `replan` (KNOWN-ISSUES.md #1) is what gives conflicts room to matter,
  // and it should be re-examined if it ever stops holding.
  assert.ok(
    at(300) > at(1800),
    "conflicts no longer cost more at a shorter lead; the replan argument needs re-checking",
  );
});
