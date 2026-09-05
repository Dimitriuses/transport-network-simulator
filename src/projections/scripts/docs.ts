// Print what an operator's docs_url serves.
//
//   npm run docs [world.db] [operator]
//
// Specification: DATA-MODEL.md §5, KNOWN-ISSUES.md #11.
//
// A convenience for reading what a player would read, and for reviewing a
// generated world's documentation without starting a server.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { operatorNotes } from "@tns/projections";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const arg = process.argv[2];
const worldPath = arg ? resolve(repoRoot, arg) : join(repoRoot, "worlds", "m1.world.db");
const only = process.argv[3];

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
for (const op of world.manifest.operators) {
  if (only && op.id !== only) continue;
  console.log("");
  console.log(`  ${op.name} — public data API   (${op.id})`);
  for (const note of operatorNotes(world, op.id)) {
    console.log("");
    console.log(`    ${note.title}`);
    // Wrapped by hand: no dependency, and the width matches the other reports.
    let line = "     ";
    for (const word of note.text.split(" ")) {
      if (line.length + word.length > 78) {
        console.log(line);
        line = "     ";
      }
      line += ` ${word}`;
    }
    console.log(line);
  }
}
console.log("");
console.log("  Format and units only. Nothing here claims the data is accurate,");
console.log("  fresh or complete, and nothing mentions another operator.");
console.log("");
