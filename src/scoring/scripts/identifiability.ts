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
  console.log("  group                                             spread   unpredictable");
  console.log("  ------------------------------------------------  -------  -------------");
  for (const g of report.groups.slice(0, 12)) {
    const names = g.quayIds.join(", ");
    console.log(
      `  ${(names.length > 48 ? names.slice(0, 45) + "..." : names).padEnd(48)}  ` +
        `${g.spreadM.toFixed(0).padStart(5)}m  ${mins(g.unpredictableS).padStart(11)}`,
    );
  }
  if (report.groups.length > 12) console.log(`  ... and ${report.groups.length - 12} more`);
  console.log("");
  console.log("  The first group's published description, exactly as a player sees it:");
  console.log(`    ${report.groups[0]!.signature.split("  ").join("\n    ")}`);
}

console.log("");
const share = headroomS === 0 ? 0 : report.worstUnpredictableS / headroomS;
console.log(`  worst single unpredictable walk   ${mins(report.worstUnpredictableS)}`);
console.log(`  against ${mins(headroomS)} of headroom   ${(share * 100).toFixed(0)}%`);
console.log("");

// **A bound, not a verdict.** An ambiguity is only unfair if the world charges
// for something nobody could have determined, and how often that bites depends
// on the query set rather than on the world's structure. What this can say
// without inventing a query-dependent claim is how large a single unpredictable
// cost can get, and whether that is a rounding error beside the headroom or a
// significant fraction of it.
//
// The 25% threshold is PROVISIONAL — introduced with the instrument at P0M10
// and not yet ratified, exactly as the Gate 3 materiality bar was.
const PROVISIONAL_MAX_SHARE = 0.25;
const ok = share <= PROVISIONAL_MAX_SHARE;

console.log(`  ${ok ? "PASS" : "FAIL"} — an ambiguity may not hide more than ` +
  `${(PROVISIONAL_MAX_SHARE * 100).toFixed(0)}% of the headroom`);
console.log("");
console.log("  That threshold is PROVISIONAL. It bounds how much a single");
console.log("  unanswerable question can cost; it does not measure how often the");
console.log("  question is asked, which is a fact about the query set rather than");
console.log("  about the world. Ratifying or replacing it is a decision, not an");
console.log("  arithmetic correction — see docs/PHASES.md, Gate 1a.");
console.log("");
