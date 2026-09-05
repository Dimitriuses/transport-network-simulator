// Can a realtime conflict move the Information family at all?
//
//   npm run information [seeds]
//
// Specification: SCORING.md §5 and its OPEN item, KNOWN-ISSUES.md #19.
//
// The family carries 40 % of the balanced profile and exists to weigh
// truthfulness, which `CORECONCEPT.md` treats as first-class. P0M10 measured it
// moving by **0.001** when ten cancellations went silent. `SCORING.md` lists
// four directions out and chooses none.
//
// This is the evidence for choosing. It runs the same player on the same seeds
// against the declared world and against one with honest *values*, and reports
// what each candidate formula does with the difference — paired by seed, since
// differencing two independent means throws away the structure that makes the
// comparison sharp (`KNOWN-ISSUES.md` #18).
//
// **Sensitivity is not the only criterion, and should not be read as one.** A
// formula can be made arbitrarily sensitive by removing everything that damps
// it; what is wanted is one that moves *because a realtime conflict happened*
// and stays still otherwise. The noise column is there to keep that honest: it
// is the same measurement with the conflicts left alone, so a formula that
// moves as much there is measuring the weather.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { runOpenLoop } from "@tns/server";
import {
  valueCleanWorld,
  informationVariants,
  informationCounts,
  eventsOf,
  scoreRun,
  type InformationCounts,
} from "@tns/scoring";
import type { World } from "@tns/schema";
import { progress } from "./progress.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
// World first, seed count second, matching the other instruments. P1M1 needs
// this against generated worlds: the committed one declares staleness *below*
// its own minimum announcement lead, so it cannot answer the question.
const arg = process.argv[2];
const worldPath =
  arg && !/^\d+$/.test(arg) ? resolve(repoRoot, arg) : join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const base = loadWorld(worldPath);
const seeds = Number((arg && /^\d+$/.test(arg) ? arg : process.argv[3]) ?? 6);

const reseed = (w: World, seed: number): World => ({ ...w, manifest: { ...w.manifest, seed } });

const PORTS = { operator: 8500, control: 8530, player: 8540 };

let baselineChecked = false;
const seenCounts: InformationCounts[] = [];

async function runOn(world: World): Promise<ReturnType<typeof informationVariants>> {
  const player = spawn(
    process.execPath,
    [join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        TNS_PLAYER_PORT: String(PORTS.player),
        TNS_CONTROL_URL: `http://127.0.0.1:${PORTS.control}`,
        TNS_PLAYER_MODE: "naive",
      },
    },
  );
  try {
    const log = await runOpenLoop({
      world,
      operatorPort: PORTS.operator,
      controlPort: PORTS.control,
      playerBaseUrl: `http://127.0.0.1:${PORTS.player}`,
    });
    const events = eventsOf(log);
    const variants = informationVariants(log, events);
    seenCounts.push(informationCounts(log, events));

    // `current` must reproduce what the scorecard actually scores. If it ever
    // stops doing so, every other column is being compared against a baseline
    // nobody uses — which is this project's most-repeated failure.
    if (!baselineChecked) {
      baselineChecked = true;
      const scored = scoreRun(log, { tier: world.manifest.tier }).information.score;
      const mine = variants[0]!.score;
      if (Math.abs(scored - mine) > 1e-9) {
        console.error(
          `  information-variants "current" (${mine.toFixed(6)}) has drifted from the ` +
            `scorecard (${scored.toFixed(6)}). Every column below is measured against ` +
            `a baseline nothing uses. Fix information-variants.ts first.`,
        );
        process.exit(1);
      }
    }
    return variants;
  } finally {
    player.kill();
  }
}

interface Row {
  readonly seed: number;
  readonly declared: readonly number[];
  readonly clean: readonly number[];
  /** Same world twice, different disruption draw — the noise floor. */
  readonly noise: readonly number[];
}

const bar = progress(seeds * 3, "information");
const rows: Row[] = [];

