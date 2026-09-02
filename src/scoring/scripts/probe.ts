// The conflict-depth probe.
//
//   npm run probe [world.db] [operator]
//
// ROADMAP.md P1M0 part B: find out which conflicts can be made to bite, and how
// hard each must be pushed before it does. Ablation says what the declared
// settings cost; this says whether any setting on any operator would cost
// anything at all.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { probeCatalogue, NOISE_FLOOR_S } from "@tns/scoring";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = process.argv[2] ?? join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const report = probeCatalogue(world, process.argv[3]);

const mins = (s: number): string => `${(s / 60).toFixed(2)}m`;

console.log("");
console.log(`  CONFLICT-DEPTH PROBE — seed ${world.manifest.seed}, tier ${world.manifest.tier}`);
console.log("  each conflict alone, every operator in turn, against a conflict-free world");
console.log("");
console.log(`  conflict-free baseline shortfall   ${mins(report.baselineS)}`);
console.log("");
console.log("  Measured against P0a, an optimum on the same announcement horizon,");
console.log("  so that floor should be zero: with nothing to misreconcile, a lazy");
console.log("  integrator is optimal. A non-zero floor means something other than");
console.log("  a declared conflict is costing it, and every figure below is");
console.log("  inflated by however much that is.");
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
console.log("");

console.log("  Where a conflict bites, how it grows with strength:");
console.log("");
for (const r of report.results) {
  if (r.inert) continue;
  const byOp = new Map<string, string[]>();
  for (const p of r.points) {
    if (!byOp.has(p.operator)) byOp.set(p.operator, []);
    byOp.get(p.operator)!.push(`${String(p.value)}=${(p.costS / 60).toFixed(2)}`);
  }
  console.log(`    ${r.conflict}`);
  for (const [op, cells] of byOp) console.log(`      ${op.padEnd(10)} ${cells.join("  ")}`);
}
console.log("");

console.log(
  `  ${report.results.length - report.inertCount} of ${report.results.length} conflicts can be made to bite. ` +
    `${report.inertCount} are inert at every setting, on every operator.`,
);
console.log("");

if (report.inertCount > report.results.length / 2) {
  console.log("  More than half the catalogue is inert. A generator sampling it");
  console.log("  uniformly would mostly produce defects that cost a solver nothing.");
  console.log("  See ROADMAP.md P1M1 — strengthen or retire.");
  console.log("");
}
