// A tier's bar must survive a change of scale.
//
// Specification: SCORING.md, ROADMAP.md P1M4.
//
// The bar it replaced was a decimal chosen while `capture` normalised against
// the clairvoyant `P0`. The denominator moved to `P0a`, every score rescaled by
// about 2.6, the table did not, and every tier quietly became far harder than
// its number had been chosen to mean. Nothing noticed, because a decimal cannot
// state its intent.
//
// These tests are about that property rather than about any particular number:
// **the same solutions, on the same ladder, must clear the same tiers however
// the scores are rescaled.**

import { test } from "node:test";
import assert from "node:assert/strict";

import { CLEARANCE_LADDER, clearanceBar, clears } from "../src/index.ts";

/** Roughly the committed world's reference solutions. */
const REFERENCES = { null: -0.6, blind: -0.139, naive: 0.076, competent: 0.256 };

test("a bar survives an affine rescale of every score", () => {
  // The failure that produced this module: the denominator changed, every score
  // moved, and a hard-coded bar stayed put. Under the new rule the bar moves
  // with its anchors, so *which solutions clear* cannot change.
  const rescale = (s: Record<string, number>, k: number, c: number) =>
    Object.fromEntries(Object.entries(s).map(([m, v]) => [m, v * k + c]));

  for (const [k, c] of [
    [2.6, 0],
    [1, 0.35],
    [0.4, -0.2],
  ] as const) {
    const scaled = rescale(REFERENCES, k, c);
    for (const spec of CLEARANCE_LADDER) {
      const plain = clearanceBar(spec.tier, REFERENCES);
      const moved = clearanceBar(spec.tier, scaled);
      assert.ok(plain && moved, `tier ${spec.tier} has no bar`);
      assert.ok(
        Math.abs(moved.bar - (plain.bar * k + c)) < 1e-9,
        `tier ${spec.tier}'s bar did not move with the scale`,
      );
      // And the decision itself is unchanged for every reference solution.
      //
      // A score sitting exactly *on* its bar is skipped: an anchor is level
      // with the rung it anchors, and whether floating point puts a rescaled
      // tie a ULP either side of the line is not a property worth asserting.
      // `clears` is strict, so an anchor never clears its own bar — which is
      // the substantive claim and is tested below.
      for (const [mode, score] of Object.entries(REFERENCES)) {
        if (Math.abs(score - plain.bar) < 1e-9) continue;
        assert.equal(
          clears(score, plain.bar),
          clears(scaled[mode]!, moved.bar),
          `rescaling changed whether ${mode} clears tier ${spec.tier}`,
        );
      }
    }
  }
});

test("the ladder is monotone: a higher tier is never easier", () => {
  let previous = Number.NEGATIVE_INFINITY;
  for (const spec of CLEARANCE_LADDER) {
    const computed = clearanceBar(spec.tier, REFERENCES);
    assert.ok(computed, `tier ${spec.tier} has no bar`);
    assert.ok(
      computed.bar >= previous,
      `tier ${spec.tier} asks for ${computed.bar.toFixed(3)}, below tier ` +
        `${spec.tier - 1}'s ${previous.toFixed(3)}`,
    );
    previous = computed.bar;
  }
});

test("the top of the ladder sits above our own answer key", () => {
  // A ladder whose highest rung is reachable by the solution we wrote has no
  // room above it, and `CORECONCEPT.md` §7's top tier would mean nothing.
  const top = CLEARANCE_LADDER[CLEARANCE_LADDER.length - 1]!;
  const bar = clearanceBar(top.tier, REFERENCES);
  assert.ok(bar);
  assert.ok(
    bar.bar > REFERENCES.competent,
    `tier ${top.tier} asks for ${bar.bar.toFixed(3)}, which the competent ` +
      `reference solution already reaches at ${REFERENCES.competent}`,
  );
});

test("every bar names anchors that exist and is described in words", () => {
  const anchors = new Set(["null", "blind", "naive", "competent"]);
  for (const spec of CLEARANCE_LADDER) {
    assert.ok(anchors.has(spec.from), `tier ${spec.tier} anchors on unknown ${spec.from}`);
    assert.ok(anchors.has(spec.to), `tier ${spec.tier} anchors on unknown ${spec.to}`);
    assert.ok(
      spec.because.length > 20,
      `tier ${spec.tier} has a bar with no stated intent — which is the whole ` +
        `defect this replaced`,
    );
  }
});

test("a missing anchor yields no bar rather than a default", () => {
  // A clearance decision made against an anchor nobody measured is exactly the
  // kind of number this module exists to abolish.
  assert.equal(clearanceBar(3, { naive: 0.1 }), null);
  assert.equal(clearanceBar(99, REFERENCES), null);
});


test("an anchor never clears the tier it anchors", () => {
  // Tier 2's bar *is* the lazy integrator's score, and the rung asks you to
  // beat one. A rule that let the anchor clear its own bar would make "beat a
  // lazy integrator" mean "be a lazy integrator".
  for (const spec of CLEARANCE_LADDER) {
    if (spec.at !== 1) continue;
    const computed = clearanceBar(spec.tier, REFERENCES);
    assert.ok(computed);
    const anchor = REFERENCES[spec.to as keyof typeof REFERENCES];
    assert.equal(
      clears(anchor, computed.bar),
      false,
      `${spec.to} clears tier ${spec.tier}, which is anchored on ${spec.to}`,
    );
  }
});
