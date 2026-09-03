// Where a solution's travellers actually fail.
//
//   npm run failures [modes...]
//
// The scorecard says a solution captures -0.597 of the headroom. It does not
// say whether that is journeys never planned, plans that broke, reroutes that
// broke again, or arrivals that were simply slow. This does, and every
// hypothesis about the competent solution at P0M10 was eliminated by reading
// it rather than by reasoning about the code.

import { spawn } from "node:child_process";
import { loadWorld } from "@tns/core";
import { runOpenLoop } from "@tns/server";

const world = loadWorld("worlds/m1.world.db");

async function run(mode: string, base: number) {
  const player = spawn(process.execPath, ["src/refplayer/scripts/serve.ts"], {
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      TNS_PLAYER_PORT: String(base + 900),
      TNS_CONTROL_URL: `http://127.0.0.1:${base + 9}`,
      TNS_PLAYER_MODE: mode,
    },
  });
  try {
    const log = await runOpenLoop({
      world,
      playerBaseUrl: `http://127.0.0.1:${base + 900}`,
      operatorPort: base,
      controlPort: base + 9,
    });
    const trav = log.filter((r) => r.kind === "traveller") as unknown as {
      arrived: boolean;
      failureReason: string | null;
      forgone: boolean;
      journeyS: number | null;
      referenceJourneyS: number | null;
      oracleJourneyS: number | null;
    }[];
    const fails = new Map<string, number>();
    let slower = 0;
    let slowerTotal = 0;
    let faster = 0;
    for (const t of trav) {
      if (!t.arrived) {
        fails.set(String(t.failureReason).split(":")[0]!, (fails.get(String(t.failureReason).split(":")[0]!) ?? 0) + 1);
      } else if (t.journeyS !== null && t.referenceJourneyS !== null) {
        if (t.journeyS > t.referenceJourneyS + 1) {
          slower++;
          slowerTotal += t.journeyS - t.referenceJourneyS;
        } else if (t.journeyS < t.referenceJourneyS - 1) faster++;
      }
    }
    const obs = log.filter((r) => r.kind === "obligation") as unknown as {
      obligation: string;
      outcome: string;
    }[];
    const replans = obs.filter((o) => o.obligation === "replan");
    const rp = new Map<string, number>();
    for (const r of replans) rp.set(r.outcome, (rp.get(r.outcome) ?? 0) + 1);

    console.log(`\n  ${mode}`);
    console.log(
      `    arrived ${trav.filter((t) => t.arrived).length}/${trav.length}` +
        `  forgone ${trav.filter((t) => t.forgone).length}` +
        `  faster than P1 ${faster}  slower ${slower}` +
        (slower ? ` (by ${(slowerTotal / 60 / slower).toFixed(1)}m each)` : ""),
    );
    console.log(`    replans issued ${replans.length}: ${[...rp].map(([k, v]) => `${k}=${v}`).join(" ")}`);
    for (const [k, v] of [...fails].sort((a, b) => b[1] - a[1])) {
      console.log(`      ${k.padEnd(38)} ${v}`);
    }
  } finally {
    player.kill();
  }
}

const modes = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["competent", "naive"];
let port = 9800;
for (const mode of modes) {
  await run(mode, port);
  port += 40;
}
