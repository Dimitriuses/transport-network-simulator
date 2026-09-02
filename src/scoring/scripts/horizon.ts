// How much of a lazy integrator's shortfall is trouble it could not have known
// about yet?
//
//   npm run horizon
//
// Gate 3 asks what fraction of lost capture the declared conflicts cause. It is
// measured against P0, which REFERENCE-POLICY.md §2 gives "full L1 + perfect
// realtime" — so P0 routes around a cancellation announced at 09:20 when
// planning at 09:00. No player can do that. That advantage sits in the gap
// being divided into, and it is large enough to swamp the numerator.
//
// Sweeping the planning lead separates the two. At lead 0 everything
// announceable has been announced, so what remains is not an information gap.

import { loadWorld } from "@tns/core";
import { calibrate, cleanWorld } from "@tns/scoring";

const world = loadWorld("worlds/m1.world.db");
const clean = cleanWorld(world);
const m = (s: number) => `${(s / 60).toFixed(2)}m`;

console.log("");
console.log("  WHAT A LAZY INTEGRATOR LOSES, AND TO WHOM");
console.log("");
console.log("  P0    clairvoyant optimum  — knows the day before it is announced");
console.log("  P0a   announced optimum    — perfect integration, P2rt's horizon");
console.log("  P2rt  lazy integrator      — reads feeds, reconciles badly");
console.log("");
console.log("  lead    P0->P0a    P0a->P2rt          conflict     P0a plans");
console.log("          foresight  declared   clean   cost         that failed");
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
