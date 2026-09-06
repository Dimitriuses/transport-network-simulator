// Bake one world's answer key, for the overfitted reference solution.
//
//   npm run tune <world.db> [out.json]
//
// Specification: PHASES.md §284, ROADMAP.md P1M4.
//
// Produces the table `TNS_PLAYER_MODE=tuned` memorises: each operator's
// systematic geometry displacement and its time encoding, read from the world's
// canonical data rather than inferred from its feeds.
//
// **Reading the answer key is the point.** `tuned` exists to be a solution that
// studied one exam, so the key must be exact — an approximation would make its
// failure on another world ambiguous between "it memorised" and "it estimated
// badly". What it must not contain is anything about the *day*: no disruptions,
// no cancellations. Knowing this world's conflicts is study; knowing this day's
// delays is `cheat`, which is a different fixture for a different check.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { projectOperator } from "@tns/projections";
import type { Tuning, OperatorTuning } from "../src/index.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

const worldArg = process.argv[2];
if (!worldArg) {
  console.error("usage: npm run tune <world.db> [out.json]");
  process.exit(2);
}
const worldPath = resolve(repoRoot, worldArg);
const outPath = resolve(repoRoot, process.argv[3] ?? worldArg.replace(/\.world\.db$/, ".tuning.json"));

const world = loadWorld(worldPath);
const quayById = new Map(world.quays.map((q) => [q.id, q]));

const operators: Record<string, OperatorTuning> = {};

for (const op of world.manifest.operators) {
  const { timetable, resolution } = projectOperator(world, op.id, 0);
  const manifest = op.manifest as { time: { encoding: OperatorTuning["encoding"] } };

  // The systematic displacement: the mean signed difference between where this
  // operator says a stop is and where it actually is. Averaged over the quays a
  // published stop stands for, so Site granularity is handled the same way the
  // projection produced it.
  let sumLat = 0;
  let sumLon = 0;
  let n = 0;
  for (const stop of timetable.stops) {
    const quayIds = resolution.stopToQuays.get(stop.stop_id) ?? [];
    if (quayIds.length === 0) continue;
    let qLat = 0;
    let qLon = 0;
    let m = 0;
    for (const id of quayIds) {
      const quay = quayById.get(id);
      if (!quay) continue;
      qLat += quay.lat;
      qLon += quay.lon;
      m++;
    }
    if (m === 0) continue;
    sumLat += stop.lat - qLat / m;
    sumLon += stop.lon - qLon / m;
    n++;
  }

  operators[op.id] = {
    dLat: n === 0 ? 0 : sumLat / n,
    dLon: n === 0 ? 0 : sumLon / n,
    encoding: manifest.time.encoding,
  };
}

const tuning: Tuning = { world: world.manifest.contentHash, operators };
writeFileSync(outPath, `${JSON.stringify(tuning, null, 2)}\n`, "utf8");

console.log("");
console.log(`  ANSWER KEY — ${worldArg}`);
console.log(`  world ${world.manifest.contentHash.slice(0, 16)}`);
console.log("");
console.log("    operator     displacement (m)   encoding");
for (const [id, t] of Object.entries(operators)) {
  const metres = Math.sqrt((t.dLat * 111_320) ** 2 + (t.dLon * 111_320 * 0.64) ** 2);
  console.log(`    ${id.padEnd(12)} ${metres.toFixed(0).padStart(16)}   ${t.encoding}`);
}
console.log("");
console.log(`  written ${outPath}`);
console.log("");
console.log("  This is what `TNS_PLAYER_MODE=tuned` memorises. On this world it is");
console.log("  exact; on another world of the same tier the operator ids are the same");
console.log("  and every answer is wrong, which is the point.");
console.log("");
