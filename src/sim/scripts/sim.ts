// npm run sim -- [--port 8600] [--api-port 7400] [--player-port 7390]
//
// The simulation server (ROADMAP.md P2M8). Prints a link, with the
// administrator's token in it, to a dashboard that creates a session, connects
// a solution with a run token, starts, pauses, re-speeds and stops the day, and
// opens the finished run in the viewer.

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { startSimServer } from "../src/index.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "8600" },
    "api-port": { type: "string", default: "7400" },
    "player-port": { type: "string", default: "7390" },
  },
});
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const sim = await startSimServer({
  port: Number(values.port),
  repoRoot,
  runDir: join(repoRoot, "runs"),
  ports: { api: Number(values["api-port"]), referencePlayer: Number(values["player-port"]) },
});
console.log("simulation server");
console.log(`  dashboard     ${sim.url}`);
console.log(`  control API   http://127.0.0.1:${values["api-port"]} (operators from ${Number(values["api-port"]) + 1}), once a solution is registered`);
console.log("  The link holds the administrator's token: anyone with it can stop a run.");

const shutdown = () => void sim.close().then(() => process.exit(0));
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
