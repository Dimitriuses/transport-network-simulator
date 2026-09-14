// Where travellers went, regenerated rather than read.
//
// Specification: OBSERVABILITY.md §9 and §10; SCORING.md §12 (Q19).
//
// A run log records what was asked and answered, never where anyone walked:
// movements are derived state, a pure function of the world, the seed and the
// answers. So the viewer replays the run on its own recorded answers with an
// observer attached, and checks that the replay decided every traveller as the
// log says. A replay that disagrees is a different world or a different engine,
// and a timeline drawn from it would explain a run that never happened.

import type { Movement, RunHeader, RunRecord, TravellerOutcome, World } from "@tns/schema";
import { runOpenLoop } from "@tns/server";

export interface Regenerated {
  /** Every step each traveller took, in order. */
  readonly travellers: ReadonlyMap<string, readonly Movement[]>;
  /** What `P1` and `P0a` did for each query. */
  readonly references: ReadonlyMap<string, { readonly P1: readonly Movement[]; readonly P0a: readonly Movement[] }>;
}

export class ReplayDiverged extends Error {}

export async function regenerate(world: World, log: readonly RunRecord[]): Promise<Regenerated> {
  const header = log.find((r): r is RunHeader => r.kind === "run_header");
  if (!header) throw new ReplayDiverged("the run log has no header");
  if (header.worldContentHash !== world.manifest.contentHash) {
    throw new ReplayDiverged(
      `this run was on world ${header.worldContentHash.slice(0, 12)}, and the world given is ` +
        `${world.manifest.contentHash.slice(0, 12)}: a timeline drawn from another world explains nothing`,
    );
  }

  const travellers = new Map<string, Movement[]>();
  const references = new Map<string, { P1: Movement[]; P0a: Movement[] }>();

  const replayed = await runOpenLoop({
    world,
    // Never called: a replay answers from the log and starts no servers.
    playerBaseUrl: "http://127.0.0.1:0",
    operatorPort: 0,
    controlPort: 0,
    ...(header.loop === "closed"
      ? { loop: "closed" as const, appUserFraction: header.appUserFraction ?? 1 }
      : {}),
    replay: log,
    observe: {
      traveller(ref, m) {
        let list = travellers.get(ref);
        if (!list) travellers.set(ref, (list = []));
        list.push(m);
      },
      reference(queryId, policy, m) {
        let entry = references.get(queryId);
        if (!entry) references.set(queryId, (entry = { P1: [], P0a: [] }));
        entry[policy].push(m);
      },
    },
  });

  // The replay must have decided every traveller as the run did.
  const decided = (records: readonly RunRecord[]) =>
    new Map(
      records
        .filter((r): r is TravellerOutcome => r.kind === "traveller")
        .map((t) => [t.travellerRef, JSON.stringify(t)]),
    );
  const original = decided(log);
  const again = decided(replayed);
  for (const [ref, record] of original) {
    if (again.get(ref) !== record) {
      throw new ReplayDiverged(
        `replaying the run decided ${ref} differently from its log — the engine or the world ` +
          `has changed since the run, so its movements cannot be regenerated`,
      );
    }
  }

  return { travellers, references };
}
