// A competent integrator.
//
// Unlike `naive`, this one does the job. It sees exactly what any player sees —
// the brief, three operator APIs, and nothing else — but it does not take any
// of it at face value.
//
// It exists for two reasons: it is the honest instrument for Phase 0's Gate 1
// and Gate 2 (`docs/PHASES.md`), and it is the worked example a player can read
// to see what "doing it properly" looks like. Every technique here is a
// response to a specific conflict in `CORECONCEPT.md` §2.1, and none of them
// required being told which conflicts were active.
//
// **Caveat, stated plainly:** this was written by someone who knows the world.
// A genuine Gate 1 test needs somebody who does not.

interface Stop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lon: number;
}
interface StopTime {
  stop_id: string;
  seq: number;
  arrive: string | number;
  depart: string | number;
}
interface Trip {
  trip_id: string;
  route_id: string;
  heading: string;
  stop_times: StopTime[];
}
export interface Timetable {
  operator: string;
  stops: Stop[];
  routes: { route_id: string; route_name: string }[];
  trips: Trip[];
}

// ---------------------------------------------------------------- time

/**
 * Work out what an operator means by a timestamp, from the data alone.
 *
 * Three operators, three encodings, and no field anywhere saying which
 * (catalogue B). The shapes are distinguishable; the trap is the string with no
 * offset, which looks finished and is not.
 */
export function detectTimeDecoder(t: Timetable, worldOffsetS: number): (v: string | number) => number {
  const sample = t.trips[0]?.stop_times[0]?.depart;

  if (typeof sample === "number") {
    // Epoch seconds. τ counts from local midnight, so undo the world offset.
    return (v) => (typeof v === "number" ? v + worldOffsetS : Number.NaN);
  }

  const hasOffset = typeof sample === "string" && /[+-]\d{2}:\d{2}$/.test(sample);
  return (v) => {
    if (typeof v !== "string") return Number.NaN;
    const d = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(v);
    if (!d) return Number.NaN;
    const local =
      (Number(d[3]) - 7) * 86400 + Number(d[4]) * 3600 + Number(d[5]) * 60 + Number(d[6]);
    if (!hasOffset) {
      // No offset. It is *not* UTC — it is this world's local time, which the
      // brief states even though the operator does not. Assuming UTC is the
      // plausible, unexamined, wrong choice, and costs three hours.
      return local;
    }
    const m = /([+-])(\d{2}):(\d{2})$/.exec(v);
    if (!m) return local;
    const offset = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
    return local - (offset - worldOffsetS);
  };
}

// ------------------------------------------------------------ geometry

const metres = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const dLat = (aLat - bLat) * 111_320;
  const dLon = (aLon - bLon) * 71_000;
  return Math.sqrt(dLat * dLat + dLon * dLon);
};

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/**
 * Recover a systematic coordinate offset without being told there is one.
 *
 * Ostline publishes in a legacy grid, converted approximately: every position
 * is displaced by the same ~130 m (catalogue C). Truncation would be noise a
 * threshold could absorb; a consistent displacement cannot be, because
 * widening the threshold recovers nothing and only adds wrong pairs.
 *
 * But a *consistent* error is also a recoverable one. Pair each of this
 * operator's stops with its nearest stop from a reference operator, take the
 * **median** displacement — median, not mean, so genuinely distant stops with
 * no counterpart cannot drag it — and subtract it. A real datum shift is
 * exactly this shape.
 */
/**
 * Recover a systematic coordinate offset — as far as it *can* be recovered.
 *
 * **This does not fully work, and the reason is worth understanding.** Ostline
 * is displaced ~130 m; its stops genuinely sit ~80 m from their Nordline
 * counterparts. Those two magnitudes are the same order, so proximity alone
 * cannot separate "your coordinates are shifted" from "your stops really are
 * over there". The estimate comes out at ~223 m — the true displacement plus
 * the real separation, which is exactly what nearest-neighbour geometry
 * measures and cannot decompose.
 *
 * So this over-corrects, landing Ostline's stops roughly *on top of* their
 * neighbours. That still enables the right transfers, but it makes them look
 * free when they cost eighty metres of walking. The honest response is not a
 * cleverer estimator — it is to stop trusting the geometry and put a floor
 * under transfer times (see `walkableLinks`).
 */
