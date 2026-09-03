// Phase 0's three proof gates.
//
//   npm run gates
//
// Specification: docs/PHASES.md, Phase 0.
//
// These decide whether the core loop is worth building generators for. Gate 3
// is allowed to stop the project, and this script is deliberately written to
// let it: it reports what it measures, not what anyone hoped.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { runOpenLoop } from "@tns/server";
import { ablate, calibrate, scoreRun, auditInformationSets, valueCleanWorld } from "@tns/scoring";
import type { World } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);

interface Result {
  mode: string;
  capture: number | null;
  information: number;
  headline: number | null;
  arrived: string;
  arrivedN: number;
  travellers: number;
  clean: boolean;
}

async function measure(mode: string, base: number, against: World = world): Promise<Result> {
  const player = spawn(
    process.execPath,
    [join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        TNS_PLAYER_PORT: String(base + 900),
        TNS_CONTROL_URL: `http://127.0.0.1:${base + 9}`,
        TNS_PLAYER_MODE: mode,
      },
    },
  );
  try {
    const log = await runOpenLoop({
      world: against,
      playerBaseUrl: `http://127.0.0.1:${base + 900}`,
      operatorPort: base,
      controlPort: base + 9,
    });
    const card = scoreRun(log, { tier: against.manifest.tier });
    const audit = auditInformationSets(against, log);
    return {
      mode,
      capture: card.service.capture,
      information: card.information.score,
      headline: card.headline,
      arrived: `${card.service.arrived}/${card.service.travellers}`,
      arrivedN: card.service.arrived,
      travellers: card.service.travellers,
      clean: audit.clean,
    };
  } finally {
    player.kill();
  }
}

const n = (v: number | null, d = 3): string => (v === null ? "  n/a" : v.toFixed(d));
const mins = (s: number): string => `${(s / 60).toFixed(2)}m`;

console.log("");
console.log("  PHASE 0 PROOF GATES");
console.log(`  world seed ${world.manifest.seed} · tier ${world.manifest.tier} · ` +
  `${world.manifest.operators.length} operators · ${world.manifest.activeConflicts.length} conflicts`);
console.log("");

// ---------------------------------------------------------------------------

const modes = ["null", "blind", "naive", "competent"];
const results: Result[] = [];
let port = 9400;
for (const m of modes) {
  results.push(await measure(m, port));
  port += 20;
}

console.log("  solutions, worst to best");
console.log("  mode        capture   information   headline   arrived   audit");
console.log("  ---------   -------   -----------   --------   -------   -----");
for (const r of results) {
  console.log(
    `  ${r.mode.padEnd(9)}   ${n(r.capture).padStart(7)}   ${n(r.information).padStart(11)}` +
      `   ${n(r.headline).padStart(8)}   ${r.arrived.padStart(7)}   ${r.clean ? "clean" : "LEAK"}`,
  );
}
console.log("");

const competent = results.find((r) => r.mode === "competent")!;

// ---- Gate 1 ---------------------------------------------------------------
console.log("  GATE 1 — buildable");
const g1 = (competent.capture ?? -1) > 0 && (competent.headline ?? -1) > 0.2;
console.log(`    a solution built only from the brief and the operator APIs`);
console.log(`    captures ${n(competent.capture)} of the headroom, headline ${n(competent.headline)}`);
console.log(`    ${g1 ? "PASS" : "FAIL"} — needs capture above 0 and a headline above 0.20`);
console.log("");
console.log("    Caveat, and it is not a small one: the competent solution was");
console.log("    written by someone who had seen the world. A real Gate 1 needs");
console.log("    somebody who has not. This measures whether the world is");
console.log("    *solvable*, not whether it is discoverable.");
console.log("");

// ---- Gate 2 ---------------------------------------------------------------
console.log("  GATE 2 — headroom real and discriminating");
const cal = calibrate(world);
// **Separation and ordering are different questions, and this used to conflate
// them.** The spread was `competent - null`, which measures separation only if
// the competent solution is in fact the best. At P0M10 it was not — a bug in
// the replan handler had it answering `no_route` to every replan — and Gate 2
// reported a spread of 0.005 for a set of solutions actually spanning 0.299.
//
// A gate that fails for the wrong reason is worse than one that fails: it
// sends you looking at the world when the fault is in the solution.
const scores = results.map((r) => r.headline ?? 0);
const spread = Math.max(...scores) - Math.min(...scores);
const distinct = new Set(results.map((r) => n(r.headline))).size;
const bestIsCompetent = (competent.headline ?? 0) >= Math.max(...scores) - 1e-9;
const g2 = cal.gapP0P1 > 60 && spread > 0.2 && distinct >= 3;
console.log(`    P0-P1 headroom            ${mins(cal.gapP0P1)}`);
console.log(`    spread, best to worst     ${n(spread)} of headline`);
console.log(`    distinct headline scores  ${distinct} of ${results.length}`);
console.log(`    ${g2 ? "PASS" : "FAIL"} — solutions of different quality must separate visibly`);
if (!bestIsCompetent) {
  console.log("");
  console.log("    NOTE: the competent solution is not the best-scoring one here.");
  console.log("    Solutions do separate; they are in the wrong order. That is a");
  console.log("    fact about the reference solution, and it belongs to Gate 1 —");
  console.log("    see docs/KNOWN-ISSUES.md #17.");
}
console.log("");

