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
import {
  ablate,
  ablateStepCount,
  calibrate,
  scoreRun,
  auditInformationSets,
  valueCleanWorld,
} from "@tns/scoring";
import { auditIdentifiability } from "@tns/projections";
import { progress } from "./progress.ts";
import { rungAt } from "@tns/schema";
import type { World } from "@tns/schema";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
// Takes a world path so the gates can be run against a generated bundle, which
// is what P1M1 and P1M4 need of them. Defaults to the committed world.
const worldPath = process.argv[2]
  ? resolve(repoRoot, process.argv[2])
  : join(repoRoot, "worlds", "m1.world.db");

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
    ["--disable-warning=ExperimentalWarning", join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
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
// Each mode is a full simulated day against a real player over HTTP. Sizing the
// bar here rather than counting as we go keeps the estimate honest from the
// first step.
const solutionsBar = progress(modes.length, "solutions");
const results: Result[] = [];
let port = 9400;
for (const m of modes) {
  results.push(await measure(m, port));
  solutionsBar.step(m);
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
//
// **Split into three at P0M10, ratified 2026-09-03** (PHASES.md, Gate 1).
//
// It used to be one number: run the competent reference solution and see how it
// did. That measured the solution, not the world — and it could not survive
// Phase 1, where a fixed solver eventually fails on some generated world while
// a per-world solver makes the gate vacuous.
//
// 1a and 1b are computed from the world alone, need no solution, and run per
// generated world. 1c cannot be computed at all and is a decision.
solutionsBar.done();

const cal = calibrate(world);

// **Which gates this rung is even asking for** (`KNOWN-ISSUES.md` #52).
//
// The gates were ratified against one hand-built Tier-2 world and encode its
// premise: *this world carries difficulty, and the declared conflicts are where
// it comes from.* The bottom rungs of the ladder deliberately carry none —
// `clean` has no conflicts at all and `small-town` has texture, which
// `CORECONCEPT.md` §2.1 establishes measures exactly zero.
//
// So a lazy integrator capturing 0.796 there is not a failure, it is the rung
// working: the rung exists so a world is recognisable as the real problem
// before it is hard. Asking Gate 1b and Gate 3 of it is asking a question it is
// defined not to answer, and answering FAIL would be the instrument's mistake
// rather than the world's.
const rung = rungAt(world.manifest.tier);
const carriesConflict = rung !== null && rung.sections.length > 0 && !rung.cosmeticOnly;
const rungLabel = rung ? `${rung.id}` : `tier ${world.manifest.tier}`;

console.log(`  GATE 1 — buildable        (rung ${rungLabel})`);
console.log("");

// -- 1a: solvable ------------------------------------------------------------
// Two parts. *Existence*: is a good outcome reachable at all? `P0a` answers it
// — if the announcement-limited optimum is no better than the reference policy,
// integration cannot help anybody whatever the conflicts do.
//
// *Identifiability*: can the canonical structure be recovered from what was
// published? A world can be solvable-in-principle and still unfair, and only
// this notices. Charged across the scored population, not to the one traveller
// who suffers most.
const reachableS = cal.gapP0P1 - cal.gapP0P0a;
const ident = auditIdentifiability(world);
const ambiguityShare = cal.gapP0P1 === 0 ? 0 : ident.worstAggregateS / cal.gapP0P1;
const g1a = reachableS > 60 && ambiguityShare <= 0.25;

console.log("    1a — solvable");
console.log(`      reachable headroom, P1 to P0a        ${mins(reachableS)}` +
  ` of ${mins(cal.gapP0P1)} total`);
console.log(`      ambiguity no solver can resolve      ${mins(ident.worstAggregateS)}` +
  `  (${(ambiguityShare * 100).toFixed(0)}% of headroom, bar 25%)`);
console.log(`      ${g1a ? "PASS" : "FAIL"} — a good outcome must be reachable, and recoverable`);
console.log("");

// -- 1b: not trivial ---------------------------------------------------------
// The other way Gate 1 can fail: everyone reaches 0.9 in an hour. A lazy
// integrator that already captures most of the reachable headroom means the
// conflicts are decorative.
const lazyCapture = reachableS === 0 ? 1 : (cal.gapP0P1 - (cal.gapP0P0a + cal.gapP0aP2rt)) / reachableS;

// **How often the lazy integrator stopped integrating.** `P2` falling back to
// `P1` means it produced no workable plan of its own: on those journeys it is
// not a lazy integration, it is no integration. The share matters twice over —
// it is evidence beside 1b, and it is Gate 3's precondition below.
const fellBack = cal.perQuery.filter((q) => q.p2rtFellBack).length;
const fallbackShare = cal.perQuery.length === 0 ? 0 : fellBack / cal.perQuery.length;

// **And the other end of the same axis** (`KNOWN-ISSUES.md` #56).
//
// 1b asked only whether a lazy integrator does *too well*. Nothing asked
// whether it does so badly that the world has stopped being a puzzle, and a
// world where the conflicts cost it five times the entire headroom passed every
// gate: Gate 3 said PASS at 488 %, which is a true answer to Gate 3's question
// — *are the conflicts doing the work* — and the wrong verdict on the world.
//
// **The bar is a position, not a decimal.** `capture` is
// `(P1 − player) / (P1 − P0a)`, so −1 is the point where `P2rt − P1` equals
// `P1 − P0a`: **integrating lazily loses exactly as much as integrating
// perfectly would have won.** Below that the damage from trying exceeds the
// whole prize, and the world teaches "do not attempt this" rather than "do this
// carefully" — which inverts `CORECONCEPT.md` §2.1's premise.
//
// Negative is expected and is not the failure: Phase 0's own world ran its
// reference players at −0.232 and passed. Losing *more than the prize* is.
//
// **Anchored inside the calibration on purpose.** `null` scores −1.000 as a
// scorecard and it is tempting to read the bar off it, but that is a different
// instrument: on the merged top rung this calibration reads −5.672 for the same
// lazy behaviour the HTTP naive player reads −0.238 for, a factor of 24.
// P0M10 measured a factor of 3.5 between two solvers and `#20` is what comes of
// carrying a number across that seam. The coincidence with `null` is worth
// noticing and is not the definition.
const LAZY_LOSS_LIMIT = -1;
const notTrivial = lazyCapture < 0.5;
const notAWall = lazyCapture >= LAZY_LOSS_LIMIT;
const g1b = !carriesConflict || (notTrivial && notAWall);
console.log("    1b — not trivial, and not a wall");
console.log(`      a lazy integrator captures           ${n(lazyCapture)} of reachable headroom`);
console.log(`      ...and gave up entirely on            ${fellBack}/${cal.perQuery.length}` +
  ` journeys (${(fallbackShare * 100).toFixed(0)}%)`);
if (!carriesConflict) {
  console.log("      n/a — this rung declares no semantic conflict, so a lazy");
  console.log("      integrator doing well is the rung working (KNOWN-ISSUES.md #52)");
} else if (!notTrivial) {
  console.log("      FAIL — doing the obvious thing badly must not already win");
} else if (!notAWall) {
  console.log(`      FAIL — a lazy integrator loses ${n(-lazyCapture)} times the reachable`);
  console.log("      headroom by trying. Below -1 the damage from integrating badly");
  console.log("      exceeds everything integrating perfectly could have won, so the");
  console.log("      world teaches 'do not attempt this'. That is a wall rather than");
  console.log("      a rung, and Gate 3 cannot see it — the conflicts are doing the");
  console.log("      work, and far too much of it (KNOWN-ISSUES.md #56).");
} else {
  console.log("      PASS — doing the obvious thing badly must not already win,");
  console.log("      and must not cost more than doing it perfectly could gain");
}
console.log("");

// -- 1c: discoverable --------------------------------------------------------
console.log("    1c — discoverable      PASS by decision (2026-09-04)");
console.log("      Removed from the MVP: nothing computable evaluates it, and a");
console.log("      gate that cannot be evaluated should not sit in the exit");
console.log("      criteria pretending to be one. It returns in Phase 3 as");
console.log("      generated verifier quests. **This is scope, not evidence** —");
console.log("      what is known about this world's discoverability is nothing.");
console.log("");

const g1 = g1a && g1b;

// -- the reference solution, demoted -----------------------------------------
// Reported because a world that has become accidentally unsolvable by a
// reasonable strategy is worth noticing. It decides nothing: a solution written
// by whoever built the world was never evidence about buildability, and P0M10
// spent a milestone proving it.
console.log("    regression detector — not a gate");
console.log(`      the competent reference solution captures ${n(competent.capture)},` +
  ` headline ${n(competent.headline)}`);
if ((competent.capture ?? 0) < 0) {
  console.log("      It is below the reference policy. See KNOWN-ISSUES.md #17 and #26:");
  console.log("      on most of this world's journeys there is no reachable headroom,");
  console.log("      and any extra leg is exposed to a cancellation nobody announced.");
}
console.log("");

// ---- Gate 2 ---------------------------------------------------------------
console.log("  GATE 2 — headroom real and discriminating");
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

const gate3Bar = progress(GATE3_SEEDS * 2, "gate 3 runs");
const declaredRuns: Result[] = [];
const cleanRuns: Result[] = [];
for (let i = 0; i < GATE3_SEEDS; i++) {
  const seed = world.manifest.seed + i * 7919;
  declaredRuns.push(await measure("naive", 9500 + i * 40, reseed(world, seed)));
  gate3Bar.step(`seed ${seed}, declared`);
  cleanRuns.push(await measure("naive", 9520 + i * 40, reseed(valueCleanWorld(world), seed)));
  gate3Bar.step(`seed ${seed}, honest values`);
}
gate3Bar.done();

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

// The headline runs 0 (no better than a city with no integration layer) to 1
// (perfect), so a difference in it is already a share of what a player competes
// for and needs no separate division. It is reported for that reason and is not
// what the gate decides on — see the criterion below.
// Retained as a diagnostic, on journey time alone, so the two are comparable
// against every number recorded before P0M8.
const ablationBar = progress(ablateStepCount(world, GATE3_SEEDS), "ablating");
const ab = ablate(world, GATE3_SEEDS, (label) => ablationBar.step(label));
ablationBar.done();
const captureCost = ab.baselineGapS - ab.cleanGapS;

// **The criterion is journey time against headroom, measured on `P2rt`**
// (ratified 2026-09-03, PHASES.md Gate 3). The whole-score figure above is a
// diagnostic and decides nothing.
//
// The two differ mostly by *which solver they measure* — `P2rt` is specified in
// REFERENCE-POLICY.md §2, the naive player is an implementation that could
// change next week and take the gate with it — and by the Information family,
// which no declared conflict moves (KNOWN-ISSUES.md #19). This script decided
// on the whole-score number until P0M10, which contradicted the ratified
// criterion; the numbers below are unchanged, only which one is binding.
const materiality = ab.headroomS === 0 ? 0 : captureCost / ab.headroomS;
console.log(`    for comparison, on journey time alone:`);
console.log(`      excluded — P0's unreachable foresight      ${mins(ab.clairvoyanceS)}`);
console.log(`      lazy shortfall vs a matched optimum        ${mins(ab.baselineGapS)}`);
console.log(`      the same, conflicts off                    ${mins(ab.cleanGapS)}`);
console.log(`      caused by conflicts                        ${mins(captureCost)}` +
  ` (${((captureCost / ab.headroomS) * 100).toFixed(0)}% of ${mins(ab.headroomS)} headroom)`);
// **How much of the query set this rests on.** Both sides are averaged over the
// journeys where the declared and the honest lazy integrator each planned for
// themselves — a matched opportunity set, which the subtraction needs and did
// not have (`KNOWN-ISSUES.md` #56). Where the conflicts destroy most of the set
// the remainder is what survived them, and a reader should see how thin it is
// before reading the number above it.
const matchedShare = ab.scoredQueries === 0 ? 0 : ab.matchedQueries / ab.scoredQueries;
console.log(
  `      measured on                                ` +
    `${ab.matchedQueries.toFixed(0)}/${ab.scoredQueries} journeys ` +
    `(${(matchedShare * 100).toFixed(0)}%, both runs planned)`,
);
if (matchedShare < 0.5) {
  console.log("      — under half the set. The conflicts destroyed the rest, so what");
  console.log("        is left is what survived them and is not a sample of the world.");
}
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

// **What #14 was actually about**: the honest-values world coming out *harder*
// than the declared one, which makes the subtraction meaningless and shows up
// as a negative conflict cost.
//
// The guard used to fire on any floor above 30 s, which was a proxy from when
// the floor was expected to be zero. It is not zero and should not be: a lazy
// integrator polling every five minutes loses something on entirely honest
// data, and that is a property of the solver rather than a defect in the
// comparison. What matters is that the residual does not dominate what is being
// attributed.
if (captureCost < 0) {
  console.log("    WARNING: conflict cost is negative — the honest-values world is");
  console.log("    HARDER than the declared one, so the subtraction is meaningless.");
  console.log("    See docs/KNOWN-ISSUES.md #14.");
  console.log("");
} else if (ab.cleanGapS > captureCost) {
  console.log("    WARNING: a lazy integrator loses more to its own polling cadence");
  console.log(`    (${mins(ab.cleanGapS)}) than to every declared conflict (${mins(captureCost)}).`);
  console.log("    Attribution still subtracts correctly, but the conflicts are not");
  console.log("    what makes this world hard. See docs/KNOWN-ISSUES.md #14.");
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

// **Gate 3's precondition, and it took a ladder to find it** (`KNOWN-ISSUES.md`
// #53).
//
// The gate compares a lazy integrator on this world against the same integrator
// on a world publishing honest values, entity set held fixed. That comparison
// is sound only while the two runs are doing the *same kind of thing*. When the
// conflicts are heavy enough that `P2` cannot match stops at all, it stops
// integrating and falls back to `P1` — and on the honest world it does not. The
// honest run then plans ambitious multi-operator journeys and reality takes
// them apart, while the conflicted run makes robust single-operator ones, and
// the difference comes out **negative**: measured at −108 % on one rung, which
// reads as "the conflicts made the world better".
//
// They did not. `CLAUDE.md` states the rule this breaks — *varying data quality
// also varies how much data there is, and a comparison that changes both cannot
// attribute to either* — and the entity set being fixed is not enough, because
// what changed is the player's ability to use it.
//
// So the gate is decidable only while the lazy integrator is still integrating.
// Half the scored set is the line: past that, `P2` is `P1` wearing a hat and
// there is nothing to compare.
const GAVE_UP_LIMIT = 0.5;
const stillIntegrating = fallbackShare <= GAVE_UP_LIMIT;

// **And the direct tell, which the fallback share does not catch.**
//
// Measured on the calibrated rungs, `towns-and-rail` gave up on only 26 % of
// journeys and still produced a conflict cost of −108 %. Giving up entirely is
// one way the opportunity sets diverge; planning *differently* is another, and
// the more common one. With coordinates that agree the lazy reader matches
// stops, builds a large transfer graph and plans multi-operator journeys that
// reality then takes apart; with coordinates that disagree it plans fewer legs
// and they survive.
//
// A negative conflict cost says exactly that: **the conflicted world is better
// for a lazy reader than the honest one.** That is a real property and it is
// not an answer to the question this gate asks — *do the declared conflicts
// make this world hard* — so reporting FAIL would say "the conflicts are
// decorative", which is not what a negative number means. The premise has
// failed, not the world.
// **On `captureCost`, which is the number that binds.** `conflictCost` above is
// the whole-score difference and the gate reports it for resolvability; the
// *criterion* ratified after P1M0 is journey time against headroom, which is
// `materiality`, and that is the one that goes negative. At `towns-and-rail`
// they disagree in sign — the conflicts cost 0.164 of the whole score at 23
// sigma while *saving* the lazy baseline 11.8 minutes of travel — and picking
// the wrong one of the two is exactly the mistake `#20` records.
const premiseHolds = captureCost > 0;
const decidable = resolvable && stillIntegrating && premiseHolds && carriesConflict;
const g3 = !carriesConflict || (decidable && materiality > 0.2);

if (!carriesConflict) {
  console.log("    n/a — this rung declares no semantic conflict, so there is no");
  console.log("    conflict cost to measure. Gate 3 asks where a world's difficulty");
  console.log("    comes from; a rung built to have none is not answering");
  console.log("    (KNOWN-ISSUES.md #52).");
} else if (!premiseHolds) {
  console.log(
    `    CANNOT BE DECIDED — the conflicts made this world ${mins(-captureCost)}` +
      ` *better* for a lazy integrator, on journey time.`,
  );
  console.log("");
  console.log("    Honest data gives a lazy reader more rope: it matches stops, plans");
  console.log("    multi-operator journeys with tight transfers, and reality takes them");
  console.log("    apart. Conflicted data forces fewer legs, and those survive. The two");
  console.log("    runs no longer have the same opportunity set, so their difference");
  console.log("    attributes to neither (KNOWN-ISSUES.md #53).");
  console.log("");
  console.log("    Gate 3 asks where a world's difficulty comes from. This world's");
  console.log("    lazy baseline is broken by something other than the conflicts, and");
  console.log("    `npm run fallback` and `npm run horizon` are what say by what.");
} else if (!stillIntegrating) {
  console.log(
    `    CANNOT BE DECIDED — the lazy integrator gave up on ` +
      `${(fallbackShare * 100).toFixed(0)}% of journeys.`,
  );
  console.log("");
  console.log("    Past that it is not a lazy integration, it is no integration, and");
  console.log("    the honest-values run it is compared against still integrates. The");
  console.log("    two runs no longer have the same opportunity set, so their");
  console.log("    difference attributes to nothing (KNOWN-ISSUES.md #53).");
  console.log("");
  console.log("    `npm run fallback` says which conflict is doing it.");
} else if (!resolvable) {
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
  console.log(
  `    ${g3 ? "PASS" : "FAIL"} — the declared conflicts must cost at least 20% of the headroom`,
);
if (!resolvable) {
  console.log("");
  console.log("    (The whole-score figure above is under two standard errors and");
  console.log("    is reported only as a diagnostic. It does not decide this gate.)");
}
}
console.log("");
// ---------------------------------------------------------------------------
const all = g1 && g2 && g3;
console.log(
  `  VERDICT: ${
    all
      ? carriesConflict
        ? "all three gates pass"
        : "the gates that apply to this rung pass"
      : decidable || !carriesConflict
        ? "AT LEAST ONE GATE FAILS"
        : "GATE 3 CANNOT YET BE DECIDED"
  }`,
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