export function estimateOffset(
  subject: Timetable,
  reference: Timetable,
): { dLat: number; dLon: number } {
  let dLat = 0;
  let dLon = 0;

  // Chicken and egg: matching needs the offset, and estimating the offset
  // needs matches. A single pass gets it badly wrong — the displacement is
  // large enough that a stop's nearest neighbour is often not its counterpart.
  //
  // So iterate. Estimate from whatever pairs currently look right, correct,
  // re-match, estimate again. Three passes is ample for a rigid shift, and the
  // estimate is stable long before that. This is the same idea as iterative
  // closest point, in one dimension of trouble.
  for (let pass = 0; pass < 3; pass++) {
    const shifted = subject.stops.map((s) => ({ s, lat: s.lat - dLat, lon: s.lon - dLon }));

    // Only **mutual** nearest neighbours count: A's closest must be B, and B's
    // closest must be A. A one-sided nearest match happily pairs three tram
    // stops with the same bus stop and drags the estimate wherever that stop
    // happens to be.
    const nearestRef = new Map<string, { id: string; d: number }>();
    for (const x of shifted) {
      let best: { id: string; d: number } | null = null;
      for (const r of reference.stops) {
        const d = metres(x.lat, x.lon, r.lat, r.lon);
        if (!best || d < best.d) best = { id: r.stop_id, d };
      }
      if (best) nearestRef.set(x.s.stop_id, best);
    }

    const nearestSub = new Map<string, { id: string; d: number }>();
    for (const r of reference.stops) {
      let best: { id: string; d: number } | null = null;
      for (const x of shifted) {
        const d = metres(x.lat, x.lon, r.lat, r.lon);
        if (!best || d < best.d) best = { id: x.s.stop_id, d };
      }
      if (best) nearestSub.set(r.stop_id, best);
    }

    const dLats: number[] = [];
    const dLons: number[] = [];
    for (const x of shifted) {
      const ref = nearestRef.get(x.s.stop_id);
      if (!ref || ref.d > 400) continue;
      if (nearestSub.get(ref.id)?.id !== x.s.stop_id) continue; // not mutual

      const r = reference.stops.find((z) => z.stop_id === ref.id)!;
      dLats.push(x.s.lat - r.lat);
      dLons.push(x.s.lon - r.lon);
    }

    // Too few confident pairs to say anything. Better to claim no offset than
    // to invent one from noise.
    if (dLats.length < 3) return { dLat, dLon };

    const nLat = median(dLats);
    const nLon = median(dLons);
    if (Math.abs(nLat - dLat) < 1e-6 && Math.abs(nLon - dLon) < 1e-6) break;
    dLat = nLat;
    dLon = nLon;
  }

  return { dLat, dLon };
}

// ------------------------------------------------------------ matching