// ---- Gate 3 ---------------------------------------------------------------
console.log("  GATE 3 — the conflicts are doing the work");
console.log("");
console.log("    Measured across the WHOLE score, from real runs of the naive");
console.log("    reference player against this world and against the same world");
console.log("    publishing HONEST VALUES for exactly the same stops.");
console.log("");
console.log("    The entity set is held fixed: same operators, same granularity,");
console.log("    same number of published stops. Switching granularity off too");
console.log("    would change how much data the solver is given, and its error");
console.log("    rate scales with that — the comparison would vary the problem");
console.log("    and its difficulty at once (KNOWN-ISSUES.md #14).");
console.log("");
console.log("    Capture alone is journey time, and journey time is the family");
console.log("    realistic conflicts move least. Staleness costs a traveller a");
console.log("    third of a minute of travel — its real damage is that nobody");
console.log("    warned them, which lands entirely in the Information family and");
console.log("    was invisible to this gate until P0M8. Information can only be");
console.log("    observed from a run: a routing model warns nobody.");
console.log("");

// **Averaged over seeds, not a single draw.** P0M9 measured what one run is
// worth: with only the disruptions changing, conflict cost varies by 36 % of
// its own mean. The gate has to decide a 20 % question, so a single pair of
// runs would be comparing two draws from overlapping distributions.
const GATE3_SEEDS = Number(process.env["TNS_GATE3_SEEDS"] ?? 5);
const reseed = (w: World, seed: number): World => ({
  ...w,
  manifest: { ...w.manifest, seed },
});

const declaredRuns: Result[] = [];
const cleanRuns: Result[] = [];
for (let i = 0; i < GATE3_SEEDS; i++) {
  const seed = world.manifest.seed + i * 7919;
  declaredRuns.push(await measure("naive", 9500 + i * 40, reseed(world, seed)));
  cleanRuns.push(await measure("naive", 9520 + i * 40, reseed(valueCleanWorld(world), seed)));
}

const avg = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: readonly number[]) => {
  const m = avg(xs);
  return Math.sqrt(avg(xs.map((x) => (x - m) * (x - m))));
};
const headlines = (rs: readonly Result[]) => rs.map((r) => r.headline ?? 0);

const summarise = (rs: readonly Result[]): Result => ({
  mode: rs[0]!.mode,
  capture: avg(rs.map((r) => r.capture ?? 0)),
  information: avg(rs.map((r) => r.information)),
  headline: avg(headlines(rs)),
  arrived: `${(avg(rs.map((r) => r.arrivedN))).toFixed(0)}/${rs[0]!.travellers}`,
  arrivedN: avg(rs.map((r) => r.arrivedN)),
  travellers: rs[0]!.travellers,
  clean: rs.every((r) => r.clean),
});

const declaredRun = summarise(declaredRuns);
const cleanRun = summarise(cleanRuns);

const hDeclared = declaredRun.headline ?? 0;
const hClean = cleanRun.headline ?? 0;
const conflictCost = hClean - hDeclared; // = mean(diffs), by construction
// **The standard error of the difference of two means**, not the spread of
// individual runs.
//
// Getting this wrong is easy and was got wrong first: comparing the effect to
// the run-to-run standard deviation asks "could one run land here by chance",
// when the quantity on the table is an average of several. Averaging is the
// whole point of taking more than one seed, and the uncertainty of a mean
// shrinks as 1/sqrt(n) while the spread of single runs does not shrink at all.
//
// The consequence of the mistake was a gate that could never resolve anything
// however many seeds it was given.
// **Paired by seed.** The two worlds are run on the same disruption draws, so
// the difference can be taken run by run and the day cancels out of it.
//
// Differencing two independent means instead throws that away and carries the
// full seed-to-seed variation in the answer — which is why going from 5 seeds
// to 12 moved the standard error from 0.076 to 0.081 rather than shrinking it:
// the extra seeds were spent re-measuring a variance the design need never
// have had.
const diffs = declaredRuns.map((d, i) => (cleanRuns[i]!.headline ?? 0) - (d.headline ?? 0));
const costSe = sd(diffs) / Math.sqrt(Math.max(1, diffs.length));

const row = (label: string, r: Result) =>
  console.log(
    `    ${label.padEnd(22)} ${n(r.headline)}   ${n(r.capture)}   ${n(r.information)}   ${r.arrived}`,
  );

