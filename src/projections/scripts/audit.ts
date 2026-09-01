// The defect audit, as a command.
//
//   npm run audit [world.db]
//
// DATA-MODEL.md §7 gate 4: every conflict a world declares must actually be
// present in what its operators publish. A world that is silently easier than
// it claims corrupts difficulty calibration, and nothing else would notice.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { auditWorld } from "@tns/projections";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = process.argv[2] ?? join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}.\nBuild it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const report = auditWorld(world);

console.log("");
console.log(`  DEFECT AUDIT — seed ${world.manifest.seed}, ${world.manifest.operators.length} operators`);
console.log(`  ${report.declared.length} conflicts declared`);
console.log("");

for (const f of report.findings) {
  console.log(`  ${f.present ? "ok  " : "MISS"}  ${f.conflict.padEnd(34)}  ${f.evidence}`);
}

if (report.missing.length > 0) {
  console.log("");
  console.log("  DECLARED BUT NOT PRESENT:");
  for (const c of report.missing) console.log(`    ${c}`);
  console.log("");
  console.log("  This world is easier than it claims. Difficulty calibration");
  console.log("  against it would be wrong, and two 'equal' worlds unequal.");
}

console.log("");
process.exit(report.ok ? 0 : 1);
