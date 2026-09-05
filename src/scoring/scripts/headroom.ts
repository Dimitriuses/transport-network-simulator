// Which scored journeys can integration actually help?
//
//   npm run headroom
//
// Specification: KNOWN-ISSUES.md #26.
//
// P0M9 grew the scored set from 22 hand-picked journeys to 132 generated ones,
// which fixed a resolution problem and diluted the journeys that need
// integration to about one in eight. On 105 of 120 comparable queries the
// announcement-limited optimum equals the reference policy: **there is nothing
// to win, and an itinerary with an extra leg is exposed to a cancellation
// nobody has announced yet.** A query set like that measures risk appetite.
//
// The criterion here is deliberately **not** `P1 − P0a`, even though that is
// what #26 measured. That difference mixes two things: the transfer graph and
// knowledge of the day. Disruptions are seeded, so a query would drift in and
// out of the scored set depending on which services happened to be cancelled,
// and the set would stop being a property of the city.
//
// What is left when the day is removed is the structural question, and it is
// the one that matters: **does the unrestricted transfer graph beat the
// restricted one?** P1 may only use interchanges somebody declared; a player
// may use any. Where those differ, integration has something to offer. Where
// they do not, no amount of skill changes the answer.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorld } from "@tns/core";
import { buildIndex, route, type Access } from "@tns/router";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
// `--json` emits the classification for a machine instead of a person, so the
// two-phase generated build can select a query set without anyone pasting a
// list (ROADMAP.md P1M2). Same criterion, same run — a second implementation
// of it is exactly what `CLAUDE.md` warns would drift.
const argv = process.argv.slice(2).filter((a) => a !== "--json");
const asJson = process.argv.includes("--json");
const worldPath = argv[0] ?? join(repoRoot, "worlds", "m1.world.db");

if (!existsSync(worldPath)) {
  console.error(`No world bundle at ${worldPath}. Build it: npm run world:build`);
  process.exit(1);
}

const world = loadWorld(worldPath);
const ix = buildIndex(world);

const accessFor = (queryId: string, endpoint: "origin" | "destination"): Access[] =>
  world.queryAccess
    .filter((a) => a.queryId === queryId && a.endpoint === endpoint)
    .map((a) => ({ quayId: a.quayId, seconds: Math.ceil(a.metres / world.manifest.walkSpeedMps) }))
    .sort((a, b) => (a.quayId < b.quayId ? -1 : 1));

/** Below this a difference is not worth a traveller's attention, or a gate's. */
const MEANINGFUL_S = 120;

interface Row {
  readonly id: string;
  readonly restrictedS: number | null;
  readonly openS: number | null;
  readonly gainS: number | null;
}

const rows: Row[] = world.queries.map((q) => {
  const o = accessFor(q.id, "origin");
  const d = accessFor(q.id, "destination");
  const restricted = route(ix, o, d, q.departAfterS, "obvious");
  const open = route(ix, o, d, q.departAfterS, "all");
  const restrictedS = restricted ? restricted.arriveS - q.departAfterS : null;
  const openS = open ? open.arriveS - q.departAfterS : null;
  return {
    id: q.id,
    restrictedS,
    openS,
    gainS: restrictedS !== null && openS !== null ? restrictedS - openS : null,
  };
});

const worth = rows.filter((r) => r.gainS !== null && r.gainS >= MEANINGFUL_S);
const nothing = rows.filter((r) => r.gainS !== null && r.gainS < MEANINGFUL_S);
const unroutable = rows.filter((r) => r.gainS === null);

const m = (s: number | null) => (s === null ? "  n/a" : `${(s / 60).toFixed(1)}m`);

if (asJson) {
  // Everything the selector needs, and the gains too — a caller choosing a
  // scored set may want the strongest journeys rather than an arbitrary slice.
  process.stdout.write(
    JSON.stringify({
      meaningfulS: MEANINGFUL_S,
      total: rows.length,
      improvable: worth.map((r) => ({ id: r.id, gainS: r.gainS })).sort((a, b) => (a.id < b.id ? -1 : 1)),
      flat: nothing.map((r) => r.id).sort(),
      unroutable: unroutable.map((r) => r.id).sort(),
    }),
  );
  process.exit(0);
}

console.log("");
console.log(`  REACHABLE HEADROOM — ${world.queries.length} scored queries`);
console.log("");
console.log("  Routing on the unrestricted transfer graph against the restricted");
console.log("  one the reference policy is held to. Where they agree, there is");
console.log("  nothing integration can win, and any extra leg a player takes is");
console.log("  pure exposure to a cancellation nobody announced.");
console.log("");
console.log(`  journeys integration can improve by ${MEANINGFUL_S}s or more   ` +
  `${worth.length} of ${world.queries.length}`);
console.log(`  journeys where it can win nothing                  ${nothing.length}`);
console.log(`  journeys no policy can route at all                ${unroutable.length}`);
console.log("");

const gains = worth.map((r) => r.gainS!).sort((a, b) => b - a);
if (gains.length > 0) {
  const total = gains.reduce((a, b) => a + b, 0);
  console.log(`  where it helps, the gain is ${m(total / gains.length)} on average, ` +
    `up to ${m(gains[0]!)}`);
  console.log("");
}

console.log("  The ids worth scoring, for tools/worldbuild/city.py:");
console.log("");
const ids = worth.map((r) => r.id).sort();
for (let i = 0; i < ids.length; i += 6) {
  console.log(`    ${ids.slice(i, i + 6).map((x) => `"${x}"`).join(", ")},`);
}
console.log("");
console.log("  A journey where the two policies agree is not easy — it is empty.");
console.log("  It contributes variance and downside risk and tests nothing about");
console.log("  integration. See KNOWN-ISSUES.md #26.");
console.log("");
