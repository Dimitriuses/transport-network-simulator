// Are the difficulty gaps a property of the world, or of the day it drew?
//
//   npm run stability [seeds]
//
// Specification: ROADMAP.md P0M9.
//
// The world's geometry and timetable are fixed; the seed decides only which
// services run late and which never run at all. If the three gaps move
// substantially when that changes, they are describing one particular day
// rather than the city, and no claim of the form "two worlds are equally hard"
// can rest on them (KNOWN-ISSUES.md #4).
//
// This reports the spread rather than asserting a threshold. A tolerance
// nobody has measured is a guess, and the number this prints is the evidence
// for choosing one.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { calibrate, valueCleanWorld } from "@tns/scoring";
import { progress } from "./progress.ts";
import type { World } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const seeds = Number(process.argv[2] ?? 6);

const reseed = (w: World, seed: number): World => ({
  ...w,
  manifest: { ...w.manifest, seed },
});

interface Row {
  seed: number;
  p0p1: number;
  p0p2: number;
  p1p2: number;
  conflict: number;
}

const bar = progress(seeds * 2, "calibrating");
const rows: Row[] = [];
for (let i = 0; i < seeds; i++) {
  // Arbitrary but fixed, and spread so consecutive runs do not draw adjacent
  // streams from the same generator.
  const seed = world.manifest.seed + i * 7919;
  const c = calibrate(reseed(world, seed));
  bar.step(`seed ${seed}, declared`);
  const clean = calibrate(reseed(valueCleanWorld(world), seed));
  bar.step(`seed ${seed}, honest values`);
  rows.push({
    seed,
    p0p1: c.gapP0P1,
    p0p2: c.gapP0P2,
    p1p2: c.gapP1P2,
    conflict: c.gapP0aP2rt - clean.gapP0aP2rt,
  });
}

bar.done();

const m = (s: number) => `${(s / 60).toFixed(2)}m`;
const stats = (xs: readonly number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length);
  return { mean, sd, spread: Math.max(...xs) - Math.min(...xs) };
};

console.log("");
console.log(`  GAP STABILITY ACROSS ${seeds} SEEDS — ${world.queries.length} scored queries`);
console.log("");
console.log("  Only the disruptions change. Same city, same timetable, same conflicts.");
console.log("");
console.log("    seed        P0-P1    P0-P2    P1-P2    conflict cost");
for (const r of rows) {
  console.log(
    `    ${String(r.seed).padStart(9)}  ${m(r.p0p1).padStart(7)}  ${m(r.p0p2).padStart(7)}  ` +
      `${m(r.p1p2).padStart(7)}  ${m(r.conflict).padStart(9)}`,
  );
}
console.log("");
console.log("    measure          mean      sd      spread   sd as % of mean");
for (const [label, xs] of [
  ["P0-P1 headroom", rows.map((r) => r.p0p1)],
  ["P0-P2", rows.map((r) => r.p0p2)],
  ["P1-P2", rows.map((r) => r.p1p2)],
  ["conflict cost", rows.map((r) => r.conflict)],
] as const) {
  const s = stats(xs);
  const rel = s.mean === 0 ? 0 : Math.abs((s.sd / s.mean) * 100);
  console.log(
    `    ${label.padEnd(16)} ${m(s.mean).padStart(7)}  ${m(s.sd).padStart(6)}  ` +
      `${m(s.spread).padStart(7)}   ${rel.toFixed(0).padStart(3)}%`,
  );
}
console.log("");
console.log("  The last column is the one that matters. A gap whose seed-to-seed");
console.log("  scatter is comparable to the effect being measured cannot support a");
console.log("  claim that two worlds are equally hard, however carefully the means");
console.log("  are compared.");
console.log("");
