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
import { calibrate, cleanWorld, naiveMergedWorld } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

test("switching every conflict off does not produce an easier world", { skip }, () => {
  // Written at P1M0 asserting the opposite — that a conflict-free world costs a
  // lazy integrator nothing — and it passed. It was measuring an artefact.
  //
  // P0M7 disproved it. The naive baseline matches stops by coordinate
  // proximity within 120 m, and this city has 19 pairs of genuinely distinct
  // quays closer together than that, the nearest 31 m apart. When every
  // operator publishes exact coordinates, the matcher fuses them: 34 canonical
  // quays collapse to 19 stops. The declared conflicts — offsets, truncation —
  // push stops apart and *prevent* that over-merging, leaving 26.
  //
  // So "the same world with every conflict switched off" is not a floor. It is
  // a different and harder world, and subtracting it attributes a negative cost
  // to the conflicts. See KNOWN-ISSUES.md #14.
  const world = loadWorld(worldPath);
  const declared = naiveMergedWorld(world).quays.length;
  const clean = naiveMergedWorld(cleanWorld(world)).quays.length;

  assert.ok(
    clean < declared,
    `the conflict-free world merged to ${clean} stops and the declared one to ${declared}. ` +
      `If that ordering has reversed, the over-merging described in KNOWN-ISSUES.md #14 is ` +
      `fixed and ablation-by-subtraction may be sound again — re-check Gate 3.`,
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

test("P0a never beats the clairvoyant oracle", { skip }, () => {
  // The invariant P0a genuinely has. It plans with a subset of what P0 knows,
  // so it can never arrive sooner. If this fires, information is leaking into
  // the announcement-limited reference.
  const c = calibrate(loadWorld(worldPath));
  for (const g of c.perQuery) {
    if (g.p0a === null || g.p0 === null) continue;
    assert.ok(
      g.p0a >= g.p0 - 1,
      `${g.queryId}: P0a reached the destination in ${(g.p0a / 60).toFixed(2)}m, sooner than ` +
        `the clairvoyant oracle's ${(g.p0 / 60).toFixed(2)}m.`,
    );
  }
});

test("P0a is a strategy, not an optimum — and the difference is measurable", { skip }, () => {
  // The invariant that survives, and the one that matters: P0a has strictly
  // better information and a strictly better model than P2rt, so it must never
  // lose. When it did — P2rt failing, being handed P1's whole-journey outcome
  // and beating the reference it was measured against — that was a defect in
  // P0a's construction, not a fact about the world (fixed at P0M7 by having a
  // stranded baseline resume from where it stands, and by recognising that P1
  // is itself an achievable announcement-limited strategy).
  // P0a plans once on what had been announced and replans only when its plan
  // *breaks*. That is a well-informed strategy, and a strategy is not an
  // optimum: on q15 it detours around an announced delay that turns out not to
  // matter, and a lazy integrator that ignored the announcement arrives sooner.
  //
  // This test records the gap between what Gate 3's denominator is called and
  // what it is. It is not a bug in P0a's code; it is a limit on what can be
  // claimed from it, and it is why conflict attribution is unsound today
  // (KNOWN-ISSUES.md #15). Delete this test when P0a becomes a real bound.
  const c = calibrate(loadWorld(worldPath));
  const beaten = c.perQuery.filter(
    (g) => g.p0a !== null && g.p2rt !== null && g.p2rt < g.p0a - 1,
  );
  assert.ok(
    beaten.length > 0,
    "no lazy integrator now beats P0a — P0a may have become a genuine bound, in which " +
      "case KNOWN-ISSUES.md #15 can be closed and Gate 3 re-derived.",
  );
});

test("a shorter planning lead leaves a lazy integrator further behind", { skip }, () => {
  const world = loadWorld(worldPath);
  const at = (planLeadS: number) => calibrate(world, { planLeadS }).gapP0aP2rt;

  // Stated on the declared world alone, because subtracting the conflict-free
  // world is not sound (KNOWN-ISSUES.md #14). The direction is what matters and
  // it is the measured form of why `replan` had to come first: reconciliation
  // only costs you once you have something to reconcile.
  assert.ok(
    at(300) > at(1800),
    "a lazy integrator no longer falls further behind at a shorter lead; re-check the replan argument",
  );
});
