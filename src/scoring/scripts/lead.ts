// How much warning does the world give, and can a stale feed hide any of it?
//
//   npm run lead [world.db] [seed]
//
// Specification: SCORING.md §5, KNOWN-ISSUES.md #19, TIME-MODEL.md.
//
// `npm run information` measured four candidate Information formulas across
// twelve paired seeds and found **none** of them able to distinguish the
// declared world from one with honest values — including two built to be far
// more sensitive than the current one. That rules out the diagnosis #19 records
// ("the insensitivity is in the scoring formula") and points somewhere else.
//
// The defect audit had already said where, in a line nobody had read closely:
//
//   ok  D-staleness:sudbahn  feed is stamped τ−300s, and hides 0 disruption(s)
//                            that are already true
//
// A feed that lags five minutes hides nothing if every disruption is announced
// forty minutes before anyone must act on it. This measures that lead directly,
// against the staleness a *plausible* feed can have, so the question becomes
// arithmetic rather than argument.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld, generateDisruptions } from "@tns/core";
import { CATALOGUE } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const arg = process.argv[2];
const worldPath =
  arg && !/^\d+$/.test(arg) ? resolve(repoRoot, arg) : join(repoRoot, "worlds", "m1.world.db");
const seedArg = arg && /^\d+$/.test(arg) ? arg : process.argv[3];

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const seed = Number(seedArg ?? world.manifest.seed);
const disruptions = generateDisruptions(world.journeys, seed);

const ceiling = Number(
  CATALOGUE.find((s) => s.conflict === "D-staleness")?.plausible?.max ?? 900,
);
const settings = (CATALOGUE.find((s) => s.conflict === "D-staleness")?.generate ?? []).map(Number);

// The lead a disruption gives: from the moment the world announces it to the
// moment the affected journey was due to start. A traveller must commit before
// that, so this is an upper bound on the window a warning has to arrive in —
// the generous reading, which the finding below survives.
const startOf = new Map(world.journeys.map((j) => [j.id, j.startS]));
const leads = disruptions
  .map((d) => (startOf.get(d.journeyId) ?? 0) - d.announcedAtS)
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);

if (leads.length === 0) {
  console.error("  This world's disruptions carry no announcement time; nothing to measure.");
  process.exit(1);
}

const q = (p: number): number => leads[Math.min(leads.length - 1, Math.floor(p * leads.length))]!;
const m = (s: number) => `${(s / 60).toFixed(1)}m`;

console.log("");
console.log(`  ANNOUNCEMENT LEAD — ${disruptions.length} disruptions, seed ${seed}`);
console.log("");
console.log("  From the instant the world announces a disruption to the instant the");
console.log("  affected service was due to leave. A stale feed can only hide a");
console.log("  disruption whose lead is shorter than the lag.");
console.log("");
console.log(`    minimum   ${m(leads[0]!).padStart(8)}`);
console.log(`    10th %    ${m(q(0.1)).padStart(8)}`);
console.log(`    median    ${m(q(0.5)).padStart(8)}`);
console.log(`    90th %    ${m(q(0.9)).padStart(8)}`);
console.log(`    maximum   ${m(leads[leads.length - 1]!).padStart(8)}`);
console.log("");
console.log("    staleness      hides   share of all disruptions");
for (const s of [...settings, ceiling].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b)) {
  const hidden = leads.filter((l) => l < s).length;
  const pct = ((hidden / leads.length) * 100).toFixed(0);
  console.log(
    `    ${`${s}s`.padStart(9)}   ${String(hidden).padStart(9)}   ${pct.padStart(3)}%` +
      (s === ceiling ? "   <- the plausibility ceiling" : ""),
  );
}
console.log("");
console.log("  If the ceiling row hides nothing, `D-staleness` cannot be made");
console.log("  load-bearing by tuning the score, and cranking the setting is closed");
console.log("  by the realism constraint. The lever is the world: a disruption");
console.log("  announced closer to departure is both harder and more realistic than");
console.log("  a feed that lags half an hour.");
console.log("");
