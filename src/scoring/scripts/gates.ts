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
import { ablate, calibrate, scoreRun, auditInformationSets } from "@tns/scoring";

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

async function measure(mode: string, base: number): Promise<Result> {
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
      world,
      playerBaseUrl: `http://127.0.0.1:${base + 900}`,
      operatorPort: base,
      controlPort: base + 9,
    });
    const card = scoreRun(log, { tier: world.manifest.tier });
    const audit = auditInformationSets(world, log);
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
const ab = ablate(world);
console.log("    Measured on a lazy integrator that *does* handle realtime, so it");
console.log("    differs from a careful one in matching quality alone. P2 as");
console.log("    specified ignores realtime, which would guarantee it loses to a");
console.log("    disrupted day whether or not any conflict existed — and that");
console.log("    confounds precisely the question this gate asks.");
console.log("");
console.log(`    its shortfall, as things are                 ${mins(ab.baselineGapS)}`);
console.log(`    the same, with every conflict switched off   ${mins(ab.cleanGapS)}`);
console.log("");

const conflictCaused = ab.baselineGapS - ab.cleanGapS;
const share = ab.baselineGapS === 0 ? 0 : conflictCaused / ab.baselineGapS;

console.log(`    caused by conflicts   ${mins(conflictCaused)}  (${(share * 100).toFixed(0)}%)`);
console.log(`    caused by everything else  ${mins(ab.cleanGapS)}  (${((1 - share) * 100).toFixed(0)}%)`);
console.log("");
if (ab.entries.some((e) => Math.abs(e.costS) > 1)) {
  console.log("    per-conflict, each acting alone:");
  for (const e of ab.entries.filter((x) => Math.abs(x.costS) > 1).slice(0, 8)) {
    console.log(`      ${mins(e.costS).padStart(7)}  ${e.conflict}`);
  }
  console.log("");
}

const g3 = share > 0.5;
console.log(`    ${g3 ? "PASS" : "FAIL"} — most lost capture must trace to declared conflicts`);
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
