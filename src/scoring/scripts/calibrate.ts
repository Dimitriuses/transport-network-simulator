// Three-gap difficulty calibration.
//
//   npm run calibrate [world.db]
//
// Specification: REFERENCE-POLICY.md §10.
//
// Two worlds are of equal difficulty when all three gaps match within
// tolerance — not merely when they declare the same conflicts. This is the
// instrument that makes that checkable, and the same numbers decide whether a
// world is worth playing at all (docs/PHASES.md Phase 0, Gate 2).

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { calibrate } from "@tns/scoring";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = process.argv[2] ?? join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}.\nBuild it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const c = calibrate(world);

const mins = (s: number | null): string => (s === null ? "—" : `${(s / 60).toFixed(1)}m`);

console.log("");
console.log(
  `  world seed ${world.manifest.seed} · tier ${world.manifest.tier} · ` +
    `${world.manifest.operators.length} operators · conflicts: ` +
    (world.manifest.activeConflicts.length === 0
      ? "none declared"
      : world.manifest.activeConflicts.join(", ")),
);
console.log("");
console.log("  query      P0      P1      P2   headroom");
console.log("  ------  ------  ------  ------  --------");
for (const g of c.perQuery) {
  const head = g.p0 !== null && g.p1 !== null ? `${((g.p1 - g.p0) / 60).toFixed(1)}m` : "—";
  const p2 = g.p2FellBack ? `${mins(g.p2)}*` : mins(g.p2);
  console.log(
    `  ${g.queryId.padEnd(6)}  ${mins(g.p0).padStart(6)}  ${mins(g.p1).padStart(6)}` +
      `  ${p2.padStart(7)}  ${head.padStart(8)}`,
  );
}
console.log("");
console.log(
  `  mean    ${mins(c.meanP0).padStart(6)}  ${mins(c.meanP1).padStart(6)}` +
    `  ${mins(c.meanP2).padStart(6)}     over ${c.comparable} queries`,
);
const fellBack = c.perQuery.filter((g) => g.p2FellBack).length;
if (fellBack > 0) {
  console.log(`  * P2 produced no workable plan and fell back to P1 (${fellBack} queries)`);
}
console.log("");
console.log("  THREE-GAP CALIBRATION");
console.log(`    P0-P1  ${(c.gapP0P1 / 60).toFixed(2).padStart(7)}m  headroom available to any player`);
console.log(`    P0-P2  ${(c.gapP0P2 / 60).toFixed(2).padStart(7)}m  what the conflicts cost a lazy integrator`);
console.log(`    P1-P2  ${(c.gapP1P2 / 60).toFixed(2).padStart(7)}m  whether integrating lazily beats not integrating`);
console.log("");
console.log(
  `    conflicts take ${(c.conflictShare * 100).toFixed(0)}% of the available headroom ` +
    `from a lazy integrator`,
);
console.log(
  `    and leave it with no workable plan at all on ${c.p2Failures}/${c.perQuery.length} queries`,
);
console.log("");

if (c.gapP0P1 < 60) {
  console.log("  ! P0-P1 is near zero: this world has no headroom, so no solution can");
  console.log("    distinguish itself. Not worth playing (docs/PHASES.md, Gate 2).");
  console.log("");
}
if (c.gapP1P2 < 0) {
  console.log("  ! P1-P2 is negative: a lazy integration is *worse* than not integrating.");
  console.log("    Legitimate at Tier 4+, a bug at Tier 1.");
  console.log("");
}
