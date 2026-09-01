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

test("the conflicts are doing real work", { skip }, () => {
  const c = calibrate(loadWorld(worldPath));

  // This assertion is the inverse of the one it replaced. At M2 the world
  // declared no conflicts, a coordinate-threshold matcher reconciled it
  // perfectly, and the test asserted `gapP0P2 < 60` — with a note saying that
  // when M3 landed it should fail and be replaced by its opposite. It did.
  //
  // The share, not the absolute gap, is the instrument: an absolute minute
  // count says nothing without knowing how much headroom existed to lose.
  assert.ok(
    c.conflictShare > 0.2,
    `conflicts take only ${(c.conflictShare * 100).toFixed(0)}% of the headroom from a ` +
      `lazy integrator — they are close to decorative (docs/PHASES.md, Gate 3)`,
  );

  // And they should sometimes defeat it outright, not merely slow it down.
  assert.ok(
    c.p2Failures > 0,
    "a coordinate-threshold matcher produced a workable plan for every query",
  );
});

test("a lazy integration can be worse than none at all", { skip }, () => {
  const c = calibrate(loadWorld(worldPath));

  // P1-P2 stays positive here — lazy integration still nets a gain overall —
  // but it is no longer the whole headroom, and the reference player's live
  // capture has gone negative. Both are legitimate: `REFERENCE-POLICY.md` §10
  // notes a negative P1-P2 is interesting at Tier 4+ and a bug at Tier 1.
  assert.ok(
    c.gapP1P2 < c.gapP0P1,
    "lazy integration still captures the entire headroom, so nothing was lost to conflicts",
  );
});
