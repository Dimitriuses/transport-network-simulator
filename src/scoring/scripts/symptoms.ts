// The symptom check — Gate 1a's companion, KNOWN-ISSUES.md #22.
//
//   npm run symptoms [seed]
//
// Specification: PHASES.md, "What can be checked now, without people".
//
// The identifiability audit asks whether the information needed to reconcile a
// world is present. This asks the other half: whether a player charged for a
// conflict is given anything to notice.
//
// **A conflict that silently subtracts capture with no observable consequence
// is not difficult, it is arbitrary.** The player loses and has no thread to
// pull, and no amount of skill converts into a better score. That is the
// failure mode PLAYTEST-KIT.md §5 calls "the gate fails, informatively", and it
// is the one discoverability problem catchable without a person in the room.
//
// The check must find a *symptom*, never a diagnosis. OBSERVABILITY.md §8
// defaults to `attributed` disclosure precisely because naming a cause hands
// over the answer key:
//
//   "three travellers missed a connection you budgeted at 60s that took 210s"
//     — a thread to pull.
//   "C-coordinate-offset:nordline cost you 0.54 min"
//     — the solution.
//
// What is verified is that the first exists.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { runOpenLoop } from "@tns/server";
import { conflictVariants, valueCleanWorld, scoreRun } from "@tns/scoring";
import type { World } from "@tns/schema";
import { progress } from "./progress.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const seed = Number(process.argv[2] ?? world.manifest.seed);
const reseed = (w: World): World => ({ ...w, manifest: { ...w.manifest, seed } });

/**
 * Everything about a run a player can actually see in its own scorecard.
 *
 * Deliberately *not* the score. A conflict that moves the number and nothing
 * else is exactly the case this exists to catch, so including the number would
 * make the check pass on the strength of the thing it is testing for.
 */
interface Observed {
  readonly signs: string[];
  /** What this conflict cost **the same solver**, in the same run. */
  readonly capture: number | null;
}

function symptoms(log: Awaited<ReturnType<typeof runOpenLoop>>): Observed {
  const card = scoreRun(log, { tier: world.manifest.tier });
  const out: string[] = [];

  for (const a of card.attribution) out.push(`cause:${a.cause}=${a.travellers}`);

  const fails = new Map<string, number>();
  for (const r of log) {
    if (r.kind !== "traveller" || r.arrived) continue;
    const k = String(r.failureReason).split(":")[0]!;
    fails.set(k, (fails.get(k) ?? 0) + 1);
  }
  for (const [k, v] of fails) out.push(`fail:${k}=${v}`);

  const i = card.information;
  out.push(`info:silent=${i.silent}`, `info:late=${i.late}`, `info:noisy=${i.noisy}`);
  out.push(`info:inTime=${i.inTime}`, `info:events=${i.materialEvents}`);

  return { signs: out.sort(), capture: card.service.capture };
}

let port = 9900;
async function observe(w: World): Promise<Observed> {
  port += 40;
  const base = port;
  const player = spawn(process.execPath, [join(repoRoot, "src", "refplayer", "scripts", "serve.ts")], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      TNS_PLAYER_PORT: String(base + 900),
      TNS_CONTROL_URL: `http://127.0.0.1:${base + 9}`,
      TNS_PLAYER_MODE: "naive",
    },
  });
  try {
    return symptoms(
      await runOpenLoop({
        world: w,
        playerBaseUrl: `http://127.0.0.1:${base + 900}`,
        operatorPort: base,
        controlPort: base + 9,
      }),
    );
  } finally {
    player.kill();
  }
}

console.log("");
console.log(`  SYMPTOM CHECK — seed ${seed}, ${world.queries.length} scored travellers`);
console.log("");
console.log("  For each declared conflict: does the player-visible output differ");
console.log("  between a world with it and a world without? A conflict that moves");
console.log("  the score and nothing a player can see is arbitrary, not difficult.");
console.log("");

const variants = conflictVariants(world);
// One simulated day per variant, plus the baseline. Each is a real run against
// a real player over HTTP, so this is minutes rather than seconds.
const bar = progress(variants.length + 1, "running");
const baseline = await observe(reseed(valueCleanWorld(world)));
bar.step("honest-values baseline");

const results: { conflict: string; changed: string[]; costS: number }[] = [];
for (const v of variants) {
  const seen = await observe(reseed(v.world));
  bar.step(v.conflict);
  const before = new Set(baseline.signs);
  const after = new Set(seen.signs);
  const changed = [
    ...seen.signs.filter((x) => !before.has(x)).map((x) => `+${x}`),
    ...baseline.signs.filter((x) => !after.has(x)).map((x) => `-${x}`),
  ].sort();
  // **Cost measured on the same solver, in the same run as the symptom.**
  // Reading a cost off `npm run probe` instead would compare a symptom seen by
  // the reference player against a cost paid by P2rt — two different lazy
  // solvers, which is the confound Gate 3 was corrected for.
  const costS =
    seen.capture !== null && baseline.capture !== null ? baseline.capture - seen.capture : 0;
  results.push({ conflict: v.conflict, changed, costS });
}

bar.done();

results.sort((a, b) => b.costS - a.costS || (a.conflict < b.conflict ? -1 : 1));

console.log("  conflict                          costs  visible symptom");
console.log("  --------------------------------  -----  --------------------------------");
for (const r of results) {
  const cost = r.costS.toFixed(3).padStart(5);
  const first = r.changed[0] ?? "none — nothing a player could notice";
  console.log(`  ${r.conflict.padEnd(32)}  ${cost}  ${first}`);
  for (const extra of r.changed.slice(1, 3)) console.log(`  ${"".padEnd(32)}         ${extra}`);
  if (r.changed.length > 3) console.log(`  ${"".padEnd(32)}         ...and ${r.changed.length - 3} more`);
}

const silent = results.filter((r) => r.changed.length === 0);
console.log("");
console.log(
  `  ${results.length - silent.length} of ${results.length} declared conflicts produce a visible symptom.`,
);
console.log("");

// **Silent and costly is the combination that makes a world arbitrary.** A
// conflict costing nothing *should* be invisible — a cosmetic one, for
// instance — so silence alone is not a fault. Both figures come from the same
// runs of the same solver, so this is a claim about one player rather than a
// comparison across two.
const COST_FLOOR = 0.01;
const arbitrary = silent.filter((r) => r.costS > COST_FLOOR);

if (arbitrary.length > 0) {
  console.log("  ARBITRARY — these cost the player capture and show it nothing:");
  for (const r of arbitrary) console.log(`    ${r.conflict.padEnd(34)} ${r.costS.toFixed(3)}`);
  console.log("");
  console.log("  A player losing this much with no observable consequence cannot");
  console.log("  convert skill into score. That is not difficulty (PLAYTEST-KIT.md §5).");
  console.log("");
} else if (silent.length > 0) {
  console.log("  Every silent conflict also costs this solver nothing, which is the");
  console.log("  expected result for texture. Nothing here is arbitrary.");
  console.log("");
}

if (silent.length > 0) {
  console.log("  Silent but free, where zero symptom is the right answer:");
  for (const r of silent.filter((x) => x.costS <= COST_FLOOR)) {
    console.log(`    ${r.conflict.padEnd(34)} ${r.costS.toFixed(3)}`);
  }
  console.log("");
}

console.log("  One seed. A conflict whose symptom depends on which services are");
console.log("  disrupted can be missed here; pass a different seed to check.");
console.log("");
