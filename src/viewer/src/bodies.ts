// The bytes a player was served, given back on demand.
//
// Specification: OBSERVABILITY.md §4 and §7; PLAYER-CONTRACT.md §6.4.
//
// The snapshot rule makes a response a pure function of (operator, endpoint, τ),
// so the viewer regenerates a body rather than storing it, and checks the hash
// the run recorded. A body that does not match its hash is not the body the
// player saw, and is refused rather than shown: the engine or the world has
// moved since the run. Measured at P2M3 at 3–8 ms per body.

import { createHash } from "node:crypto";
import type { IngestionRecord, World } from "@tns/schema";
import type { Disruption } from "@tns/core";
import { operatorDocs, projectOperator, projectRealtime } from "@tns/projections";
import { operatorSite } from "@tns/portal";

export type RegeneratedBody =
  | { readonly ok: true; readonly body: string; readonly source: "verbatim" | "regenerated" }
  | { readonly ok: false; readonly reason: string };

export function bodyOf(world: World, day: readonly Disruption[], call: IngestionRecord): RegeneratedBody {
  if (call.body !== undefined) return { ok: true, body: call.body, source: "verbatim" };

  let body: string;
  if (call.endpoint === "GET /realtime") {
    const m = world.manifest.operators.find((o) => o.id === call.operator)?.manifest as
      | { realtime: Parameters<typeof projectRealtime>[3] }
      | undefined;
    if (!m) return { ok: false, reason: `no operator ${call.operator} in this world` };
    body = JSON.stringify(projectRealtime(world, call.operator, day, m.realtime, call.tau));
  } else if (call.endpoint === "GET /timetable") {
    body = JSON.stringify(projectOperator(world, call.operator, call.tau).timetable);
  } else if (call.endpoint === "GET /docs") {
    body = JSON.stringify(operatorDocs(world, call.operator));
  } else if (/^GET \/docs(\/\w+)? \(html\)$/.test(call.endpoint)) {
    const subpage = /^GET \/docs(?:\/(\w+))? \(html\)$/.exec(call.endpoint)?.[1] ?? "";
    body = operatorSite(world, call.operator, subpage);
  } else {
    return { ok: false, reason: `${call.endpoint} returned ${call.status}; there is no body worth regenerating` };
  }

  const hash = createHash("sha256").update(body).digest("hex").slice(0, 16);
  if (hash !== call.bodyHash) {
    return {
      ok: false,
      reason: `regenerated body hashes to ${hash}, and the run recorded ${call.bodyHash}: this is not what the player was served`,
    };
  }
  return { ok: true, body, source: "regenerated" };
}
