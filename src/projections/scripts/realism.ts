// Is the published geometry still a disagreement, or is it a broken map?
//
//   npm run realism [world.db]
//
// Specification: CORECONCEPT.md §2.1, ROADMAP.md P1M1.
//
// Every catalogue setting has a plausibility ceiling with a stated real-world
// cause, and tests enforce them. **That is not sufficient, and P1M1 found out
// why.** The generator gave one operator a lat/lon swap, a 130 m offset and
// 3 dp truncation at once: each setting inside its own ceiling, the published
// stops 2,200 km from their quays. Realism is a property of the combination.
//
// So this measures the consequence rather than the settings — how far each
// operator's published positions sit from the truth, with everything it does to
// geometry composed — and holds it to the same ceiling one setting is held to.
//
// The ceiling is `C-coordinate-offset`'s: past ~150 m two operators are not
// disagreeing about one stop any more, they are describing different places.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { displacements } from "@tns/projections";
import { CATALOGUE } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const arg = process.argv[2];
const worldPath = arg ? resolve(repoRoot, arg) : join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const ceiling = Number(
  CATALOGUE.find((s) => s.conflict === "C-coordinate-offset")?.plausible?.max ?? 150,
);
const because =
  CATALOGUE.find((s) => s.conflict === "C-coordinate-offset")?.plausible?.because ?? "";

const world = loadWorld(worldPath);
const honest = { precision: 6, source: "quay", offset_m: 0, latlon_order: "lat_lon" } as const;

console.log("");
console.log(`  GEOMETRY REALISM — ${world.manifest.operators.length} operators`);
console.log("");
console.log(`  Ceiling ${ceiling} m: ${because}.`);
console.log("  Composed displacement from the quay each stop actually is.");
console.log("");
console.log("    operator      median     max    verdict");

let ok = true;
for (const op of world.manifest.operators) {
  const ds = displacements(world, op.id, 0, honest);
  const sorted = [...ds].sort((a, b) => a - b);
  const med = sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)]!;
  const max = sorted.length === 0 ? 0 : sorted[sorted.length - 1]!;
  // The median is the claim about how this feed publishes; the max catches a
  // single stop thrown into another country, which is the failure that started
  // this. Both are held to the same ceiling.
  const bad = med > ceiling || max > ceiling * 2;
  if (bad) ok = false;
  console.log(
    `    ${op.id.padEnd(12)} ${`${med.toFixed(0)} m`.padStart(7)} ${`${max.toFixed(0)} m`.padStart(7)}` +
      `    ${bad ? "BROKEN MAP" : "plausible"}`,
  );
}

console.log("");
if (ok) {
  console.log("  Every operator's published geometry is still a disagreement.");
  console.log("");
} else {
  console.log("  At least one operator publishes positions no real feed would.");
  console.log("  A player cannot learn reconciliation from a feed that is simply");
  console.log("  wrong, and a conflict this large masks every subtler one on the");
  console.log("  same operator. See CORECONCEPT.md §2.1.");
  console.log("");
  process.exit(1);
}
