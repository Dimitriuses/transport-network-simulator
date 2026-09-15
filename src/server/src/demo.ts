// P0M1 walking skeleton: build → simulate → call a player → score.
//
//   npm run demo
//
// ROADMAP.md P0M1: "builds the world, runs the simulation, calls a player and
// prints a score. Twice, with identical output."
//
// The player runs as a *separate process*. That matters: it means the seam
// being proved is a real one — the simulator never executes player code, it
// only sends it HTTP (TECHNICAL-RESEARCH.md §10).

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { scoreRun, renderScorecard, auditInformationSets } from "@tns/scoring";
import { runOpenLoop, hashLog } from "./harness.ts";
import { openRunFile } from "./runfile.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");

const OPERATOR_PORT = 9101;
// 9000 is also a Jupyter kernel's default, so it can be moved (`KNOWN-ISSUES.md` #60).
const CONTROL_PORT = Number(process.env["TNS_CONTROL_PORT"] ?? 9000);
const PLAYER_PORT = 8080;

/** `TNS_TIME_MODE=realtime`, or `TNS_TIME_MODE=scaled TNS_SPEED=60` (TIME-MODEL.md §2). */
function timeOptions(): { timeMode?: "virtual" | "realtime" | "scaled"; speed?: number } {
  const mode = process.env["TNS_TIME_MODE"];
  if (!mode) return {};
  if (mode !== "virtual" && mode !== "realtime" && mode !== "scaled") {
    throw new Error(`TNS_TIME_MODE must be virtual, realtime or scaled, not ${mode}`);
  }
  const speed = process.env["TNS_SPEED"];
  return { timeMode: mode, ...(speed ? { speed: Number(speed) } : {}) };
}

/** `TNS_LOOP=closed`, optionally with `TNS_APP_USER_FRACTION=0.5` (SCORING.md §12). */
function loopOptions(): { loop?: "open" | "closed"; appUserFraction?: number } {
  const loop = process.env["TNS_LOOP"];
  if (!loop) return {};
  if (loop !== "open" && loop !== "closed") {
    throw new Error(`TNS_LOOP must be open or closed, not ${loop}`);
  }
  const fraction = process.env["TNS_APP_USER_FRACTION"];
  return { loop, ...(fraction ? { appUserFraction: Number(fraction) } : {}) };
}

/**
 * `TNS_LOG_LEVEL=verbatim` inlines response bodies, capped (OBSERVABILITY.md §7);
 * `TNS_DISCLOSURE=full|attributed|outcome` is what a viewer may show (§8).
 */
function logOptions(): { logLevel: "trace" | "verbatim"; disclosure: "full" | "attributed" | "outcome" } {
  const level = process.env["TNS_LOG_LEVEL"] ?? "trace";
  if (level !== "trace" && level !== "verbatim") {
    throw new Error(`TNS_LOG_LEVEL must be trace or verbatim, not ${level}`);
  }
  const disclosure = process.env["TNS_DISCLOSURE"] ?? "attributed";
  if (disclosure !== "full" && disclosure !== "attributed" && disclosure !== "outcome") {
    throw new Error(`TNS_DISCLOSURE must be full, attributed or outcome, not ${disclosure}`);
  }
  return { logLevel: level, disclosure };
}

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

  // `TNS_PLAYER_URL` runs the demo against your own solution instead of a
  // reference player: start it first, pointed at the control API below, and
  // the demo calls it. A session you can connect solutions to from a dashboard
  // is P2M8's; this is the smallest thing that lets a solution be run at all.
  const ownPlayer = process.env["TNS_PLAYER_URL"];
  const playerBaseUrl = ownPlayer ?? `http://127.0.0.1:${PLAYER_PORT}`;
  // **Every run has a token** (PLAYER-CONTRACT.md §3). Your own player has to
  // know it before the run starts, so you choose it; a reference player is
  // handed one.
  const token = process.env["TNS_TOKEN"] ?? (ownPlayer ? null : randomBytes(18).toString("base64url"));
  if (token === null) {
    console.error(
      "TNS_PLAYER_URL needs TNS_TOKEN: choose a run token, start your player with it, and give the demo the same one.\n" +
        "Your player sends it as `Authorization: Bearer <token>` to the control API and should refuse requests without it.",
    );
    return 2;
  }
  if (ownPlayer) {
    console.log(`player: ${ownPlayer} (yours) · control API http://127.0.0.1:${CONTROL_PORT}`);
  }
  const player = ownPlayer
    ? null
    : spawn(
        process.execPath,
        ["--disable-warning=ExperimentalWarning", join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
        {
          cwd: repoRoot,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            TNS_PLAYER_PORT: String(PLAYER_PORT),
            TNS_CONTROL_URL: `http://127.0.0.1:${CONTROL_PORT}`,
            TNS_TOKEN: token,
            ...(process.env["TNS_PLAYER_MODE"] ? { TNS_PLAYER_MODE: process.env["TNS_PLAYER_MODE"] } : {}),
          },
        },
      );
  player?.stderr?.on("data", (d: Buffer) => process.stderr.write(`[player] ${d}`));

  const logging = logOptions();
  // A file name, not a model input: wall time is fine at the boundary.
  const runName = `${world.manifest.seed}-${ownPlayer ? "own" : (process.env["TNS_PLAYER_MODE"] ?? "naive")}-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}`;
  const runFile = openRunFile(process.env["TNS_RUN_DIR"] ?? join(repoRoot, "runs"), runName, logging.logLevel);

  try {
    // The operator API must be up before the player can ingest, and the player
    // must be ready before the run starts — the lifecycle in
    // PLAYER-CONTRACT.md §4, in its smallest honest form.
    const log = await runOpenLoop({
      world,
      playerBaseUrl,
      token,
      operatorPort: OPERATOR_PORT,
      controlPort: CONTROL_PORT,
      ...timeOptions(),
      ...loopOptions(),
      ...logging,
      stream: runFile.stream,
    });
    runFile.finish(log);

    const card = scoreRun(log, { profile: process.env["TNS_PROFILE"] ?? "balanced", tier: world.manifest.tier });
    // The forensic pass. Cheap here, and the only check that holds when the
    // headline invariants cannot fire (OBSERVABILITY.md §5).
    const audit = auditInformationSets(world, log);

    console.log(renderScorecard(card, audit));
    console.log(`  run log: ${log.length} records · hash ${hashLog(log)}`);
    console.log(`           ${runFile.path}`);
    console.log(`  explain it:  npm run view -- ${runFile.path} ${worldPath}`);
    console.log("");

    return audit.clean ? 0 : 0; // a leak is reported, not a build failure here

    return 0;
  } catch (err) {
    // Keep what the run did: the partial file is the evidence (OBSERVABILITY.md §7).
    runFile.abandon();
    throw err;
  } finally {
    player?.kill();
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // A port somebody else holds — 9000 is a Jupyter kernel's default — is the
    // commonest way this fails, and a stack trace does not say what to do.
    const e = err as { code?: string; port?: number };
    if (e.code === "EADDRINUSE") {
      const which =
        e.port === CONTROL_PORT
          ? "the control API — set TNS_CONTROL_PORT to a free port, e.g. TNS_CONTROL_PORT=7430"
          : e.port === PLAYER_PORT && !process.env["TNS_PLAYER_URL"]
            ? "the reference player — stop whatever holds it (a player left running?)"
            : "an operator API (one port per operator from 9101) — stop whatever holds it";
      console.error(`port ${e.port} is already in use by another program; it is ${which}.`);
      process.exit(1);
    }
    console.error(err);
    process.exit(1);
  },
);
