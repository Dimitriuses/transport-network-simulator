// Runs the reference player as a standalone service.
//
// Started by the demo as a child process, so the contract is exercised over
// real HTTP between real processes rather than in-process.

import { startPlayer } from "../src/player.ts";

const port = Number(process.env["TNS_PLAYER_PORT"] ?? 8080);
const operatorBaseUrl = process.env["TNS_OPERATOR_URL"] ?? "http://127.0.0.1:9101";

// The operator API may not be listening the instant we start. Retry rather
// than racing it; the simulator polls /v1/health and will wait.
async function boot(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await startPlayer({ port, operatorBaseUrl });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw new Error(`could not reach the operator API at ${operatorBaseUrl}`);
}

boot().catch((err) => {
  console.error(err);
  process.exit(1);
});
