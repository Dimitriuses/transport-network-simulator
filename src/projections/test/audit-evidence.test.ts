// The audit's evidence must be able to say two different things.
//
// Specification: DATA-MODEL.md §7 gate 4, KNOWN-ISSUES.md #19 and #28.
//
// Both of P1M1's audit defects were checks that could not fail, phrased as
// though they could:
//
//   * `C-coordinate-offset` compared each published stop with an unrelated
//     quay, so its drift figure was a distance between two arbitrary points and
//     the threshold it fed was noise (#28);
//   * `D-staleness` passed on `feed.as_of !== probe`, which is true whenever
//     staleness is non-zero, and reported "hides 0 disruption(s)" identically
//     on a world where it hid nothing and a world where it hid a third of them
//     (#19).
//
// Neither was caught by a test asserting the audit passes, because both *did*
// pass. What was missing was a test that the audit **distinguishes** — so these
// construct the two cases and require different answers.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { DEFAULT_DISRUPTION_POLICY } from "@tns/schema";
import { auditWorld, displacements } from "../src/index.ts";
import type { World } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

/** The same world with one operator's manifest patched. */
function patch(world: World, id: string, group: string, values: Record<string, unknown>): World {
  return {
    ...world,
    manifest: {
      ...world.manifest,
      operators: world.manifest.operators.map((o) =>
        o.id === id
          ? {
              ...o,
              manifest: {
                ...(o.manifest as Record<string, unknown>),
                [group]: {
                  ...((o.manifest as Record<string, Record<string, unknown>>)[group] ?? {}),
                  ...values,
                },
              },
            }
          : o,
      ),
    },
  } as World;
}

const findingFor = (world: World, conflict: string) =>
  auditWorld(world).findings.find((f) => f.conflict === conflict);

// ---------------------------------------------------------------- #28 ------

test("offset drift is measured against the operator's own unoffset output", { skip }, () => {
  const world = loadWorld(worldPath);
  const victim = world.manifest.operators[0]!.id;

  // Site granularity is what broke the old check: published *sites* were paired
  // positionally with canonical *quays*, two lists of different lengths.
  const sited = patch(world, victim, "identity", { granularity: "site" });
  const ds = displacements(sited, victim, 0, { offset_m: 0 });
  const declared = Number(
    (sited.manifest.operators.find((o) => o.id === victim)!.manifest as Record<
      string,
      Record<string, unknown>
    >)["geometry"]!["offset_m"],
  );

  assert.ok(ds.length > 0, "no stop was compared at all");
  const sorted = [...ds].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;

  // The old code reported 668 m for a 130 m setting. Any measure that can do
  // that is not measuring the offset — so bound it by the setting plus the
  // truncation the same operator applies, generously.
  assert.ok(
    median < declared * 2,
    `offset drift measured ${median.toFixed(0)} m for a ${declared} m setting; ` +
      `it is being compared against the wrong thing`,
  );
});

test("removing the offset removes the drift", { skip }, () => {
  // The other half: a measure that returns a plausible number but is not
  // reading the setting would pass the test above and fail this one.
  const world = loadWorld(worldPath);
  const victim = world.manifest.operators[0]!.id;
  const honest = patch(world, victim, "geometry", { offset_m: 0 });
  const ds = displacements(honest, victim, 0, { offset_m: 0 });
  assert.ok(
    ds.every((d) => d === 0),
    "an operator with no offset still measured a displacement from its own unoffset output",
  );
});

// ---------------------------------------------------------------- #19 ------

test("staleness below the shortest announcement lead is reported inert", { skip }, () => {
  const world = loadWorld(worldPath);
  const victim = world.manifest.operators[0]!.id;
  const floor = DEFAULT_DISRUPTION_POLICY.noticeLeadS[0];

  const weak = patch(world, victim, "realtime", { staleness_s: Math.max(1, floor - 60) });
  const f = findingFor(weak, `D-staleness:${victim}`);
  assert.ok(f, "no staleness finding at all");
  assert.equal(f.present, true, "a lagging feed is present; it simply conceals nothing");
  assert.equal(
    f.inert,
    true,
    `staleness of ${floor - 60}s against a minimum lead of ${floor}s was not reported inert. ` +
      `This is the check that read "hides 0 disruption(s)" for months.`,
  );
});

test("staleness above the shortest lead is reported working, with a real count", { skip }, () => {
  const world = loadWorld(worldPath);
  const victim = world.manifest.operators[0]!.id;
  const floor = DEFAULT_DISRUPTION_POLICY.noticeLeadS[0];

  const strong = patch(world, victim, "realtime", { staleness_s: floor * 3 });
  const f = findingFor(strong, `D-staleness:${victim}`);
  assert.ok(f, "no staleness finding at all");
  assert.equal(f.present, true);
  assert.notEqual(f.inert, true, "a staleness well past the minimum lead was called inert");

  // The evidence must carry a number that actually moved, not a constant.
  const weak = patch(world, victim, "realtime", { staleness_s: Math.max(1, floor - 60) });
  assert.notEqual(
    f.evidence,
    findingFor(weak, `D-staleness:${victim}`)!.evidence,
    "the evidence line says the same thing whether staleness conceals anything or not",
  );
});

test("an inert conflict does not fail the audit, and is listed", { skip }, () => {
  // Absent and inert are different problems needing different fixes, so they
  // are reported separately. Conflating them would hide which one you have.
  const world = loadWorld(worldPath);
  const report = auditWorld(world);
  for (const c of report.inert) {
    assert.ok(!report.missing.includes(c), `${c} is reported both inert and missing`);
  }
  assert.equal(
    report.ok,
    report.missing.length === 0,
    "an inert conflict changed the audit's verdict; it should only change its report",
  );
});
