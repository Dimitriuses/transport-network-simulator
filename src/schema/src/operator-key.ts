// A name for an operator that survives the operator being renamed.
//
// Specification: KNOWN-ISSUES.md #59, #48.
//
// **The memorising reference solution has to recognise "the same operator" on
// another world of a rung, and an operator's id cannot do that.** Since P1M6 ids
// are generated from the world's seed, so two worlds of one rung share none. An
// answer key keyed by id therefore resolved against nothing on any genuinely
// different world, `tuned` read no feed at all, and `npm run transfer` certified
// Phase 1's exit on two worlds identical except for their operators' names —
// `tuned` 0.294 -> -0.600, which is `null`'s headline to three places.
//
// **What survives a rename**, measured on worlds of one rung from different city
// seeds, and every one of them published, so it is study rather than `cheat`:
//
//   kind    the last word of the operator's name — Transit, Tram, Metro,
//           Regional. The brief and every timetable carry the name.
//   lines   how many routes it runs.
//   trips   how many trips it runs. Every journey is published, so this is one
//           number whether it is read off the world or off the feed.
//
// **Not distinct stops.** `A-granularity` publishes one station for its
// platforms, so the number of stops an operator publishes is a conflict draw
// rather than a property of the operator, and a key built on it would
// mis-resolve for reasons that are about the conflicts — which is exactly what
// the transfer test must be able to tell apart from memorisation.
//
// Within a kind, an operator's rank is how many of that kind run more lines, or
// as many lines and more trips. On every single-centre rung that gives a unique
// key, and the same key picks out the same role in both worlds of a pair —
// checked against dialect, which the generator assigns by role.
//
// **A tie has no key.** Two operators of one kind running identical lines and
// trips cannot be told apart by anything a rename leaves, and a polycentric
// region's towns are symmetric, so its trams tie on everything. `null` rather
// than a tiebreak on the id is the point: breaking the tie with something the
// seed renames would quietly bring back the defect this exists to remove.

/** The published facts a key is built from. A timetable, from either side, satisfies it. */
export interface PublishedOperator {
  readonly operator: string;
  readonly operator_name: string;
  readonly routes: readonly unknown[];
  readonly trips: readonly unknown[];
}

/** The kind an operator's name declares: its last word. */
export function operatorKind(name: string): string {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? "";
}

/**
 * Every operator's rename-proof key, `Kind#rank`, keyed by its id in *this*
 * world — or `null` where it ties with another of its kind.
 *
 * Depends on neither the order operators arrive in nor their ids, which is what
 * makes it a key and what its test asserts.
 */
export function operatorKeys(operators: readonly PublishedOperator[]): Map<string, string | null> {
  const shaped = operators.map((o) => ({
    id: o.operator,
    kind: operatorKind(o.operator_name),
    lines: o.routes.length,
    trips: o.trips.length,
  }));

  const out = new Map<string, string | null>();
  for (const me of shaped) {
    const peers = shaped.filter((o) => o !== me && o.kind === me.kind);
    if (peers.some((o) => o.lines === me.lines && o.trips === me.trips)) {
      out.set(me.id, null);
      continue;
    }
    const ahead = peers.filter(
      (o) => o.lines > me.lines || (o.lines === me.lines && o.trips > me.trips),
    ).length;
    out.set(me.id, `${me.kind}#${ahead}`);
  }
  return out;
}
