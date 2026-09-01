// Runs the reference player as a standalone service.
//
// Started by the demo as a child process, so the contract is exercised over
// real HTTP between real processes rather than in-process.

import { startPlayer } from "../src/player.ts";

const port = Number(process.env["TNS_PLAYER_PORT"] ?? 8080);
const controlUrl = process.env["TNS_CONTROL_URL"] ?? "http://127.0.0.1:9000";
const raw = process.env["TNS_PLAYER_MODE"];
const modes = ["null", "blind", "cheat", "competent", "naive"] as const;
const mode = (modes as readonly string[]).includes(raw ?? "") ? (raw as (typeof modes)[number]) : "naive";

// The control API may not be listening the instant we start. Retry rather than
// racing it; the simulator polls /v1/health and will wait.
async function boot(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await startPlayer({ port, controlUrl, mode });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error(`could not reach the control API at ${controlUrl}`);
}

boot().catch((err) => {
  console.error(err);
  process.exit(1);
});
