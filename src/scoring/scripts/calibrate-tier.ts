// Generate a world whose difficulty is typical of its tier, not a draw from it.
//
//   npm run calibrate:tier <out.world.db> --tier N --seed S
//                          [--shape S] [--candidates K] [--seeds M] [--verify]
//
// Specification: KNOWN-ISSUES.md #42, ROADMAP.md P1M4.
//
// **This is a build-time search, not a runtime mode.** "Closed loop" in this
// project means passengers bound to the player's endpoint so a player's advice
// changes the world (`CORECONCEPT.md` §370) — a Phase 2 concern, outside the
// MVP. Nothing here touches how a run is scored: the MVP stays open loop, the
// world this produces is an ordinary bundle, and the reference solutions appear
// as **measuring instruments** rather than as players.
//
// ---
//
// ## The problem
//
// A tier declares a *density* and the generator samples a catalogue against it,
// which produces a **distribution of difficulties rather than a difficulty**.
// Two independently generated Tier-3 worlds had their `naive` reference differ
// by 5.9 times the worlds' own seed-to-seed noise, while `competent` saw them
// as identical. `TIER_QUOTA` fixed the *composition* of a tier and did not fix
// strength or placement within it (`KNOWN-ISSUES.md` #42).
//
// ## What this does instead
//
// The tier's profile is defined as the **central tendency of what the generator
// produces**, and a shipped world is one that sits near it:
//
//   1. draw K candidate conflict sets over one fixed city;
//   2. screen each on the sensitive reference;
//   3. take the median of those — that is the tier's difficulty, as a property
//      of the generator rather than of whichever seed was tried first;
//   4. ship the candidate closest to it, and optionally verify on the whole
//      profile.
//
// **The city is held fixed and only the conflicts are re-drawn.** The scored
// query set is selected on the network alone, so re-drawing conflicts leaves it
// valid; re-drawing the city would not. It is also the finding that made this
// worth building at all — separating the two seeds showed the conflict draw
// accounts for the entire difference between two same-tier worlds and the
// network draw for none of it.
//
// ## Why a search rather than a narrower generator
//
// Both close the gap; only one keeps the variety. Narrowing what the generator
// may draw — extending the quota to strength — buys agreement by removing
// choices, and `#43` already records that variety is thin at the bottom of the
// ladder. A search **selects among candidates**, so every conflict remains
// available at every strength and two shipped worlds can be composed quite
// differently while asking the same of a solver.
//
// ## What it must not do
//
// **Screening on one reference is not calibrating to one reference.** A world
// selected only for `naive` would be tuned for `naive`, which is `#24`'s trap
// wearing a new hat. `--verify` profiles the winner against all four; without
// it this reports a screened world and says so.
//
// **It must be allowed to fail.** If no candidate lands near the median the
// honest output is a report, not the closest miss with a widened tolerance.

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import {
  REFERENCE_MODES,
  SCREENING_MODE,
  profileWorld,
  headlineOf,
  mean,
  sd,
} from "@tns/scoring";
import { progress } from "./progress.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : fallback;
};
const out = resolve(repoRoot, argv.find((a) => a.endsWith(".db")) ?? "worlds/scratch/tier.world.db");
const tier = flag("--tier", "3");
const seed = Number(flag("--seed", "481516"));
const candidates = Number(flag("--candidates", "6"));
const seedsPerCandidate = Number(flag("--seeds", "2"));
// The other axis (`src/schema/src/shape.ts`). A calibration is per `(tier,
// shape)`: a region and a city of one rung are different places, and the median
// of one says nothing about the middle of the other.
const shape = flag("--shape", "single-centre");
const verify = argv.includes("--verify");

const PORTS = { operator: 9000, control: 9030, player: 9040 };

/**
 * Conflict seeds to try, spread so consecutive candidates do not draw adjacent
 * streams from the same generator.
 */
const conflictSeeds = Array.from({ length: candidates }, (_, i) => seed + i * 7919);

function build(conflictSeed: number, target: string): void {
  const result = spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      join(repoRoot, "scripts", "generate-world.mjs"),
      target,
      "--tier",
      tier,
      "--seed",
      String(seed),
      "--shape",
      shape,
      "--conflict-seed",
      String(conflictSeed),
    ],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (result.status !== 0) {
    console.error(`  building candidate ${conflictSeed} failed`);
    process.exit(result.status ?? 1);
  }
}

