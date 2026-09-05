// Which conflict stops the lazy integrator producing a plan at all?
//
//   npm run fallback [world.db]
//
// Specification: REFERENCE-POLICY.md §8, ROADMAP.md P1M2.
//
// `P2` is a lazy integration, and when it cannot produce a workable plan the
// traveller falls back to the reference policy — so a fallback costs exactly
// what not integrating costs. A handful is healthy: it is what "lazy" means.
// **A majority is a different world.** The first generated network fell back on
// 158 of 200 journeys, and `P1 − P2` came out *negative*: integrating lazily was
// worse than not integrating at all, which no tier is supposed to mean.
//
// The aggregate cannot say which conflict did it, and guessing from the
// manifest is how this project has been wrong nine times. So each declared
// conflict is switched on alone, over an otherwise clean world, and the
// fallbacks are counted. `conflictVariants` builds those worlds; the comparison
// is against the same clean baseline for every row, so the numbers are
// differences from one thing rather than from each other.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { calibrate, conflictVariants, cleanWorld } from "@tns/scoring";
import { progress } from "./progress.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const arg = process.argv[2];
const worldPath = arg ? resolve(repoRoot, arg) : join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const variants = conflictVariants(world);

interface Row {
  readonly label: string;
  readonly fellBack: number;
  readonly gapP1P2: number;
}

const bar = progress(variants.length + 2, "fallback");

const measure = (label: string, w: Parameters<typeof calibrate>[0]): Row => {
  const c = calibrate(w);
  bar.step(label);
  return {
    label,
    fellBack: c.perQuery.filter((q) => q.p2FellBack).length,
    gapP1P2: c.gapP1P2,
  };
};

const clean = measure("no conflicts", cleanWorld(world));
const rows = variants.map((v) => measure(v.conflict, v.world));
const declared = measure("as declared", world);
bar.done();

const queries = world.queries.length;
const m = (s: number) => `${(s / 60).toFixed(2)}m`;

console.log("");
console.log(`  WHY THE LAZY INTEGRATOR GIVES UP — ${queries} scored journeys`);
console.log("");
console.log("  Each conflict switched on alone, over an otherwise clean world. A");
console.log("  fallback means P2 produced no workable plan and the traveller took");
console.log("  the reference policy instead, which costs exactly what not");
console.log("  integrating costs.");
console.log("");
console.log("    conflict                          fell back    over clean    P1-P2");

const line = (r: Row, delta: number | null) =>
  console.log(
    `    ${r.label.padEnd(32)}  ${`${r.fellBack}/${queries}`.padStart(9)}   ` +
      `${(delta === null ? "" : `${delta >= 0 ? "+" : ""}${delta}`).padStart(10)}   ` +
      `${m(r.gapP1P2).padStart(8)}`,
  );

line(clean, null);
for (const r of [...rows].sort((a, b) => b.fellBack - a.fellBack)) {
  line(r, r.fellBack - clean.fellBack);
}
line(declared, declared.fellBack - clean.fellBack);

console.log("");
console.log("  A conflict adding a few fallbacks is doing its job: a lazy");
console.log("  integrator is supposed to lose something. One that adds most of the");
console.log("  query set has stopped being a conflict and become a wall, and the");
console.log("  world is harder than the tier it declares.");
console.log("");
console.log("  P1-P2 below zero on the last row means integrating lazily is worse");
console.log("  than not integrating. Read the rows above it for which conflict");
console.log("  took it there.");
console.log("");
