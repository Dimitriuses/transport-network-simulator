// The information-set audit, as a command.
//
//   npm run leak [world.db] [mode]
//
// Specification: OBSERVABILITY.md §5, SCORING.md.
//
// When a scorecard comes back `quarantined` it says to run this, and until
// P1M2 there was no way to. `auditInformationSets` existed, was exported, and
// had no entry point — so the one instruction a quarantined run gives could not
// be followed.
//
// What it answers is narrower and sharper than "did somebody beat the oracle":
//
//   At the moment the player answered, what had the simulator actually served
//   it — and does its answer depend on anything outside that?
//
// The legitimate information set is the union of every response served up to
// that τ. The simulator sits on both sides of every request, so the set is
// complete whether or not the player cooperates. The bound is stronger than the
// oracle's: the oracle knows the whole day, and a player planning at τ could
// not have.
//
// **In practice this catches our own projection bugs more often than a cheating
// player** — a feed serving fresher data than its manifest declares — and that
// is the more valuable outcome.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { runOpenLoop } from "@tns/server";
import { auditInformationSets, scoreRun } from "@tns/scoring";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

const argv = process.argv.slice(2);
const looksLikeWorld = argv[0]?.endsWith(".db") === true;
const worldPath = looksLikeWorld
  ? resolve(repoRoot, argv[0]!)
  : join(repoRoot, "worlds", "m1.world.db");
const mode = (looksLikeWorld ? argv[1] : argv[0]) ?? "naive";

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const PORTS = { operator: 8600, control: 8630, player: 8640 };

const player = spawn(
  process.execPath,
  [join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
  {
    cwd: repoRoot,
    // Inherited: a player that fails to start must be able to say so.
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
  const audit = auditInformationSets(world, log);

  const m = (s: number) => `${(s / 60).toFixed(1)}m`;

  console.log("");
  console.log(`  INFORMATION-SET AUDIT — ${mode}, ${world.queries.length} scored journeys`);
  console.log("");
  console.log(`  scorecard verdict          ${card.verdict}`);
  if (card.verdictReason) console.log(`                             ${card.verdictReason}`);
  console.log(`  travellers beating P0      ${card.impossibleTravellers.length}`);
  console.log(`  plan obligations checked   ${audit.obligationsChecked}`);
  console.log(`  beat their own information ${audit.findings.length}`);
  console.log(
    `  blind hits                 ${audit.blindHits} (an optimal planner with the ` +
      `same information would take ${audit.expectedBlindHits})`,
  );
  console.log("");

  if (card.impossibleTravellers.length > 0) {
    console.log("  Arrived sooner than perfect information allows:");
    for (const t of card.impossibleTravellers.slice(0, 10)) console.log(`    ${t}`);
    if (card.impossibleTravellers.length > 10) {
      console.log(`    ...and ${card.impossibleTravellers.length - 10} more`);
    }
    console.log("");
  }

  if (audit.findings.length > 0) {
    console.log("  Beat the best achievable from what they had been served:");
    for (const f of [...audit.findings].sort((a, b) => b.excessS - a.excessS).slice(0, 10)) {
      console.log(
        `    ${f.queryId.padEnd(8)} by ${m(f.excessS).padStart(6)}  ` +
          `(${m(f.actualS)} against a bound of ${m(f.boundS)})  ` +
          `${f.replans} replan(s)  ${f.explanation}`,
      );
    }
    console.log("");
  }

  if (audit.clean && card.impossibleTravellers.length === 0) {
    console.log("  Nothing beat its own information set.");
    console.log("");
    console.log("  A quarantine with a clean audit means the *oracle* is the thing");
    console.log("  that is wrong: P0 is supposed to dominate every strategy, and a");
    console.log("  player reaching a bound P0 could not is a bug in P0's search or");
    console.log("  in what it was given, not a leak.");
  } else {
    console.log("  A finding here is usually our bug rather than a cheating player —");
    console.log("  most often a feed serving fresher data than its manifest declares.");
    console.log("  Check the projection for that operator before anything else.");
  }
  console.log("");
} finally {
  player.kill();
}
