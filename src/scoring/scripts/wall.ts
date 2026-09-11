// Is this world a rung, or is it a wall?
//
//   npm run wall [world.db ...]
//
// Specification: PHASES.md Gate 1b, KNOWN-ISSUES.md #56, #57.
//
// **Gate 1b's two ends and Gate 3's floor, without the ablation.** `npm run gates`
// answers this and a great deal else, and the great deal else costs
// `(2 + conflicts) × seeds` calibrations — 145 on the merged top rung, an hour of
// compute. The two questions *which conflict* and *how much altogether* are
// different questions, and re-sweeping a ladder only ever needed the second.
//
// So this runs two calibrations per seed: the world as declared, and the same
// world publishing honest values. That is enough for both ends of 1b and for
// Gate 3's headline number, and it turns a ladder sweep from most of a day into
// a few minutes. When a rung looks wrong here, `npm run gates` says which
// conflict did it.
//
// **The verdict is `rung-verdict.ts`'s, not this script's.** Until 2026-09-11
// this kept its own copy of the bars, checked only one end of Gate 1b, and so
// printed "rung" for a world a lazy integrator had already won — and it passed
// Gate 3 at exactly 20 % where the gates failed it.
//
// **It decides nothing.** The gates are the gates; this is the cheap screen
// that says which world is worth spending an hour on.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { calibrate, withNoConflicts, pairedCost, rungVerdict } from "@tns/scoring";
import { rungAt } from "@tns/schema";
import { progress } from "./progress.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

/**
 * Three, not the gates' five.
 *
 * This is a screen rather than a verdict, and the quantity it screens on is
 * large where it matters — a wall reads −5.7 against a bar of −1, which no
 * plausible seed-to-seed scatter reaches. A world close enough to a bar for
 * three seeds to be too few is a world to run `npm run gates` against.
 */
const SEEDS = 3;

const args = process.argv.slice(2);
const paths = (args.length > 0 ? args : ["worlds/m1.world.db"]).map((a) => resolve(repoRoot, a));

for (const p of paths) {
  if (!existsSync(p)) {
    console.error(`No world bundle at ${p}. Build it: npm run world:build`);
    process.exit(1);
  }
}

const bar = progress(paths.length * SEEDS * 2, "calibrating");
const m = (s: number) => `${(s / 60).toFixed(2)}m`;
const n = (x: number) => (x >= 0 ? " " : "") + x.toFixed(3);

interface Row {
  readonly label: string;
  readonly rung: string;
  readonly carriesConflict: boolean;
  readonly conflicts: number;
  readonly lazyCapture: number;
  readonly fellBack: number;
  readonly queries: number;
  readonly costS: number;
  readonly headroomS: number;
  readonly matched: number;
}

const rows: Row[] = [];

for (const path of paths) {
  const world = loadWorld(path);
  const clean = withNoConflicts(world);
  const rung = rungAt(world.manifest.tier);

  const seeds = Array.from({ length: SEEDS }, (_, i) => world.manifest.seed + i * 7919);
  const label = path.split(/[\\/]/).pop() ?? path;

  const cals = (w: typeof world) =>
    seeds.map((seed) => {
      const c = calibrate({ ...w, manifest: { ...w.manifest, seed } });
      bar.step(label);
      return c;
    });

  const declaredCals = cals(world);
  const paired = pairedCost(declaredCals, cals(clean));

  // Gate 1b reads this off one calibration at the world's own seed, and this
  // reads it the same way rather than averaging — so the two agree exactly on a
  // world both are pointed at, which is the only way to know this screen is
  // screening the right quantity.
  const cal = declaredCals[0]!;
  const reachableS = cal.gapP0P1 - cal.gapP0P0a;
  rows.push({
    label,
    rung: rung ? rung.id : `tier ${world.manifest.tier}`,
    carriesConflict: rung !== null && rung.sections.length > 0 && !rung.cosmeticOnly,
    conflicts: world.manifest.activeConflicts.length,
    lazyCapture:
      reachableS === 0 ? 1 : (cal.gapP0P1 - (cal.gapP0P0a + cal.gapP0aP2rt)) / reachableS,
    fellBack: cal.perQuery.filter((q) => q.p2rtFellBack).length,
    queries: cal.perQuery.length,
    costS: paired.costS,
    headroomS: paired.headroomS,
    matched: paired.matched,
  });
}
bar.done();

console.log("");
console.log(`  RUNG OR WALL — ${SEEDS} seeds, two calibrations each`);
console.log("");
console.log("  A lazy integrator must lose, and must not lose more than integrating");
console.log("  perfectly could have won. Capture is (P1 - player) / (P1 - P0a), so -1");
console.log("  is exactly that point. Below it the world teaches 'do not attempt this'");
console.log("  (KNOWN-ISSUES.md #56).");
console.log("");
console.log("  world                      rung             lazy    gave up   conflicts cost");
console.log("  ------------------------   --------------   ------  -------   --------------");

for (const r of rows) {
  const share = r.headroomS === 0 ? 0 : r.costS / r.headroomS;
  const verdict = rungVerdict(r.lazyCapture, share, r.carriesConflict).label;
  console.log(
    `  ${r.label.padEnd(24)}   ${r.rung.padEnd(14)}   ${n(r.lazyCapture)}  ` +
      `${`${r.fellBack}/${r.queries}`.padStart(7)}   ` +
      `${`${m(r.costS)} ${(share * 100).toFixed(0)}%`.padStart(12)}  ${verdict}`,
  );
}

console.log("");
console.log("  WALL   a lazy integrator loses more than the whole prize — Gate 1b's");
console.log("         lower end. Run `npm run gates` to see which conflict did it.");
console.log("  easy   a lazy integrator captures 0.5 or more — Gate 1b's upper end.");
console.log("         Doing the obvious thing badly already wins.");
console.log("  thin   conflicts cost under 20% of the headroom, which is Gate 3's");
console.log("         floor. The world is playable and the conflicts are decorative.");
console.log("  n/a    this rung declares no semantic conflict and is not answering");
console.log("         either question (KNOWN-ISSUES.md #52).");
console.log("");
console.log("  All three are failures, and a world can miss two at once. On the top");
console.log("  rung, B-dst-offset made walls, and draws with at most one operator");
console.log("  publishing local_naive came out easy and thin (KNOWN-ISSUES.md #57, #58).");
console.log("");
