// How much of a lazy integrator's shortfall is trouble it could not have known
// about yet?
//
//   npm run horizon [world.db]
//
// Gate 3 asks what fraction of lost capture the declared conflicts cause. It is
// measured against P0, which REFERENCE-POLICY.md §2 gives "full L1 + perfect
// realtime" — so P0 routes around a cancellation announced at 09:20 when
// planning at 09:00. No player can do that. That advantage sits in the gap
// being divided into, and it is large enough to swamp the numerator.
//
// Sweeping the planning lead separates the two. At lead 0 everything
// announceable has been announced, so what remains is not an information gap.
//
// **The clean column is the value-clean world, not the everything-off one**
// (`KNOWN-ISSUES.md` #55). This subtracted `cleanWorld`, which switches
// granularity off too and so publishes a different number of stops — and a
// lazy solver given more stops finds more apparent interchanges to get wrong,
// so the difference varied the size of the problem and the quality of the data
// at once and could attribute to neither (`#14`). `valueCleanWorld` publishes
// the same stops, honestly.

import { loadWorld } from "@tns/core";
import { calibrate, valueCleanWorld } from "@tns/scoring";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

// Takes a world path like every other instrument, and resolves it against the
// repository rather than the shell's working directory. It hardcoded a relative
// `worlds/m1.world.db` until P1M2, so it worked only from the repo root and
// could not be pointed at a generated world at all.
const worldPath = process.argv[2]
  ? resolve(repoRoot, process.argv[2])
  : join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const clean = valueCleanWorld(world);
const m = (s: number) => `${(s / 60).toFixed(2)}m`;

console.log("");
console.log("  WHAT A LAZY INTEGRATOR LOSES, AND TO WHOM");
console.log("");
console.log("  P0    clairvoyant optimum  — knows the day before it is announced");
console.log("  P0a   announced optimum    — perfect integration, P2rt's horizon");
console.log("  P2rt  lazy integrator      — reads feeds, reconciles badly");
console.log("");
console.log("  lead    P0->P0a    P0a->P2rt          conflict     P0a plans");
console.log("          foresight  declared   honest  cost         that failed");
console.log("  -----   ---------  --------  ------   ----------   -----------");
for (const lead of [1800, 900, 300, 0]) {
  const d = calibrate(world, { planLeadS: lead });
  const c = calibrate(clean, { planLeadS: lead });
  const cost = d.gapP0aP2rt - c.gapP0aP2rt;
  console.log(
    `  ${String(lead).padStart(4)}s   ${m(d.gapP0P0a).padStart(9)}  ${m(d.gapP0aP2rt).padStart(8)}  ` +
      `${m(c.gapP0aP2rt).padStart(6)}   ${m(cost).padStart(10)}   ${d.p0aFailures}/${d.comparable}`,
  );
}
console.log("");
console.log("  The foresight column is unreachable by anyone and belongs in no");
console.log("  gate. At the harness's 30-minute lead it is over twenty times the");
console.log("  conflict cost, which is what made the conflicts look decorative.");
console.log("");
console.log("  Read the last two columns together. Conflicts cost more as the");
console.log("  planning lead shortens, because reconciliation only matters once");
console.log("  there is something worth reconciling — and the failure column");
console.log("  falls the same way. A planner that never replans is mostly blind,");
console.log("  and a blind planner cannot be punished for reconciling badly.");
console.log("  That is KNOWN-ISSUES.md #1, and it is the binding constraint.");
console.log("");
