// npm run attribute -- <world.db> --out <file.json> [--player-mode naive | --player-cmd "<command>"] [--port-base 7800]
//
// SCORING.md §10, stage two, for one player: what each declared conflict costs
// *this player*, rather than the lazy reference `ablate` measures. The player is
// run on the world as declared, on the world with every value-level conflict
// switched off, and once more with each conflict switched back on alone —
// `2 + conflicts` whole runs, which is why it is opt-in.
//
// A player given by command is started afresh for every run, with
// TNS_PLAYER_PORT and TNS_CONTROL_URL in its environment, exactly as a reference
// player is: a player that remembered one world into the next would be measured
// on what it remembered.

import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { loadWorld } from "@tns/core";
import { conflictVariants, scoreRun, withNoConflicts } from "@tns/scoring";
import type { World } from "@tns/schema";
import { runOpenLoop } from "@tns/server";
import type { PlayerAttribution } from "../src/index.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    "player-mode": { type: "string" },
    "player-cmd": { type: "string" },
    "port-base": { type: "string", default: "7800" },
  },
});
const [worldArg] = positionals;
if (!worldArg || !values.out) {
  console.error('usage: npm run attribute -- <world.db> --out <file.json> [--player-mode naive | --player-cmd "<command>"]');
  process.exit(2);
}
if (values["player-mode"] && values["player-cmd"]) throw new Error("give --player-mode or --player-cmd, not both");

const world = loadWorld(resolve(worldArg));
const mode = values["player-mode"] ?? (values["player-cmd"] ? null : "naive");
const playerLabel = mode ? `reference player \`${mode}\`` : `\`${values["player-cmd"]}\``;
let portBase = Number(values["port-base"]);

function startPlayer(port: number, controlPort: number): ChildProcess {
  const env = { ...process.env, TNS_PLAYER_PORT: String(port), TNS_CONTROL_URL: `http://127.0.0.1:${controlPort}` };
  return mode
    ? spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/refplayer/scripts/serve.ts"], {
        stdio: ["ignore", "ignore", "inherit"],
        env: { ...env, TNS_PLAYER_MODE: mode },
      })
    : spawn(values["player-cmd"]!, { shell: true, stdio: ["ignore", "ignore", "inherit"], env });
}

async function capture(variant: World, label: string): Promise<number> {
  const ports = portBase;
  portBase += 20;
  const player = startPlayer(ports + 19, ports + 10);
  const started = Date.now();
  try {
    const log = await runOpenLoop({
      world: variant,
      playerBaseUrl: `http://127.0.0.1:${ports + 19}`,
      operatorPort: ports,
      controlPort: ports + 10,
    });
    const c = scoreRun(log).service.capture;
    if (c === null) throw new Error(`${label}: no capture could be formed`);
    process.stderr.write(`  ${label.padEnd(40)} capture ${c.toFixed(3)}  (${((Date.now() - started) / 1000).toFixed(0)} s)\n`);
    return c;
  } finally {
    player.kill();
  }
}

const variants = conflictVariants(world);
process.stderr.write(`attributing ${playerLabel} on ${worldArg}: ${2 + variants.length} runs\n`);
const captureDeclared = await capture(world, "as declared");
const captureClean = await capture(withNoConflicts(world), "every value-level conflict off");
const entries: PlayerAttribution["entries"][number][] = [];
for (const v of variants) {
  const c = await capture(v.world, v.conflict);
  entries.push({ conflict: v.conflict, capture: c, captureLost: captureClean - c });
}
entries.sort((a, b) => b.captureLost - a.captureLost);

const result: PlayerAttribution = {
  kind: "player_attribution",
  player: playerLabel,
  worldContentHash: world.manifest.contentHash,
  captureDeclared,
  captureClean,
  entries,
};
writeFileSync(resolve(values.out), JSON.stringify(result, null, 2));
console.log(`${values.out}: ${entries.length} conflicts, capture ${captureClean.toFixed(3)} with none, ${captureDeclared.toFixed(3)} as declared`);