console.log("");
console.log(`  TIER CALIBRATION — tier ${tier}, ${shape}, city seed ${seed}`);
console.log("");
console.log(`  ${candidates} candidate conflict draws over one fixed city, screened on`);
console.log(`  \`${SCREENING_MODE}\` at ${seedsPerCandidate} disruption seeds each.`);
console.log("");

// Beside the world being calibrated, not at one fixed path (KNOWN-ISSUES.md #60).
// A shared candidate file let two calibrations overwrite each other and let any
// reader see whichever draw was in flight, and it overwrote the evidence world
// #57 cites, which survived only because a copy had been made first.
const scratch = out.replace(/\.world\.db$/, "") + ".candidate.world.db";
const bar = progress(candidates, "candidates");
const screened: { conflictSeed: number; headline: number }[] = [];

for (const conflictSeed of conflictSeeds) {
  build(conflictSeed, scratch);
  const world = loadWorld(scratch);
  const profile = await profileWorld(
    repoRoot,
    world,
    [SCREENING_MODE],
    seedsPerCandidate,
    PORTS,
  );
  const headline = headlineOf(profile, SCREENING_MODE);
  if (headline !== null) screened.push({ conflictSeed, headline });
  bar.step(`seed ${conflictSeed}`);
}
bar.done();

if (screened.length === 0) {
  console.error("  no candidate produced a score. Nothing to calibrate against.");
  process.exit(1);
}

// The tier's difficulty, as the generator's central tendency rather than as
// whichever draw happened to be tried first.
const sorted = [...screened].sort((a, b) => a.headline - b.headline);
const median = sorted[Math.floor(sorted.length / 2)]!.headline;
// A standard deviation over six draws is owned by whichever draw sits furthest
// out: one poisoned draw made it 0.967 while five sat within 0.054
// (KNOWN-ISSUES.md #50). The span of the middle draws says how far apart two
// shipped worlds are likely to be, which is the question a reader brings to it,
// so it is printed first and the deviation beside it.
const spread = sd(screened.map((s) => s.headline));
const ordered = screened.map((s) => s.headline).sort((a, b) => a - b);
const middle = ordered.length >= 4 ? ordered.slice(1, -1) : ordered;
const middleSpan = middle.length === 0 ? 0 : middle[middle.length - 1]! - middle[0]!;

console.log("");
console.log("    conflict seed   screened headline   distance from median");
for (const s of sorted) {
  console.log(
    `    ${String(s.conflictSeed).padStart(13)}   ${s.headline.toFixed(3).padStart(17)}   ` +
      `${Math.abs(s.headline - median).toFixed(3).padStart(20)}`,
  );
}

const winner = screened.reduce((best, s) =>
  Math.abs(s.headline - median) < Math.abs(best.headline - median) ? s : best,
);

console.log("");
console.log(`  tier ${tier} sits at ${median.toFixed(3)} on \`${SCREENING_MODE}\`, middle ${middle.length} span ${middleSpan.toFixed(3)}, sd ${spread.toFixed(3)}`);
console.log(`  across ${screened.length} draws of the same city.`);
console.log("");
console.log(`  Selected conflict seed ${winner.conflictSeed} at ${winner.headline.toFixed(3)}.`);

// Rebuild the winner at the requested output path.
build(winner.conflictSeed, out);
console.log(`  built ${out}`);

if (verify) {
  console.log("");
  console.log("  Verifying the winner against every reference, not only the screen —");
  console.log("  a world selected for one solver is calibrated for one solver.");
  const vbar = progress(REFERENCE_MODES.length * seedsPerCandidate, "verifying");
  const full = await profileWorld(
    repoRoot,
    loadWorld(out),
    REFERENCE_MODES,
    seedsPerCandidate,
    PORTS,
    (label) => vbar.step(label),
  );
  vbar.done();
  console.log("");
  console.log("    reference    headline");
  for (const mode of REFERENCE_MODES) {
    const pts = full[mode] ?? [];
    console.log(
      `    ${mode.padEnd(12)} ${pts.length === 0 ? "  n/a" : mean(pts.map((p) => p.headline)).toFixed(3)}`,
    );
  }
}

console.log("");
console.log("  The tier's difficulty is the *median of what the generator makes*, so");
console.log("  it is a property of the generator rather than of whichever seed was");
console.log("  tried first. Two worlds calibrated this way may hold quite different");
console.log("  conflicts and still ask the same of a solver — which is the point, and");
console.log("  is what narrowing the generator would have bought at the cost of");
console.log("  variety (KNOWN-ISSUES.md #42, #43).");
console.log("");
