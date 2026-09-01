// The three-gap calibration.
//
// Specification: REFERENCE-POLICY.md §10.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { calibrate } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

test("no policy beats perfect information", { skip }, () => {
  const c = calibrate(loadWorld(worldPath));

  // The invariant that matters most, and the one that has been violated twice
  // during development: once by a free access walk (M1), once by evaluating P2
  // on its own merged model instead of against the world (M2).
  for (const g of c.perQuery) {
    if (g.p0 === null) continue;
    if (g.p1 !== null) {
      assert.ok(g.p1 >= g.p0 - 1, `${g.queryId}: P1 (${g.p1}s) beat the oracle (${g.p0}s)`);
    }
    if (g.p2 !== null) {
      assert.ok(g.p2 >= g.p0 - 1, `${g.queryId}: P2 (${g.p2}s) beat the oracle (${g.p0}s)`);
    }
  }
  assert.ok(c.gapP0P1 >= 0, "mean P0-P1 gap is negative");
  assert.ok(c.gapP0P2 >= 0, "mean P0-P2 gap is negative");
});

test("this world has headroom for a player to compete for", { skip }, () => {
  const c = calibrate(loadWorld(worldPath));

  // A second operator whose quays sit near the first's but in separate Sites.
  // P0 may transfer there; P1 may not. Without this the capture ratio has no
  // denominator and no solution can distinguish itself (Phase 0, Gate 2).
  assert.ok(
    c.gapP0P1 > 60,
    `P0-P1 is only ${c.gapP0P1.toFixed(0)}s — not enough headroom to discriminate`,
  );
});

test("the conflicts are not yet doing any work, and the calibration says so", { skip }, () => {
  const c = calibrate(loadWorld(worldPath));

  // Expected, and the whole reason M3 exists. This world declares no semantic
  // conflicts, so a coordinate-threshold matcher reconciles it perfectly and
  // P2 lands on P0. All of the present difficulty is topology.
  //
  // When M3 lands, this assertion should FAIL and be replaced by its opposite.
  // That failure is the milestone's evidence.
  assert.ok(
    c.gapP0P2 < 60,
    `P0-P2 is ${c.gapP0P2.toFixed(0)}s — conflicts are costing a lazy integrator ` +
      `something, which should not be possible before M3 declares any`,
  );
});
