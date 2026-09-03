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
import { projectOperator } from "@tns/projections";
import type { World } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

test("the lazy baseline reconstructs a conflict-free world exactly", { skip }, () => {
  // The property that makes attribution by subtraction sound, and it did not
  // hold until P0M8.
  //
  // The matcher used to fuse stops within a fixed 120 m. This city has 19 pairs
  // of genuinely distinct quays closer than that — the nearest 31 m apart — so
  // it collapsed 34 canonical quays into 19 stops *before any conflict was
  // applied*, and a conflict-free world came out harder than the declared one.
  // The threshold is now derived from the world's own geometry instead.
  const world = loadWorld(worldPath);
  const merged = naiveMergedWorld(cleanWorld(world)).quays.length;

  assert.equal(
    merged,
    world.quays.length,
    `with every conflict off the matcher produced ${merged} stops for ` +
      `${world.quays.length} canonical quays. It must reconstruct the world exactly, or ` +
      `whatever it loses to its own crudeness is charged to the conflicts (KNOWN-ISSUES.md #14).`,
  );
});

test("a conflict-free world is denser, not easier", { skip }, () => {
  // Why P0M8 is not finished. Switching every conflict off does not remove
  // difficulty from a *lazy* solver, it removes scatter — and scatter was
  // hiding opportunities the solver is bad at. Every operator publishing exact
  // coordinates at fine granularity puts twice as many stop pairs inside the
  // reference player's 200 m transfer radius, and it takes optimistic transfers
  // it cannot make.
  //
  // So a run-based Gate 3 still reports a negative conflict cost, for a reason
  // that has nothing to do with the conflicts. See KNOWN-ISSUES.md #14.
  const world = loadWorld(worldPath);
  const pairsWithin = (w: World): number => {
    const pts: { lat: number; lon: number }[] = [];
    for (const op of w.manifest.operators) {
      for (const st of projectOperator(w, op.id, 0).timetable.stops) pts.push(st);
    }
    let n = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dy = (pts[i]!.lat - pts[j]!.lat) * 111_320;
        const dx = (pts[i]!.lon - pts[j]!.lon) * 111_320 * 0.64;
        if (Math.sqrt(dx * dx + dy * dy) <= 200) n++;
      }
    }
    return n;
  };

  assert.ok(
    pairsWithin(cleanWorld(world)) > pairsWithin(world),
    "a conflict-free world no longer offers more apparent interchanges than the declared " +
      "one. If that has changed, the density confound in KNOWN-ISSUES.md #14 may be gone " +
      "and a run-based Gate 3 can be trusted again.",
  );
});

test("the clairvoyance term is real, large, and excluded from the gate", { skip }, () => {
  const c = calibrate(loadWorld(worldPath));

  assert.ok(c.gapP0P0a > 60, "P0 gains nothing from foresight, which contradicts its definition");

  // **This assertion used to be `gapP0P0a > gapP0aP2rt` — that foresight
  // dominates — and it fired at P0M10 exactly as its own message asked it to.**
  // It no longer dominates, because moving the declared conflicts onto the
  // operator that carries the network more than doubled what they cost: 2.10m
  // of unreachable foresight against a 2.89m shortfall, where it used to be
  // 2.10m against 0.82m.
  //
  // The matched reference is still required. What matters is not that
  // foresight is the larger term but that it is a large enough share of the
  // shortfall to distort attribution if it were left in — here about 40 %.
  const shortfallWithForesight = c.gapP0P0a + c.gapP0aP2rt;
  assert.ok(
    c.gapP0P0a / shortfallWithForesight > 0.2,
    `foresight is only ${((c.gapP0P0a / shortfallWithForesight) * 100).toFixed(0)}% of the ` +
      `shortfall a naive measurement would report. If it has become negligible, Gate 3 may no ` +
      `longer need P0a and REFERENCE-POLICY.md §2.1 should be revisited.`,
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
