// Gate 1a — is the world answerable?
//
//   npm run identifiability [world.db]
//
// Specification: PHASES.md, Gate 1a.
//
// The dual of `npm run audit`. That one confirms the declared conflicts are
// present; this confirms they have not made the world impossible to reconcile
// from what was published. Needs no solver — only the data.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { auditIdentifiability } from "@tns/projections";
import { calibrate } from "@tns/scoring";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = process.argv[2] ?? join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const report = auditIdentifiability(world);
const headroomS = calibrate(world).gapP0P1;

const mins = (s: number) => `${(s / 60).toFixed(2)}m`;

console.log("");
console.log(`  IDENTIFIABILITY AUDIT — seed ${world.manifest.seed}, tier ${world.manifest.tier}`);
console.log("");
console.log("  Where two canonical places produce identical published observations");
console.log("  across every operator and every field, no amount of skill separates");
console.log("  them. That is not difficulty, it is an unanswerable question — and");
console.log("  the walk between them is a cost no solver can predict.");
console.log("");
console.log(`  quays described by at least one operator   ${report.quaysExamined} of ${world.quays.length}`);
console.log(`  quays sharing a description with another   ${report.ambiguousQuays}`);
console.log(`  ambiguous groups                           ${report.groups.length}`);
console.log("");

if (report.groups.length === 0) {
  console.log("  Every published place is distinguishable. Nothing here bounds a solver.");
} else {
  console.log("  group                                      spread  unpredictable  reachable by");
  console.log("  -----------------------------------------  ------  -------------  ------------");
  for (const g of report.groups.slice(0, 12)) {
    const names = g.quayIds.join(", ");
    console.log(
      `  ${(names.length > 41 ? names.slice(0, 38) + "..." : names).padEnd(41)}  ` +
        `${g.spreadM.toFixed(0).padStart(4)}m  ${mins(g.unpredictableS).padStart(13)}  ` +
        `${g.reachableByQueries}/${report.scoredQueries} queries`,
    );
  }
  if (report.groups.length > 12) console.log(`  ... and ${report.groups.length - 12} more`);
  console.log("");
  console.log("  The first group's published description, exactly as a player sees it:");
  console.log(`    ${report.groups[0]!.signature.split("  ").join("\n    ")}`);
}

console.log("");
const perTraveller = headroomS === 0 ? 0 : report.worstUnpredictableS / headroomS;
const share = headroomS === 0 ? 0 : report.worstAggregateS / headroomS;
console.log(`  worst walk one traveller cannot predict   ${mins(report.worstUnpredictableS)}  ` +
  `(${(perTraveller * 100).toFixed(0)}% of headroom)`);
console.log(`  the same, across the scored population   ${mins(report.worstAggregateS)}  ` +
  `(${(share * 100).toFixed(0)}% of headroom)`);
console.log("");
console.log("  The second line is the one thresholded. Comparing a single");
console.log("  traveller's worst case against the population mean is a maximum");
console.log("  measured against an average, and it overstated this world by a");
console.log("  factor of six when the instrument was first written.");
console.log("");

// **An upper bound, and it is thresholded on the aggregate.** An ambiguity is
// only unfair if the world charges for something nobody could have determined,
// and one nobody can reach costs nothing however wide it is. So the bound
// charges each ambiguity only to the travellers who could meet it, once each —
// which is still an over-estimate, since not every such traveller is sent
// through the ambiguous stop, but it is an over-estimate of the right quantity.
//
// The 25% threshold was ratified on 2026-09-04.
const MAX_AMBIGUITY_SHARE = 0.25;
const ok = share <= MAX_AMBIGUITY_SHARE;

console.log(`  ${ok ? "PASS" : "FAIL"} — an ambiguity may not hide more than ` +
  `${(MAX_AMBIGUITY_SHARE * 100).toFixed(0)}% of the headroom`);
console.log("");
console.log("  The figure thresholded is an upper bound: every traveller who");
console.log("  *could* meet an ambiguity is charged for it once, though not all");
console.log("  of them are routed through it. Threshold ratified 2026-09-04.");
console.log("");