for (let i = 0; i < seeds; i++) {
  const seed = base.manifest.seed + i * 7919;
  const declared = await runOn(reseed(base, seed));
  bar.step(`seed ${seed}, declared`);
  const clean = await runOn(reseed(valueCleanWorld(base), seed));
  bar.step(`seed ${seed}, honest values`);
  // The noise floor: the declared world again, on a neighbouring seed. Any
  // formula whose conflict signal is smaller than this is not measuring the
  // conflict.
  const noise = await runOn(reseed(base, seed + 1));
  bar.step(`seed ${seed}, noise`);
  rows.push({
    seed,
    declared: declared.map((v) => v.score),
    clean: clean.map((v) => v.score),
    noise: noise.map((v) => v.score),
  });
}
bar.done();

const names = informationVariants([], []).map((v) => v);
const stats = (xs: readonly number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (xs.length - 1 || 1));
  return { mean, se: sd / Math.sqrt(xs.length) };
};

console.log("");
console.log(`  INFORMATION FAMILY — CANDIDATE FORMULAS, ${seeds} paired seeds`);
console.log("");
console.log("  Declared world against one with honest values, same seed, same player.");
console.log("  `effect` is the paired mean difference; `noise` is the same difference");
console.log("  between two disruption draws of the *declared* world, which no formula");
console.log("  should react to.");
console.log("");
console.log("    formula          declared    honest     effect      se     noise   effect/noise");

for (const [i, v] of names.entries()) {
  const declared = rows.map((r) => r.declared[i]!);
  const clean = rows.map((r) => r.clean[i]!);
  const noise = rows.map((r) => r.noise[i]!);
  const effect = stats(rows.map((_, k) => clean[k]! - declared[k]!));
  const drift = stats(rows.map((_, k) => Math.abs(noise[k]! - declared[k]!)));
  const ratio = drift.mean === 0 ? Infinity : effect.mean / drift.mean;
  console.log(
    `    ${v.name.padEnd(15)} ${stats(declared).mean.toFixed(4).padStart(8)}  ` +
      `${stats(clean).mean.toFixed(4).padStart(8)}  ${effect.mean.toFixed(4).padStart(8)}  ` +
      `${effect.se.toFixed(4).padStart(6)}  ${drift.mean.toFixed(4).padStart(7)}  ` +
      `${(Number.isFinite(ratio) ? ratio.toFixed(1) : "inf").padStart(9)}`,
  );
}

console.log("");
// Every third run is the declared world; the counts below are its mean, which
// is what the `declared` column above was computed from.
const declaredCounts = seenCounts.filter((_, i) => i % 3 === 0);
const avg = (pick: (c: InformationCounts) => number) =>
  (declaredCounts.reduce((a, c) => a + pick(c), 0) / declaredCounts.length).toFixed(1);
console.log("  What the declared world actually produced, per run:");
console.log("");
console.log(
  `    material events ${avg((c) => c.materialEvents).padStart(6)}` +
    `   travellers notified ${avg((c) => c.notified).padStart(6)}`,
);
console.log(
  `    in time         ${avg((c) => c.inTime).padStart(6)}` +
    `   late                ${avg((c) => c.late).padStart(6)}`,
);
console.log(
  `    silent          ${avg((c) => c.silent).padStart(6)}` +
    `   noisy               ${avg((c) => c.noisy).padStart(6)}`,
);
console.log("");
console.log("  Read these first. A formula that cannot see a conflict and a world");
console.log("  that produced nothing to see are indistinguishable in the score");
console.log("  column and are opposite problems.");
console.log("");
for (const v of names) console.log(`    ${v.name.padEnd(15)} ${v.rationale}`);
console.log("");
console.log("  `effect` positive means the honest world scores higher — the conflicts");
console.log("  cost the player something the family can see. The current formula was");
console.log("  measured at 0.001 by npm run symptoms, which is what KNOWN-ISSUES #19");
console.log("  records. A candidate is worth ratifying when its effect clears both its");
console.log("  own standard error and the noise column, not merely when it is larger.");
console.log("");
console.log("  Nothing here is wired into the scorecard. SCORING.md's OPEN item is a");
console.log("  decision about what the family should weigh, and this is its evidence.");
console.log("");