/** Minimum transfer budget where the geometry cannot be trusted. */
export const TRANSFER_FLOOR_S = 60;

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(/\bstreet\b|\bst\b/g, "st")
    .replace(/\bsquare\b|\bsq\b/g, "sq")
    .replace(/\bgarden\b|\bgdn\b/g, "gdn")
    .replace(/\bterminus\b|\bterm\b/g, "term")
    .replace(/\buniversity\b|\buniv\b/g, "univ")
    .replace(/\bobservatory\b|\bobs\b/g, "obs")
    .replace(/\bdepot\b|\bdep\b/g, "dep")
    .replace(/\bplatform\b|\bpl\b|\bstand\b|\bstd\b/g, "")
    .replace(/\btram stop\b|\btram\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Cheap token overlap. Enough to tell "Central Sq" from "Riverside". */
function nameSimilarity(a: string, b: string): number {
  const A = new Set(normalise(a).split(" ").filter(Boolean));
  const B = new Set(normalise(b).split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / Math.max(A.size, B.size);
}

export interface MatchedStop {
  /** `${operator}:${stop_id}` — never the bare id, which collides. */
  readonly key: string;
  readonly operator: string;
  readonly stopId: string;
  readonly lat: number;
  readonly lon: number;
  readonly name: string;
}

/**
 * Decide which published stops are close enough to walk between.
 *
 * Note what this does *not* do: fuse them. Two quays 80 m apart are two places,
 * and a transfer between them costs 80 m of walking. Merging them into one
 * node is what makes a lazy integrator promise instant transfers it cannot
 * deliver — and then lose the connection it was counting on.
 */
export function walkableLinks(
  stops: readonly MatchedStop[],
  maxM: number,
): Map<string, { key: string; seconds: number }[]> {
  const links = new Map<string, { key: string; seconds: number }[]>();
  for (const a of stops) {
    for (const b of stops) {
      if (a.key === b.key) continue;
      const d = metres(a.lat, a.lon, b.lat, b.lon);
      // Distance is the main signal; a matching name promotes a borderline
      // pair, because two things called "Central Sq" 150 m apart usually are
      // the same interchange.
      const limit = nameSimilarity(a.name, b.name) > 0.5 ? maxM * 1.5 : maxM;
      if (d > limit) continue;
      let list = links.get(a.key);
      if (!list) links.set(a.key, (list = []));
      // A floor, not a computed time. At least one operator's coordinates are
      // systematically displaced by an amount that cannot be separated from
      // genuine stop separation (see `estimateOffset`), so the corrected
      // distance is not to be believed — two stops sitting on top of each other
      // after correction may still be a two-minute walk apart.
      //
      // Budgeting generously loses a few tight connections. Trusting the
      // geometry promises connections that do not exist, which is worse: the
      // traveller is already standing on the platform when it turns out to be
      // wrong.
      const seconds = Math.max(TRANSFER_FLOOR_S, Math.ceil(d / 1.3));
      list.push({ key: b.key, seconds });
    }
  }
  for (const l of links.values()) l.sort((x, y) => x.seconds - y.seconds);
  return links;
}

// ------------------------------------------------------------ realtime

export interface RealtimeView {
  /** Trips that will not run at all. Do not board these. */
  readonly cancelled: Set<string>;
  /** Trips that will run late, and by how much. Still boardable. */
  readonly delayed: Map<string, number>;
}

/**
 * Read a realtime feed without believing it.
 *
 * Three things this handles that a naive reader does not:
 *
 *   * **units** — a "delay" of 3 from an operator whose other delays are 120,
 *     300, 600 is minutes, not seconds (catalogue C). Magnitude gives it away;
 *     nothing in the payload says so.
 *   * **silent drops** — a trip that was in the last feed and is now simply
 *     absent has not become punctual. It is cancelled and the operator did not
 *     say so (catalogue D, the ghost trip).
 *   * **staleness** — `as_of` says what instant the feed describes, which is
 *     not when it was fetched. A feed five minutes behind is not evidence that
 *     nothing has happened.
 */
export function readRealtime(
  operator: string,
  updates: readonly { trip_id: string; status: string; delay?: number }[],
  previouslySeen: ReadonlySet<string>,
): RealtimeView {
  const cancelled = new Set<string>();
  const delayed = new Map<string, number>();
  const present = new Set<string>();

  const delays = updates.map((u) => u.delay ?? 0).filter((d) => d > 0);
  // Whole small numbers across the board mean minutes.
  const looksLikeMinutes = delays.length > 0 && delays.every((d) => d < 60 && Number.isInteger(d));

  for (const u of updates) {
    present.add(`${operator}:${u.trip_id}`);
    if (u.status === "cancelled") {
      cancelled.add(`${operator}:${u.trip_id}`);
      continue;
    }
    if (u.status === "delayed") {
      // A late service is still a service. Refusing to board it would trade a
      // few minutes of delay for a wholly different and usually worse route —
      // an over-cautious integrator is its own kind of bad.
      const seconds = looksLikeMinutes ? (u.delay ?? 0) * 60 : (u.delay ?? 0);
      if (seconds > 0) delayed.set(`${operator}:${u.trip_id}`, seconds);
    }
  }

  // A trip that has vanished since we last looked has not become punctual.
  for (const key of previouslySeen) {
    if (key.startsWith(`${operator}:`) && !present.has(key)) cancelled.add(key);
  }

  return { cancelled, delayed };
}

export { metres as roughMetres, nameSimilarity };
