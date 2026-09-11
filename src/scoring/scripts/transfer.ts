// Do these two worlds ask the same thing, without asking it the same way?
//
//   npm run transfer <home.world.db> <away.world.db> [seeds]
//
// Specification: PHASES.md §284, ROADMAP.md P1M4, KNOWN-ISSUES.md #24.
//
// The Phase 1 exit is **"non-memorisable tasks of equal difficulty — and it is
// not satisfied by matching conflict lists alone"**. The half usually quoted is
// "a solution built for one performs comparably on the other", and on its own
// that half is satisfiable by cheating: make two worlds nearly identical and
// anything transfers. This measures both halves, using two solutions that
// should behave in opposite ways.
//
//   `competent`  generalises — infers each operator's displacement, detects its
//                time encoding from a sample, discovers interchanges. It has no
//                idea which world it is on, so it **should transfer**.
//
//   `tuned`      memorised the home world's answer key — every operator's
//                displacement and encoding, baked by `npm run tune`. On home it
//                is exact. Away, the operator ids are the same and every answer
//                is wrong, so it **should collapse**.
//
// | `competent` transfers | `tuned` collapses | reading |
// |---|---|---|
// | yes | yes | equal difficulty, non-memorisable — the exit |
// | yes | **no** | the worlds are too alike; variety is not doing its job |
// | no  | yes | the worlds are not the same tier |
// | no  | no  | neither claim holds |
//
// **The second row is the one worth having**, and nothing before this could see
// it. It is also the failure a calibration search could introduce by
// over-converging, now that `npm run calibrate:tier` selects draws near a
// median.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { projectOperator } from "@tns/projections";
import { operatorKeys } from "@tns/schema";
import { profileWorld, headlineOf } from "@tns/scoring";
import { progress } from "./progress.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

const argv = process.argv.slice(2);
const paths = argv.filter((a) => a.endsWith(".db"));
const seeds = Number(argv.find((a) => /^\d+$/.test(a)) ?? 3);

if (paths.length !== 2) {
  console.error("usage: npm run transfer <home.world.db> <away.world.db> [seeds]");
  process.exit(2);
}
const [homePath, awayPath] = paths as [string, string];
const tuningPath = resolve(repoRoot, homePath).replace(/\.world\.db$/, ".tuning.json");

if (!existsSync(tuningPath)) {
  console.error(`No answer key at ${tuningPath}.`);
  console.error(`Bake one first:  npm run tune -- ${homePath}`);
  process.exit(1);
}

// **Can this key be wrong about the away world at all?** (`KNOWN-ISSUES.md` #59)
//
// `tuned` looks every feed up in its key by operator id and skips a feed the
// key has no entry for. Since P1M6 two worlds of a rung share no operator ids,
// so on a genuinely independent away world the key resolves against nothing,
// `tuned` reads no feed at all and scores like a player that answers nothing —
// and the verdict at the bottom reports "both halves hold" however alike the
// two worlds are.
//
// **Measured, not reasoned.** The committed world against a copy identical in
// every respect except its operators' names: `competent` did not move by a
// thousandth, and `tuned` went 0.294 -> -0.600, which is `null`'s headline to
// three places. This instrument certified Phase 1's exit on two identical
// worlds.
//
// So a collapse means something only if the key resolved. Checked before any
// run, because it is a property of the key and the away world, costs nothing to
// know, and makes three minutes of simulation pointless when it fails. A gate
// that cannot be decided is not a gate that passes (`#53`).
const answerKey = JSON.parse(readFileSync(tuningPath, "utf8")) as {
  operators: Record<string, unknown>;
};
// **Resolved the way `tuned` resolves it**: by operator kind and rank, computed
// from the away world's published timetables with the function that filed the
// key. Since 2026-09-11 that finds the same roles on a renamed world, so this
// refuses only where the key genuinely cannot reach — a kind the home world had
// none of, or operators tied on everything a rename leaves.
const awayWorld = loadWorld(resolve(repoRoot, awayPath));
const awayKeys = operatorKeys(
  awayWorld.manifest.operators.map((o) => projectOperator(awayWorld, o.id, 0).timetable),
);
const awayOperators = awayWorld.manifest.operators.map((o) => o.id);
const resolved = awayOperators.filter((id) => {
  const key = awayKeys.get(id);
  return key !== null && key !== undefined && key in answerKey.operators;
});
if (resolved.length === 0) {
  console.error("");
  console.error("  CANNOT BE DECIDED — the memorised key resolves none of the away world's operators.");
  console.error(`    key   ${Object.keys(answerKey.operators).join(", ")}`);
  console.error(
    `    away  ${awayOperators.map((id) => `${id}=${awayKeys.get(id) ?? "tie"}`).join(", ")}`,
  );
  console.error("");
  console.error("  `tuned` would skip every feed and score like a player that answers");
  console.error("  nothing, so its collapse is guaranteed by the key alone and says");
  console.error("  nothing about whether the two worlds are alike (KNOWN-ISSUES.md #59).");
  process.exit(1);
}

