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
import { ablate, calibrate, scoreRun, auditInformationSets, cleanWorld } from "@tns/scoring";
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
const nul = results.find((r) => r.mode === "null")!;

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
const spread = (competent.headline ?? 0) - (nul.headline ?? 0);
const g2 = cal.gapP0P1 > 60 && spread > 0.2 && new Set(results.map((r) => n(r.headline))).size >= 3;
console.log(`    P0-P1 headroom            ${mins(cal.gapP0P1)}`);
console.log(`    spread, worst to best     ${n(spread)} of headline`);
console.log(`    distinct headline scores  ${new Set(results.map((r) => n(r.headline))).size} of ${results.length}`);
console.log(`    ${g2 ? "PASS" : "FAIL"} — solutions of different quality must separate visibly`);
console.log("");

// ---- Gate 3 ---------------------------------------------------------------
console.log("  GATE 3 — the conflicts are doing the work");
console.log("");
console.log("    Measured across the WHOLE score, from real runs of the naive");
console.log("    reference player against this world and against the same world");
console.log("    with every conflict switched off.");
console.log("");
console.log("    Capture alone is journey time, and journey time is the family");
console.log("    realistic conflicts move least. Staleness costs a traveller a");
console.log("    third of a minute of travel — its real damage is that nobody");
console.log("    warned them, which lands entirely in the Information family and");
console.log("    was invisible to this gate until P0M8. Information can only be");
console.log("    observed from a run: a routing model warns nobody.");
console.log("");

const declaredRun = await measure("naive", 9500, world);
const cleanRun = await measure("naive", 9520, cleanWorld(world));

const hDeclared = declaredRun.headline ?? 0;
const hClean = cleanRun.headline ?? 0;
const conflictCost = hClean - hDeclared;

const row = (label: string, r: Result) =>
  console.log(
    `    ${label.padEnd(22)} ${n(r.headline)}   ${n(r.capture)}   ${n(r.information)}   ${r.arrived}`,
  );

console.log("                           headline  capture  information  arrived");
row("this world", declaredRun);
row("conflicts switched off", cleanRun);
console.log("");
console.log(`    conflicts cost   ${n(conflictCost)} of the score`);
console.log("");

// The headline already runs 0 (no better than a city with no integration
// layer) to 1 (perfect), so a difference in it *is* a share of what a player
// competes for. No separate headroom division is needed, and none should be
// invented — that was where the old gate hid the oracle's foresight.
const materiality = conflictCost;

// Retained as a diagnostic, on journey time alone, so the two are comparable
// against every number recorded before P0M8.
const ab = ablate(world);
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

const g3 = materiality > 0.2;
console.log(`    ${g3 ? "PASS" : "FAIL"} — the declared conflicts must cost at least 20% of the score`);
console.log("");
// ---------------------------------------------------------------------------
const all = g1 && g2 && g3;
console.log(`  VERDICT: ${all ? "all three gates pass" : "AT LEAST ONE GATE FAILS"}`);
if (!all) {
  console.log("  docs/PHASES.md: a failed gate is a legitimate outcome and must be");
  console.log("  allowed to stop the project rather than be tuned away.");
}
console.log("");

process.exit(0);
