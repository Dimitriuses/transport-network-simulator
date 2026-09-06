// Runs the reference player as a standalone service.
//
// Started by the demo as a child process, so the contract is exercised over
// real HTTP between real processes rather than in-process.

import { startPlayer } from "../src/player.ts";

const port = Number(process.env["TNS_PLAYER_PORT"] ?? 8080);
const controlUrl = process.env["TNS_CONTROL_URL"] ?? "http://127.0.0.1:9000";
const raw = process.env["TNS_PLAYER_MODE"];
const modes = [
  "null",
  "blind",
  "cheat",
  "competent",
  "competent-deaf",
  "naive",
  // Overfitted to one world, via `TNS_TUNING`. It exists to *fail* on any other
  // world of the same tier — see `src/refplayer/src/tuning.ts`.
  "tuned",
] as const;
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

// The control API may not be listening the instant we start; `startPlayer`
// waits for it. **This process must not wrap that in a retry of its own** —
// retrying `startPlayer` retries the `listen` as well, and the second bind
// fails on a port the first attempt is still holding. That is
// `KNOWN-ISSUES.md` #46, and it turned a lost race into a permanent
// `starting`.
startPlayer({ port, controlUrl, mode }).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