const PORTS = { operator: 9100, control: 9130, player: 9140 };
const MODES = ["competent", "tuned"] as const;
type Mode = (typeof MODES)[number];

// Eight open-loop runs at two seeds, and this is usually backgrounded, so it
// says where it is. Progress goes to stderr; the report stays clean.
const bar = progress(2 * MODES.length * seeds, "transfer");

async function run(path: string): Promise<Record<Mode, number | null>> {
  const world = loadWorld(resolve(repoRoot, path));
  const label = path.replace(/^.*[\/]/, "");
  const profile = await profileWorld(
    repoRoot,
    world,
    MODES,
    seeds,
    PORTS,
    (l) => bar.step(`${label} ${l}`),
    { TNS_TUNING: tuningPath },
  );
  return Object.fromEntries(MODES.map((m) => [m, headlineOf(profile, m)])) as Record<
    Mode,
    number | null
  >;
}

console.log("");
console.log("  TRANSFER — does a solution built for one world work on the other?");
console.log("");
console.log(`  home  ${homePath}   (the world \`tuned\` memorised)`);
console.log(`  away  ${awayPath}`);
console.log(`  ${seeds} disruption seeds each.`);
console.log(
  `  the key resolves ${resolved.length} of ${awayOperators.length} away operators by kind and rank.`,
);
if (resolved.length < awayOperators.length) {
  console.log("  `tuned` skips the rest, so part of any loss it shows is the key rather");
  console.log("  than the world (KNOWN-ISSUES.md #59).");
}

const home = await run(homePath);
const away = await run(awayPath);
bar.done();

const n = (v: number | null) => (v === null ? "  n/a" : (v >= 0 ? " " : "") + v.toFixed(3));

console.log("");
console.log("    solution      home     away     change");
for (const mode of MODES) {
  const h = home[mode];
  const a = away[mode];
  const delta = h === null || a === null ? null : a - h;
  console.log(
    `    ${mode.padEnd(12)} ${n(h)}   ${n(a)}   ` +
      `${delta === null ? "  n/a" : (delta >= 0 ? "+" : "") + delta.toFixed(3)}`,
  );
}

const cHome = home["competent"];
const cAway = away["competent"];
const tHome = home["tuned"];
const tAway = away["tuned"];

console.log("");
if (cHome === null || cAway === null || tHome === null || tAway === null) {
  console.log("  A solution scored nothing on one of the worlds; no verdict.");
  process.exit(1);
}

// A generalising solution should not care which world it is on. A memorising
// one should. Both are judged against the same yardstick: how far the *other*
// solution moved is no help, so each is compared with its own home score.
const generalises = Math.abs(cAway - cHome);
const memorised = tHome - tAway;

console.log(`  \`competent\` moved ${generalises.toFixed(3)} — it infers everything, so a`);
console.log("  large move would mean the worlds are not the same tier.");
console.log("");
console.log(`  \`tuned\` lost ${memorised.toFixed(3)} taking its answer key somewhere else.`);
console.log("  A small loss would mean the home world's specifics never mattered, and");
console.log("  the task is memorisable however different the conflict lists look.");
console.log("");

const transfers = generalises <= Math.max(0.05, Math.abs(cHome) * 0.25);
const collapses = memorised > generalises;

if (transfers && collapses) {
  console.log("  **Both halves hold.** A solution that reasons carries across; one that");
  console.log("  memorised does not. That is `PHASES.md` §284's requirement — equal");
  console.log("  difficulty *and* non-memorisable.");
} else if (transfers && !collapses) {
  console.log("  **The worlds are too alike.** A solution built against one world's");
  console.log("  answer key did just as well on the other, so those specifics never");
  console.log("  mattered. Matching conflict lists is exactly what PHASES.md §284 says");
  console.log("  does not satisfy this, and a calibration search that over-converges");
  console.log("  would produce precisely this.");
} else if (!transfers && collapses) {
  console.log("  **The worlds are not the same tier.** Even a solution that infers");
  console.log("  everything scored differently, so the difficulty does not match —");
  console.log("  `npm run profile` says how, and `npm run calibrate:tier` is the lever.");
} else {
  console.log("  **Neither claim holds.** The worlds differ in difficulty *and* the");
  console.log("  answer key travelled. Read `npm run profile` before anything else.");
}
console.log("");