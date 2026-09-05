// The conflict-depth probe.
//
//   npm run probe [world.db] [seeds] [operator]
//
// ROADMAP.md P1M0 part B: find out which conflicts can be made to bite, and how
// hard each must be pushed before it does. Ablation says what the declared
// settings cost; this says whether any setting on any operator would cost
// anything at all.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { probeCatalogue, probeStepCount, NOISE_FLOOR_S } from "@tns/scoring";
import { progress } from "./progress.ts";
import type { ProbePoint } from "@tns/scoring";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = process.argv[2] ?? join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const options = {
  seeds: Number(process.argv[3] ?? 5),
  ...(process.argv[4] ? { operator: process.argv[4] } : {}),
};

// This is the slowest instrument in the project — several hundred calibrations
// on a 98-query world. It printed nothing until it finished, which is
// indistinguishable from hanging.
const bar = progress(probeStepCount(world, options), "probing");
const report = probeCatalogue(world, { ...options, onStep: (label) => bar.step(label) });
bar.done();

const mins = (s: number): string => `${(s / 60).toFixed(2)}m`;

console.log("");
console.log(
  `  CONFLICT-DEPTH PROBE — tier ${world.manifest.tier}, ` +
    `${world.queries.length} queries, mean of ${report.seeds} seed${report.seeds === 1 ? "" : "s"}`,
);
console.log("  each conflict alone, every operator in turn, against the same world");
console.log("  publishing honest values for exactly the same stops");
console.log("");
console.log(`  honest-values baseline shortfall   ${mins(report.baselineS)}`);
console.log("");
console.log("  Measured against P0a, an optimum on the same announcement horizon.");
console.log("  The floor is what a lazy integrator loses on honest data — its own");
console.log("  five-minute polling cadence, not a conflict. The entity set is held");
console.log("  at the declared world's, so a sweep varies the conflict and nothing");
console.log("  else (KNOWN-ISSUES.md #14).");
console.log("");

console.log("     conflict                      best   on         at");
console.log("     --------------------------  ------  ---------  ------------");
for (const r of report.results) {
  console.log(
    `  ${r.inert ? " " : "*"}  ${r.conflict.padEnd(26)} ${mins(r.bestCostS).padStart(6)}  ` +
      `${r.bestOperator.padEnd(9)}  ${String(r.bestValue)}`,
  );
}
console.log("");
console.log(`  * = costs more than the ${NOISE_FLOOR_S}s noise floor somewhere`);
console.log("  ! = stronger than two real operators would ever disagree by, so");
console.log("      diagnostic only — a conflict may not be generated there, and");
console.log("      Gate 3 may not be passed by going there.");
console.log("");

console.log("  Where a conflict bites, how it grows with strength (mean±sd over seeds):");
console.log("");
for (const r of report.results) {
  if (r.inert) continue;
  const byOp = new Map<string, string[]>();
  for (const p of r.points) {
    if (!byOp.has(p.operator)) byOp.set(p.operator, []);
    byOp
      .get(p.operator)!
      .push(
        `${String(p.value)}${p.plausible ? "" : "!"}=${(p.costS / 60).toFixed(2)}` +
          `±${(p.sdS / 60).toFixed(2)}`,
      );
  }
  console.log(`    ${r.conflict}`);
  for (const [op, cells] of byOp) console.log(`      ${op.padEnd(10)} ${cells.join("  ")}`);
}
console.log("");

const cosmetic = report.inertCount - report.inertSemanticCount;
console.log(
  `  ${report.results.length - report.inertCount} of ${report.results.length} conflicts can be made to bite.`,
);
console.log(
  `  ${report.inertSemanticCount} semantic conflict${report.inertSemanticCount === 1 ? "" : "s"} ` +
    `inert at every setting on every operator` +
    (cosmetic > 0 ? `, plus ${cosmetic} cosmetic, where zero is the expected result.` : "."),
);
console.log("");

// The monotonicity clause of ROADMAP.md P0M9: does a realistic conflict
// produce a curve, or a scatter? Judged per operator, on plausible settings
// only, and only where the steps are larger than the seed-to-seed spread.
//
// Only settings with a numeric strength can be monotonic at all. `lon_lat` is
// not weaker than `epoch_ms`; a categorical conflict either happens or does
// not, and ordering its values would invent a scale nobody declared.
console.log("  Monotonic where it matters? (numeric strengths only)");
console.log("");
for (const r of report.results) {
  if (r.inert) continue;
  const byOp = new Map<string, typeof r.points>();
  for (const pt of r.points) {
    if (!pt.plausible || typeof pt.value !== "number") continue;
    if (!byOp.has(pt.operator)) byOp.set(pt.operator, []);
    (byOp.get(pt.operator) as ProbePoint[]).push(pt);
  }
  for (const [op, pts] of byOp) {
    if (pts.length < 3) continue;
    let falls = 0;
    let resolved = 0;
    for (let i = 1; i < pts.length; i++) {
      const step = pts[i]!.costS - pts[i - 1]!.costS;
      const noise = Math.max(pts[i]!.sdS, pts[i - 1]!.sdS);
      if (Math.abs(step) > noise) resolved++;
      if (step < -noise) falls++;
    }
    const verdict = resolved === 0 ? "flat within noise" : falls === 0 ? "MONOTONIC" : `falls at ${falls} step(s)`;
    console.log(`    ${r.conflict.padEnd(26)} ${op.padEnd(9)} ${verdict}`);
  }
}
console.log("");

if (report.inertSemanticCount > report.results.length / 2) {
  console.log("  More than half the catalogue is inert. A generator sampling it");
  console.log("  uniformly would mostly produce defects that cost a solver nothing.");
  console.log("  See ROADMAP.md P0M8 — strengthen or retire.");
  console.log("");
}
