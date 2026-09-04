// Runs the reference player as a standalone service.
//
// Started by the demo as a child process, so the contract is exercised over
// real HTTP between real processes rather than in-process.

import { startPlayer } from "../src/player.ts";

const port = Number(process.env["TNS_PLAYER_PORT"] ?? 8080);
const controlUrl = process.env["TNS_CONTROL_URL"] ?? "http://127.0.0.1:9000";
const raw = process.env["TNS_PLAYER_MODE"];
const modes = ["null", "blind", "cheat", "competent", "competent-deaf", "naive"] as const;
if (raw !== undefined && !(modes as readonly string[]).includes(raw)) {
  // **Fail rather than fall back.** This used to default silently to "naive",
  // so a typo or an unregistered mode produced a complete, plausible run of the
  // wrong player. It cost one measurement of KNOWN-ISSUES.md #17: a diagnostic
  // built to isolate the competent solution's realtime handling ran as the
  // naive solution and returned results identical to it, which looked like a
  // finding until the numbers were too identical to believe.
  console.error(`unknown TNS_PLAYER_MODE ${JSON.stringify(raw)}; expected one of ${modes.join(", ")}`);
  process.exit(1);
}
const mode = (raw ?? "naive") as (typeof modes)[number];

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
