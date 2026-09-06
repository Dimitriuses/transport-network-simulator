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

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { runOpenLoop } from "@tns/server";
import { scoreRun } from "@tns/scoring";
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

/** The anchors, worst to best by construction. */
const MODES = ["null", "blind", "naive", "competent"] as const;
type Mode = (typeof MODES)[number];

/** Each reference's whole scorecard, not just its headline. */
interface Point {
  readonly headline: number;
  readonly capture: number;
  readonly information: number;
  readonly arrived: number;
}

const PORTS = { operator: 8900, control: 8930, player: 8940 };

async function measure(world: World, mode: string): Promise<Point | null> {
  const player = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "inherit"],
      env: {
        ...process.env,
        TNS_PLAYER_PORT: String(PORTS.player),
        TNS_CONTROL_URL: `http://127.0.0.1:${PORTS.control}`,
        TNS_PLAYER_MODE: mode,
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
    const card = scoreRun(log, { tier: world.manifest.tier });
    if (card.headline === null) return null;
    return {
      headline: card.headline,
      // `capture` is null when nothing was comparable — treat that as a
      // missing point rather than a zero, which would read as "no better than
      // not integrating" and is a different claim entirely.
      capture: card.service.capture ?? Number.NaN,
      information: card.information.score,
      arrived: card.service.arrived / Math.max(1, card.service.travellers),
    };
  } finally {
    player.kill();
  }
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: readonly number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
};

/** Every reference's points across seeds, for one world. */
type Profile = Record<Mode, Point[]>;

const bar = progress(paths.length * MODES.length * seeds, "profiling");

async function profileOf(path: string): Promise<{ world: World; profile: Profile }> {
  const base = loadWorld(resolve(repoRoot, path));
  const profile = Object.fromEntries(MODES.map((m) => [m, [] as Point[]])) as Profile;
  for (let i = 0; i < seeds; i++) {
    // Only the disruptions change: same city, same timetable, same conflicts.
    const world: World = { ...base, manifest: { ...base.manifest, seed: base.manifest.seed + i * 7919 } };
    for (const mode of MODES) {
      const point = await measure(world, mode);
      if (point) profile[mode].push(point);
      bar.step(`${mode} seed ${i + 1}`);
    }
  }
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
    const pts = r.profile[mode];
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
    const pa = a.profile[mode];
    const pb = b.profile[mode];
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