console.log(`    Mean of ${GATE3_SEEDS} seeds per world.`);
console.log("");
console.log("                           headline  capture  information  arrived");
row("this world", declaredRun);
row("honest values", cleanRun);
console.log("");
console.log(
  `    conflicts cost   ${n(conflictCost)} of the score  ` +
    `(standard error ${n(costSe)}, ${(Math.abs(conflictCost) / Math.max(1e-9, costSe)).toFixed(1)}σ)`,
);
console.log("");

// The headline already runs 0 (no better than a city with no integration
// layer) to 1 (perfect), so a difference in it *is* a share of what a player
// competes for. No separate headroom division is needed, and none should be
// invented — that was where the old gate hid the oracle's foresight.
const materiality = conflictCost;

// Retained as a diagnostic, on journey time alone, so the two are comparable
// against every number recorded before P0M8.
const ab = ablate(world, GATE3_SEEDS);
const captureCost = ab.baselineGapS - ab.cleanGapS;
console.log(`    for comparison, on journey time alone:`);
console.log(`      excluded — P0's unreachable foresight      ${mins(ab.clairvoyanceS)}`);
console.log(`      lazy shortfall vs a matched optimum        ${mins(ab.baselineGapS)}`);
console.log(`      the same, conflicts off                    ${mins(ab.cleanGapS)}`);
console.log(`      caused by conflicts                        ${mins(captureCost)}` +
  ` (${((captureCost / ab.headroomS) * 100).toFixed(0)}% of ${mins(ab.headroomS)} headroom)`);
console.log("");

if (ab.entries.some((e) => Math.abs(e.costS) > 1)) {
  console.log("    per-conflict on journey time, each acting alone:");
  for (const e of ab.entries.filter((x) => Math.abs(x.costS) > 1).slice(0, 8)) {
    console.log(`      ${mins(e.costS).padStart(7)}  ${e.conflict}`);
  }
  console.log("      (leave-one-in: these over-sum, and the overlap is the");
  console.log("       redundancy itself — KNOWN-ISSUES.md #7)");
  console.log("");
}

if (captureCost < 0 || ab.cleanGapS > 30) {
  console.log("    WARNING: the conflict-free world is not behaving as a floor.");
  console.log("    Conflict attribution by subtraction is unsound when it does");
  console.log("    not. See docs/KNOWN-ISSUES.md #14.");
  console.log("");
}

// **What can this measurement actually resolve?** Arrival is binary and there
// are only 22 travellers, so one of them changing outcome moves the headline by
// more than the effect being measured. Reporting a number smaller than the
// instrument's own resolution as a finding is how a noisy run becomes a
// recorded fact — this project has done that once already.
console.log(
  `    ${declaredRun.travellers} scored travellers per run, ${GATE3_SEEDS} seeds per world. ` +
    `Individual runs`,
);
console.log(
  `    scatter by ${n(sd(headlines(declaredRuns)))}, but the same-seed difference`,
);
console.log(
  `    only by ${n(sd(diffs))} — so the mean difference carries ${n(costSe)}.`,
);
console.log("");

// Two standard errors, which is the ordinary bar for claiming an effect is
// there at all. Reporting a 1-sigma difference as a finding is how a noisy run
// becomes a recorded fact — this project has done that once already, and the
// 61 % Gate 3 pass stood for four milestones because of it.
const SIGMA = 2;
const resolvable = Math.abs(conflictCost) > SIGMA * costSe;
const g3 = resolvable && materiality > 0.2;

if (!resolvable) {
  const needed = Math.ceil(
    GATE3_SEEDS * (SIGMA * costSe / Math.max(1e-9, Math.abs(conflictCost))) ** 2,
  );
  console.log(`    INCONCLUSIVE — the effect is under ${SIGMA} standard errors.`);
  console.log("");
  console.log("    Not a result about the conflicts, and not a failure. The");
  console.log("    difference is not yet separable from the variation between");
  console.log("    seeds of the same world.");
  console.log("");
  console.log(`    At this effect size, roughly ${needed} seeds would settle it:`);
  console.log(`      TNS_GATE3_SEEDS=${needed} npm run gates`);
} else {
  console.log(`    ${g3 ? "PASS" : "FAIL"} — the declared conflicts must cost at least 20% of the score`);
}
console.log("");
// ---------------------------------------------------------------------------
const all = g1 && g2 && g3;
console.log(
  `  VERDICT: ${all ? "all three gates pass" : resolvable ? "AT LEAST ONE GATE FAILS" : "GATE 3 CANNOT YET BE DECIDED"}`,
);
if (!all && !resolvable) {
  console.log("  Gate 3 did not fail — it could not be measured. A world this small");
  console.log("  cannot resolve the question it asks. See ROADMAP.md P0M9.");
} else if (!all) {
  console.log("  docs/PHASES.md: a failed gate is a legitimate outcome and must be");
  console.log("  allowed to stop the project rather than be tuned away.");
}
console.log("");

process.exit(0);
