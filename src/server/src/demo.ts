// M1 walking skeleton: build → simulate → call a player → score.
//
//   npm run demo
//
// ROADMAP.md M1: "builds the world, runs the simulation, calls a player and
// prints a score. Twice, with identical output."
//
// The player runs as a *separate process*. That matters: it means the seam
// being proved is a real one — the simulator never executes player code, it
// only sends it HTTP (TECHNICAL-RESEARCH.md §10).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { scoreRun, renderScorecard, auditInformationSets } from "@tns/scoring";
import { runOpenLoop, hashLog } from "./harness.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");

const OPERATOR_PORT = 9101;
const CONTROL_PORT = 9000;
const PLAYER_PORT = 8080;

async function main(): Promise<number> {
  if (!existsSync(worldPath)) {
    console.error(
      `No world bundle at ${worldPath}.\n` +
        `Build it first:  cd tools && uv run python -m worldbuild`,
    );
    return 1;
  }

  const world = loadWorld(worldPath);
  console.log(
    `world: ${world.quays.length} quays · ${world.sites.length} sites · ` +
      `${world.manifest.operators.length} operators · ${world.lines.length} lines · ` +
      `${world.journeys.length} journeys · ${world.queries.length} scored queries · ` +
      `seed ${world.manifest.seed}`,
  );
  if (world.manifest.activeConflicts.length === 0) {
    console.log("       no declared conflicts (Tier 0 — see docs/PHASES.md)");
  }

  const player = spawn(
    process.execPath,
    [join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        TNS_PLAYER_PORT: String(PLAYER_PORT),
        TNS_CONTROL_URL: `http://127.0.0.1:${CONTROL_PORT}`,
        ...(process.env["TNS_PLAYER_MODE"] ? { TNS_PLAYER_MODE: process.env["TNS_PLAYER_MODE"] } : {}),
      },
    },
  );
  player.stderr.on("data", (d: Buffer) => process.stderr.write(`[player] ${d}`));

  try {
    // The operator API must be up before the player can ingest, and the player
    // must be ready before the run starts — the lifecycle in
    // PLAYER-CONTRACT.md §4, in its smallest honest form.
    const log = await runOpenLoop({
      world,
      playerBaseUrl: `http://127.0.0.1:${PLAYER_PORT}`,
      operatorPort: OPERATOR_PORT,
      controlPort: CONTROL_PORT,
    });

    const card = scoreRun(log, { profile: process.env["TNS_PROFILE"] ?? "balanced", tier: world.manifest.tier });
    // The forensic pass. Cheap here, and the only check that holds when the
    // headline invariants cannot fire (OBSERVABILITY.md §5).
    const audit = auditInformationSets(world, log);

    console.log(renderScorecard(card, audit));
    console.log(`  run log: ${log.length} records · hash ${hashLog(log)}`);
    console.log("");

    return audit.clean ? 0 : 0; // a leak is reported, not a build failure here

    return 0;
  } finally {
    player.kill();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
