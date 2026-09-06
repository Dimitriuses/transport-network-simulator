// What it takes to clear this world's tier, measured against its own references.
//
//   npm run clearance [world.db]
//
// Specification: SCORING.md, `@tns/schema` `clearance.ts`, ROADMAP.md P1M4.
//
// **A tier's bar is a position between two named reference solutions**, so
// deciding it needs those solutions' scores *on this world*. A scorecard is a
// pure function of one run log and cannot know them — which is why clearance
// left `scoreRun` and arrived here.
//
// The bar it replaces was a decimal, chosen while `capture` normalised against
// the clairvoyant `P0`. The denominator moved to `P0a`, every score rescaled by
// about 2.6, the table did not, and every tier quietly became far harder than
// its number had been chosen to mean. **A decimal cannot state its intent, so
// nothing could notice.** "Beat a lazy integrator" can, and moves with the
// scale on its own.
//
// The four references are the ones `npm run gates` already runs, and they are
// ordered by construction: `null` declines everything, `blind` ignores realtime,
// `naive` integrates lazily, `competent` does the job.
//
// Writes `<world>.clearance.json` beside the bundle, so a player's scorecard can
// be judged later without running four solutions again.

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { runOpenLoop } from "@tns/server";
import { scoreRun } from "@tns/scoring";
import { CLEARANCE_LADDER, clearanceBar, clears } from "@tns/schema";
import { progress } from "./progress.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const arg = process.argv[2];
const worldPath = arg ? resolve(repoRoot, arg) : join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);

/** The anchors, worst to best. Order is by construction, not by measurement. */
const MODES = ["null", "blind", "naive", "competent"] as const;
const PORTS = { operator: 8800, control: 8830, player: 8840 };

async function scoreOf(mode: string): Promise<number | null> {
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
    return scoreRun(log, { tier: world.manifest.tier }).headline;
  } finally {
    player.kill();
  }
}

const bar = progress(MODES.length, "reference solutions");
const scores: Record<string, number> = {};
for (const mode of MODES) {
  const headline = await scoreOf(mode);
  if (headline !== null) scores[mode] = headline;
  bar.step(mode);
}
bar.done();

const n = (v: number) => (v >= 0 ? " " : "") + v.toFixed(3);

console.log("");
console.log(`  TIER CLEARANCE — declared tier ${world.manifest.tier}, ${world.queries.length} journeys`);
console.log("");
console.log("  Every bar is a position between two of these, so it moves with any");
console.log("  change of scale — denominator, world size, penalty or profile.");
console.log("");
console.log("    reference solution   headline");
for (const mode of MODES) {
  const v = scores[mode];
  console.log(`    ${mode.padEnd(20)} ${v === undefined ? "  n/a" : n(v)}`);
}

// Order is a claim, and a world where it fails is a world whose ladder means
// nothing — the same inversion `KNOWN-ISSUES.md` #38 caught, where declining
// every obligation outscored attempting them.
const ordered = MODES.filter((m) => scores[m] !== undefined);
const inversions = ordered.filter(
  (m, i) => i > 0 && scores[m]! < scores[ordered[i - 1]!]!,
);

console.log("");
console.log(`    tier   bar      asks for${" ".repeat(60)}which references clear it`);
for (const spec of CLEARANCE_LADDER) {
  const computed = clearanceBar(spec.tier, scores);
  const value = computed === null ? "  n/a" : n(computed.bar);
  const marker = spec.tier === world.manifest.tier ? " <-" : "   ";
  // Which of the four would clear this rung. `competent` clearing tier 4 but
  // not 5 is the ladder working: the top must sit above our own answer key.
  const who =
    computed === null
      ? ""
      : MODES.filter((m) => scores[m] !== undefined && clears(scores[m]!, computed.bar)).join(", ");
  console.log(
    `    ${String(spec.tier).padStart(4)}${marker} ${value}   ${spec.because.padEnd(66)}` +
      `${who === "" ? "nothing clears it" : who}`,
  );
}

const own = clearanceBar(world.manifest.tier, scores);
console.log("");
if (own !== null) {
  console.log(
    `  A solution clears this world's tier ${world.manifest.tier} at a headline of ` +
      `${own.bar.toFixed(3)} —`,
  );
  const where =
    own.spec.at === 1
      ? `level with ${own.spec.to}`
      : own.spec.at === 0
        ? `level with ${own.spec.from}`
        : own.spec.at > 1
          ? `past ${own.spec.to}`
          : `between ${own.spec.from} and ${own.spec.to}`;
  console.log(`  ${where}: ${own.spec.because}.`);
} else {
  console.log(`  Tier ${world.manifest.tier} has no bar: an anchor did not score.`);
}

if (inversions.length > 0) {
  console.log("");
  console.log(`  WARNING: the references are out of order (${inversions.join(", ")} ranks`);
  console.log("  below the solution before it). The ladder is anchored on them, so a");
  console.log("  bar built here means nothing until that is explained. See");
  console.log("  KNOWN-ISSUES.md #38 for the last time this happened.");
}

const sidecar = worldPath.replace(/\.world\.db$/, "") + ".clearance.json";
writeFileSync(
  sidecar,
  `${JSON.stringify({ tier: world.manifest.tier, references: scores }, null, 2)}\n`,
  "utf8",
);
console.log("");
console.log(`  written  ${sidecar}`);
console.log("");