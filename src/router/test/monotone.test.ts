// Adding disruptions must never improve a journey.
//
// Specification: KNOWN-ISSUES.md #40.
//
// A disruption can only **remove** a journey or **delay** it — `buildIndex`
// drops cancellations and adds `delayS` to a start time, and delays are drawn
// from a positive range. So for any query, routing on a disrupted index can
// only be the same or worse than routing on a clean one.
//
// It is not. On a generated world, 28 of 200 queries route *better* with
// disruptions applied, the worst by 18 minutes. An optimal search cannot do
// that, so `route` is not optimal — and every number this project produces goes
// through it: `P0`, `P0a`, `P1`, `P2`, `npm run headroom`, and the bound the
// information-set audit uses.
//
// **Marked `todo`: it fails today, on both worlds, and that is the point.** It
// is written as the target rather than as documentation — monotonicity is cheap
// to state, cheap to check, and does not depend on knowing what the right
// answer is, which is what makes it a usable specification for a search whose
// optimum nobody has an independent way to compute. `todo` keeps CI honest
// about that without turning it red; delete the flag when #40 is fixed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld, generateDisruptions } from "@tns/core";
import { buildIndex, route, type Access } from "@tns/router";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

const WORLDS = ["m1", "scratch/gen"].map((n) => ({
  name: n,
  path: join(repoRoot, "worlds", `${n}.world.db`),
}));

for (const w of WORLDS) {
  test(
    `${w.name}: a disruption never makes a journey faster`,
    {
      skip: existsSync(w.path) ? false : "no bundle",
      todo: "KNOWN-ISSUES.md #40",
    },
    () => {
      const world = loadWorld(w.path);
      const accessFor = (
        queryId: string,
        endpoint: "origin" | "destination",
      ): Access[] =>
        world.queryAccess
          .filter((a) => a.queryId === queryId && a.endpoint === endpoint)
          .map((a) => ({
            quayId: a.quayId,
            seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps),
          }))
          .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

      const clean = buildIndex(world);
      const disrupted = buildIndex(
        world,
        generateDisruptions(world.journeys, world.manifest.seed),
      );

      const violations: string[] = [];
      let worstS = 0;
      for (const q of world.queries) {
        const a = route(
          clean,
          accessFor(q.id, "origin"),
          accessFor(q.id, "destination"),
          q.departAfterS,
          "all",
        );
        const b = route(
          disrupted,
          accessFor(q.id, "origin"),
          accessFor(q.id, "destination"),
          q.departAfterS,
          "all",
        );
        if (!a || !b) continue;
        const excess = a.arriveS - b.arriveS;
        if (excess > 0) {
          worstS = Math.max(worstS, excess);
          if (violations.length < 5) {
            violations.push(
              `${q.id}: clean ${((a.arriveS - q.departAfterS) / 60).toFixed(1)}m, ` +
                `disrupted ${((b.arriveS - q.departAfterS) / 60).toFixed(1)}m`,
            );
          }
        }
      }

      assert.equal(
        violations.length,
        0,
        `routing improved when journeys were removed or delayed, worst by ` +
          `${(worstS / 60).toFixed(1)}m:\n    ${violations.join("\n    ")}\n` +
          `  A disruption can only remove a journey or delay it, so this is not a ` +
          `property of the world — the search is not optimal. See KNOWN-ISSUES.md #40.`,
      );
    },
  );
}
