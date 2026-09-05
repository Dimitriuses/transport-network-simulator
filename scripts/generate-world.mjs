// Build a fully generated world, in the two phases the criterion requires.
//
//   npm run world:generate -- worlds/scratch/gen.world.db --tier 3 --seed 481516
//
// Output goes under `worlds/scratch/` by default, which `.gitignore` treats as
// working material: committed worlds live in `worlds/` and are added
// explicitly. A generated world is reproducible from its seed and its sidecar,
// so there is nothing in it worth committing.
//
// Specification: ROADMAP.md P1M2, KNOWN-ISSUES.md #26.
//
// **The scored query set is not a by-product**, and Phase 0 learned that
// expensively. P0M9 took every Site pair 1500 m apart and found that on 88 % of
// them the restricted and unrestricted transfer graphs give the same answer:
// nothing for integration to win, and every extra leg a player takes is pure
// exposure to a cancellation nobody announced. The competent reference solution
// scored *below* the naive one for that reason alone, and it took two
// milestones to find out why.
//
// So a world is built twice:
//
//   1. with every candidate journey, so the criterion has something to judge;
//   2. with the journeys the criterion selected.
//
// **The criterion needs the router, and the router needs a built world.** That
// cycle is why this is two phases rather than one, and why the selection is not
// reimplemented in Python — `CLAUDE.md` is explicit that duplicating the router
// to break the cycle would guarantee the two drift apart. The hand-authored
// city resolves the same cycle by pasting the list into `city.py`; a generated
// world cannot, because every seed would need its own paste.
//
// The selected ids are written beside the bundle as `<name>.scored.json`. That
// file is what makes a generated world reproducible: rebuilding from the same
// network and the same sidecar gives the same bundle, and the sidecar itself is
// reproducible by re-running phase 1.

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const toolsDir = join(repoRoot, "tools");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));

const out = resolve(repoRoot, positional[0] ?? "worlds/scratch/gen.world.db");
const tier = flag("--tier", "3");
const seed = flag("--seed", "481516");

const python = (extra) => {
  const result = spawnSync(
    process.platform === "win32" ? "python" : "python3",
    ["-m", "worldbuild", ...extra],
    { cwd: toolsDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  if (result.status !== 0) {
    console.error(`  world build failed (exit ${result.status})`);
    process.exit(result.status ?? 1);
  }
  return result.stdout.trim();
};

console.log("");
console.log(`  GENERATING A WORLD — tier ${tier}, seed ${seed}`);
console.log("");

// ---- phase 1: every candidate ---------------------------------------------
mkdirSync(join(tmpdir(), "tns"), { recursive: true });
const candidates = join(tmpdir(), "tns", `candidates-${seed}.world.db`);
console.log("  1/3  building with every candidate journey");
python([candidates, "--network", "--seed", seed, "--tier", tier]);

// ---- phase 2: classify -----------------------------------------------------
console.log("  2/3  routing each candidate on both transfer graphs");
const headroom = spawnSync(
  process.execPath,
  [join(repoRoot, "src", "scoring", "scripts", "headroom.ts"), candidates, "--json"],
  { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);
if (headroom.status !== 0) {
  console.error("  headroom classification failed");
  process.exit(headroom.status ?? 1);
}
const report = JSON.parse(headroom.stdout);

// The mix is decided in Python, where it is inspectable beside the generator
// that produced the candidates.
const select = spawnSync(
  process.platform === "win32" ? "python" : "python3",
  [
    "-c",
    "import json,sys;from worldbuild.network import select_scored;" +
      "d=json.load(sys.stdin);" +
      "print(json.dumps(sorted(select_scored(tuple(r['id'] for r in d['improvable']), tuple(d['flat'])))))",
  ],
  { cwd: toolsDir, encoding: "utf8", input: JSON.stringify(report), stdio: ["pipe", "pipe", "inherit"] },
);
if (select.status !== 0) {
  console.error("  scored-set selection failed");
  process.exit(select.status ?? 1);
}
const scored = JSON.parse(select.stdout);

const sidecar = out.replace(/\.world\.db$/, "") + ".scored.json";
mkdirSync(dirname(sidecar), { recursive: true });
writeFileSync(sidecar, `${JSON.stringify(scored, null, 0)}\n`, "utf8");

const improvableSelected = scored.filter((id) =>
  report.improvable.some((r) => r.id === id),
).length;

// ---- phase 3: the real bundle ----------------------------------------------
console.log("  3/3  rebuilding with the selected journeys");
const built = python([out, "--network", "--seed", seed, "--tier", tier, "--scored", sidecar]);

console.log("");
console.log(`  candidates            ${String(report.total).padStart(5)}`);
console.log(
  `  integration can help  ${String(report.improvable.length).padStart(5)}` +
    `   (${((report.improvable.length / report.total) * 100).toFixed(0)} %)`,
);
console.log(`  unroutable by anyone  ${String(report.unroutable.length).padStart(5)}`);
console.log("");
console.log(`  scored                ${String(scored.length).padStart(5)}`);
console.log(
  `  of which improvable   ${String(improvableSelected).padStart(5)}` +
    `   (${((improvableSelected / scored.length) * 100).toFixed(0)} %)`,
);
console.log("");
console.log(`  ${built}`);
console.log(`  scored ids  ${sidecar}`);
console.log("");
console.log("  A journey where the two transfer policies agree is not easy — it is");
console.log("  empty. Some are kept deliberately: a set where every journey needs");
console.log("  integration would not notice a solution that breaks the easy ones.");
console.log("");
