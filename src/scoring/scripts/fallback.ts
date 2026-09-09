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
//
// **"The same clean baseline" was not the same baseline** (`KNOWN-ISSUES.md`
// #55). The rows were built over `withNoConflicts`, which holds the entity set
// as declared, and the baseline row was `cleanWorld`, which switches granularity
// off as well and so publishes a different number of stops. `cleanWorld`'s own
// comment says it is not a valid floor for attribution, and this read every
// row's "over clean" against it: a constant offset, present in all of them, and
// nothing to do with any conflict.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { calibrate, conflictVariants, withNoConflicts } from "@tns/scoring";
import { CATALOGUE } from "@tns/schema";
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

const clean = measure("no conflicts", withNoConflicts(world));
const rows = variants.map((v) => measure(v.conflict, v.world));
const declared = measure("as declared", world);
bar.done();

const queries = world.queries.length;
const m = (s: number) => `${(s / 60).toFixed(2)}m`;

/**
 * Settings this instrument cannot move, whatever their value.
 *
 * `P2` plans once on its merged static model and is then charged for what
 * actually happened. It never opens a realtime feed — that is `P2rt`, and the
 * difference between them is the whole point of both existing. So every
 * `realtime` setting reads exactly `+0` here **by construction**, and a reader
 * who takes that as a measurement concludes catalogue D is decorative.
 *
 * Which is `KNOWN-ISSUES.md` #19, and it cost most of Phase 0: an evidence line
 * whose value never changes is not evidence. Marked rather than hidden, because
 * the rows are still worth seeing beside the ones that do move.
 */
const UNMEASURABLE = new Set(
  CATALOGUE.filter((c) => c.group === "realtime").map((c) => c.conflict),
);
const unmeasurable = (label: string) => UNMEASURABLE.has(label.split(":")[0] ?? "");

console.log("");
console.log(`  WHY THE LAZY INTEGRATOR GIVES UP — ${queries} scored journeys`);
console.log("");
console.log("  Each conflict switched on alone, over an otherwise clean world. A");
console.log("  fallback means P2 produced no workable plan and the traveller took");
console.log("  the reference policy instead, which costs exactly what not");
console.log("  integrating costs.");
console.log("");
console.log("  Clean holds the entity set as declared: granularity stays on in every");
console.log("  row including this one, so no row's delta is the cost of publishing a");
console.log("  different number of stops. It therefore gets no row of its own.");
console.log("");
console.log("    conflict                          fell back    over clean    P1-P2");

const line = (r: Row, delta: number | null) =>
  console.log(
    `    ${`${r.label}${unmeasurable(r.label) ? " †" : ""}`.padEnd(34)}  ` +
      `${`${r.fellBack}/${queries}`.padStart(9)}   ` +
      `${(delta === null ? "" : `${delta >= 0 ? "+" : ""}${delta}`).padStart(10)}   ` +
      `${m(r.gapP1P2).padStart(8)}`,
  );

line(clean, null);
for (const r of [...rows].sort((a, b) => b.fellBack - a.fellBack)) {
  line(r, r.fellBack - clean.fellBack);
}
line(declared, declared.fellBack - clean.fellBack);

console.log("");
if (rows.some((r) => unmeasurable(r.label))) {
  console.log("  † P2 plans once on its merged static model and never opens a realtime");
  console.log("    feed — that is P2rt. These rows therefore read +0 by construction,");
  console.log("    not by measurement, and say nothing about whether the setting");
  console.log("    matters. Read them off the P2rt ablation in `npm run gates`.");
  console.log("");
}
console.log("  A cosmetic setting reading exactly +0 is the control group working:");
console.log("  CORECONCEPT.md 2.1 says texture must measure zero, and a row that");
console.log("  drifts off zero means the isolation has broken again (#55).");
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
