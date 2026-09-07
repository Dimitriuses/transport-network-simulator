// What adding disruptions can and cannot do to a journey.
//
// Specification: KNOWN-ISSUES.md #40.
//
// This file used to assert that *no* disruption could improve a journey, was
// marked `todo` because 28 of 200 queries violated it, and stood as the
// evidence that `route` was not optimal. **The property was wrong.**
//
//   * **Cancelling** a journey removes an option. A search over a subset cannot
//     do better, so this half is real, and it is asserted below.
//   * **Delaying** one moves a departure *later* — and a later departure can be
//     caught by a traveller who would otherwise have missed it. A delayed day
//     can beat a clean one, for the same reason a held connection saves a real
//     passenger. That half is demonstrated below rather than asserted, so that
//     nobody restores the stronger claim by looking at the code and reasoning
//     about it, which is how it got there the first time.
//
// The distinction matters beyond this test: the information-set audit built its
// bound on the same false premise and sat above an achievable outcome on 12 of
// 98 queries on the committed world and 30 of 200 on a generated one.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld, generateDisruptions } from "@tns/core";
import type { World } from "@tns/schema";
import { buildIndex, route, type Access } from "@tns/router";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

const WORLDS = ["m1", "scratch/gen"].map((n) => ({
  name: n,
  path: join(repoRoot, "worlds", `${n}.world.db`),
}));

for (const w of WORLDS) {
  test(
    `${w.name}: removing journeys never makes one faster`,
    { skip: existsSync(w.path) ? false : "no bundle" },
    () => {
      const world = loadWorld(w.path);
      const accessFor = (queryId: string, endpoint: "origin" | "destination"): Access[] =>
        world.queryAccess
          .filter((a) => a.queryId === queryId && a.endpoint === endpoint)
          .map((a) => ({
            quayId: a.quayId,
            seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps),
          }))
          .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

      const clean = buildIndex(world);
      const withoutCancelled = buildIndex(
        world,
        generateDisruptions(world.journeys, world.manifest.seed).filter(
          (d) => d.kind === "cancellation",
        ),
      );

      const violations: string[] = [];
      let worstS = 0;
      let worse = 0;
      for (const q of world.queries) {
        const o = accessFor(q.id, "origin");
        const d = accessFor(q.id, "destination");
        const a = route(clean, o, d, q.departAfterS, "all");
        const b = route(withoutCancelled, o, d, q.departAfterS, "all");
        if (!a || !b) continue;
        if (b.arriveS > a.arriveS) worse++;
        const excess = a.arriveS - b.arriveS;
        if (excess > 0) {
          worstS = Math.max(worstS, excess);
          if (violations.length < 5) {
            violations.push(
              `${q.id}: clean ${((a.arriveS - q.departAfterS) / 60).toFixed(1)}m, ` +
                `fewer services ${((b.arriveS - q.departAfterS) / 60).toFixed(1)}m`,
            );
          }
        }
      }

      assert.equal(
        violations.length,
        0,
        `routing improved when journeys were removed, worst by ` +
          `${(worstS / 60).toFixed(1)}m:\n    ${violations.join("\n    ")}\n` +
          `  Removing an option cannot produce a better answer, so this would be ` +
          `a defect in the search. See KNOWN-ISSUES.md #40.`,
      );

      // **A test that cannot fail is not a test.** If cancellations changed
      // nothing at all, the assertion above would pass on a search that ignored
      // its index entirely.
      assert.ok(
        worse > 0,
        "no query got worse when services were cancelled — the check is vacuous",
      );
    },
  );
}

// --------------------------------------------------------------------------

/**
 * Two quays, one pattern, two journeys, and a traveller who is slightly late.
 *
 * Hand-built rather than drawn from a world, because it is the *mechanism* that
 * has to stay legible: the whole of `#40` was a plausible argument about what
 * disruptions can do, and a paragraph is what it takes to see it is wrong.
 */
function twoStopWorld(): World {
  const stops = (offsets: [number, number]) => [
    { seq: 0, quayId: "a", arriveOffsetS: offsets[0], departOffsetS: offsets[0] },
    { seq: 1, quayId: "b", arriveOffsetS: offsets[1], departOffsetS: offsets[1] },
  ];
  return {
    manifest: { walkSpeedMps: 1.3, seed: 1 },
    sites: [
      { id: "sa", name: "A" },
      { id: "sb", name: "B" },
    ],
    quays: [
      { id: "a", siteId: "sa", name: "A" },
      { id: "b", siteId: "sb", name: "B" },
    ],
    lines: [{ id: "l", name: "L", operator: "op" }],
    patterns: [{ id: "p", lineId: "l", heading: "b", stops: stops([0, 100]) }],
    journeys: [
      { id: "early", patternId: "p", startS: 100 },
      { id: "late", patternId: "p", startS: 1000 },
    ],
    walkLinks: [],
    queries: [],
    queryAccess: [],
  } as unknown as World;
}

const AT_A: Access[] = [{ quayId: "a", seconds: 0 }];
const AT_B: Access[] = [{ quayId: "b", seconds: 0 }];

test("a delay can make a journey faster, and that is not a bug", () => {
  const world = twoStopWorld();

  // The traveller reaches quay A at t=150. The 100 has gone; the next is 1000.
  const clean = route(buildIndex(world), AT_A, AT_B, 150, "all");
  assert.equal(clean?.arriveS, 1100, "clean day: they wait for the later service");

  // Now the early service runs 100 seconds late. It has not become faster, or
  // better, or more frequent — it is simply still there when they arrive.
  const delayed = route(
    buildIndex(world, [
      { kind: "delay", journeyId: "early", delayS: 100, announcedAtS: 0 } as never,
    ]),
    AT_A,
    AT_B,
    150,
    "all",
  );

  assert.equal(delayed?.arriveS, 300, "the delayed service is now catchable");
  assert.ok(
    (delayed?.arriveS ?? 0) < (clean?.arriveS ?? 0),
    "a delay improved the journey — expected, and the reason #40's premise was wrong",
  );
});

test("a cancellation can only take an option away", () => {
  const world = twoStopWorld();

  const clean = route(buildIndex(world), AT_A, AT_B, 0, "all");
  assert.equal(clean?.arriveS, 200, "clean day: the early service");

  const cancelled = route(
    buildIndex(world, [
      { kind: "cancellation", journeyId: "early", announcedAtS: 0 } as never,
    ]),
    AT_A,
    AT_B,
    0,
    "all",
  );

  assert.equal(cancelled?.arriveS, 1100, "with it gone, only the later service remains");
});
