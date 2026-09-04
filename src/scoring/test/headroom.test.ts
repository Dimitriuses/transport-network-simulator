// A scored journey must be able to reward integration.
//
// Specification: KNOWN-ISSUES.md #26.
//
// P0M9 grew the query set from 22 hand-picked journeys to 132 generated ones
// and diluted the journeys that need integration to 13 of 132. On the rest the
// unrestricted transfer graph and the restricted one the reference policy is
// held to give the same answer — nothing to win, and every extra leg a player
// takes is exposure to a cancellation nobody announced. The competent solution
// scored below the naive one for exactly that reason, and it took two
// milestones to find.
//
// The scored set is now selected by `npm run headroom` and the chosen ids are
// checked into `city.py`. That list rots silently if the city changes, so this
// asserts the property the list was selected for rather than the list itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { buildIndex, route, type Access } from "@tns/router";

const here = dirname(fileURLToPath(import.meta.url));
const worldPath = join(resolve(here, "..", "..", ".."), "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

test("most scored journeys can be improved by integration", { skip }, () => {
  const world = loadWorld(worldPath);
  const ix = buildIndex(world);
  const accessFor = (queryId: string, endpoint: "origin" | "destination"): Access[] =>
    world.queryAccess
      .filter((a) => a.queryId === queryId && a.endpoint === endpoint)
      .map((a) => ({ quayId: a.quayId, seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps) }))
      .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

  let worthwhile = 0;
  for (const q of world.queries) {
    const o = accessFor(q.id, "origin");
    const d = accessFor(q.id, "destination");
    const restricted = route(ix, o, d, q.departAfterS, "obvious");
    const open = route(ix, o, d, q.departAfterS, "all");
    if (!restricted || !open) continue;
    if (restricted.arriveS - open.arriveS >= 120) worthwhile++;
  }

  const share = worthwhile / world.queries.length;
  assert.ok(
    share >= 0.6,
    `only ${worthwhile} of ${world.queries.length} scored journeys can be improved by ` +
      `integration. A journey where the restricted and unrestricted transfer graphs agree ` +
      `tests nothing and contributes only downside risk. Re-select with: ` +
      `TNS_QUERY_SELECTION=all npm run world:build && npm run headroom`,
  );
});

test("some scored journeys are deliberately straightforward", { skip }, () => {
  // A set where *every* journey needs integration would not notice a solution
  // that breaks the easy ones, which is a real failure mode and the reason the
  // hand-picked direct routes are kept.
  const world = loadWorld(worldPath);
  const ix = buildIndex(world);
  let plain = 0;
  for (const q of world.queries) {
    const o = world.queryAccess
      .filter((a) => a.queryId === q.id && a.endpoint === "origin")
      .map((a) => ({ quayId: a.quayId, seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps) }));
    const d = world.queryAccess
      .filter((a) => a.queryId === q.id && a.endpoint === "destination")
      .map((a) => ({ quayId: a.quayId, seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps) }));
    const restricted = route(ix, o, d, q.departAfterS, "obvious");
    const open = route(ix, o, d, q.departAfterS, "all");
    if (restricted && open && restricted.arriveS - open.arriveS < 120) plain++;
  }
  assert.ok(plain > 0, "every scored journey needs integration; nothing tests the easy case");
});
