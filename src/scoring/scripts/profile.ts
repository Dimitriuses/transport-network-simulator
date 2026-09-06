// A world's difficulty, as a profile over the reference solutions.
//
//   npm run profile <world.db> [other.db] [seeds]
//
// Specification: KNOWN-ISSUES.md #24, ROADMAP.md P1M4.
//
// **Difficulty is a property of the (world, solver) pair, not of the world.**
// P0M10 measured `P2rt` losing 76 % of its headroom to the declared conflicts
// while the naive reference player lost to two of them, and the conflict
// dominating Gate 3 cost it nothing at all. A single number cannot express
// that: two worlds could match on one baseline and differ completely for every
// other solver, and nothing would notice.
//
// So a world's difficulty is the **vector** of what each reference solution
// achieves on it, and two worlds are equally hard when the whole vector matches
// — not when one scalar does.
//
// With a second world, this reports the paired differences and holds them to
// the only bar that means anything: **the spread of the same world measured
// twice.** A difference smaller than a world's own seed-to-seed noise is not a
// difference. That bar is measured here rather than assumed, because a
// tolerance nobody has measured is a guess, and this project has thrown away
// two milestones to guesses of exactly that shape.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import {
  REFERENCE_MODES,
  profileWorld,
  mean,
  sd,
  type DifficultyProfile,
} from "@tns/scoring";
import type { World } from "@tns/schema";
import { progress } from "./progress.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

const argv = process.argv.slice(2);
const paths = argv.filter((a) => a.endsWith(".db"));
const seeds = Number(argv.find((a) => /^\d+$/.test(a)) ?? 3);

if (paths.length === 0) paths.push(join(repoRoot, "worlds", "m1.world.db"));
for (const p of paths) {
  if (!existsSync(resolve(repoRoot, p))) {
    console.error(`No world bundle at ${p}.`);
    process.exit(1);
  }
}

// The measurement lives in `@tns/scoring` because `npm run calibrate:tier`
// needs exactly the same one, and a second copy of it would drift — the failure
// this project has recorded four times (`KNOWN-ISSUES.md` #19, #35, #40, #44).
const ALL_MODES = REFERENCE_MODES;

// `--only <mode>` profiles one reference. A full profile is four solutions per
// seed per world and takes tens of minutes; a diagnostic that only needs to
// know whether *one* reference moved should not pay for the other three.
const onlyArg = argv[argv.indexOf("--only") + 1];
const MODES: readonly string[] = argv.includes("--only")
  ? ALL_MODES.filter((m) => m === onlyArg)
  : ALL_MODES;
if (MODES.length === 0) {
  console.error(`unknown reference solution: ${onlyArg}. One of ${ALL_MODES.join(", ")}.`);
  process.exit(2);
}

const PORTS = { operator: 8900, control: 8930, player: 8940 };

type Profile = DifficultyProfile;

const bar = progress(paths.length * MODES.length * seeds, "profiling");

async function profileOf(path: string): Promise<{ world: World; profile: Profile }> {
  const base = loadWorld(resolve(repoRoot, path));
  const profile = await profileWorld(repoRoot, base, MODES, seeds, PORTS, (l) => bar.step(l));
  return { world: base, profile };
}

const results: { path: string; world: World; profile: Profile }[] = [];
for (const p of paths) results.push({ path: p, ...(await profileOf(p)) });
bar.done();

const n = (v: number) => (v >= 0 ? " " : "") + v.toFixed(3);

for (const r of results) {
  console.log("");
  console.log(`  DIFFICULTY PROFILE — ${r.path}`);
  console.log(`  declared tier ${r.world.manifest.tier}, ${r.world.queries.length} journeys, ${seeds} seeds`);
  console.log("");
  console.log("    reference    headline    capture   information   arrived");
  for (const mode of MODES) {
    const pts = r.profile[mode] ?? [];
    if (pts.length === 0) {
      console.log(`    ${mode.padEnd(12)}      n/a`);
      continue;
    }
    console.log(
      `    ${mode.padEnd(12)} ${n(mean(pts.map((p) => p.headline)))}` +
        ` ±${sd(pts.map((p) => p.headline)).toFixed(3)}` +
        `  ${n(mean(pts.map((p) => p.capture)))}` +
        `   ${n(mean(pts.map((p) => p.information)))}` +
        `      ${(mean(pts.map((p) => p.arrived)) * 100).toFixed(0)}%`,
    );
  }
}

if (results.length === 2) {
  const [a, b] = results as [(typeof results)[number], (typeof results)[number]];
  console.log("");
  console.log("  DO THESE TWO WORLDS ASK THE SAME THING?");
  console.log("");
  console.log("  A difference is only a difference if it is larger than the spread of");
  console.log("  one world measured twice. That spread is the `noise` column, taken");
  console.log("  from the same runs — no separate calibration, and no assumed bar.");
  console.log("");
  console.log("    reference     world A    world B   difference    noise   verdict");

  let worst = "";
  let worstRatio = 0;
  for (const mode of MODES) {
    const pa = a.profile[mode] ?? [];
    const pb = b.profile[mode] ?? [];
    if (pa.length === 0 || pb.length === 0) continue;
    const ha = mean(pa.map((p) => p.headline));
    const hb = mean(pb.map((p) => p.headline));
    const diff = Math.abs(ha - hb);
    // The noise a single world shows across seeds, pooled over both.
    const noise = Math.max(sd(pa.map((p) => p.headline)), sd(pb.map((p) => p.headline)));
    const ratio = noise === 0 ? (diff === 0 ? 0 : Infinity) : diff / noise;
    if (ratio > worstRatio) {
      worstRatio = ratio;
      worst = mode;
    }
    console.log(
      `    ${mode.padEnd(12)} ${n(ha)}   ${n(hb)}     ${diff.toFixed(3)}    ${noise.toFixed(3)}   ` +
        `${ratio <= 1 ? "within noise" : `${ratio.toFixed(1)}x noise`}`,
    );
  }

  console.log("");
  if (worstRatio <= 1) {
    console.log("  Every reference solution scores the same on both, to within what one");
    console.log("  world's own disruption draw moves it. **The profiles match.**");
  } else {
    console.log(`  They do not match: \`${worst}\` differs by ${worstRatio.toFixed(1)} times the`);
    console.log("  noise. Matching *some* references is not matching — that is exactly");
    console.log("  the failure a scalar difficulty could not see (KNOWN-ISSUES.md #24).");
  }
  console.log("");
  console.log("  Matching profiles say the worlds are equally hard *in aggregate*. They");
  console.log("  do not say the worlds are hard *in the same way* — only a solution");
  console.log("  built for one and run on the other says that, and it is the harder");
  console.log("  half of P1M4's exit.");
}
console.log("");
