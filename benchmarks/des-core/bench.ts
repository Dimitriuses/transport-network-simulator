/**
 * Discrete-event simulation core benchmark — TypeScript / Node.
 *
 * Measures the throughput ceiling of the event loop that would sit at the heart
 * of the simulator: a priority queue over a transit-shaped event mix.
 *
 * Two representations are measured:
 *   "obj"   — idiomatic one-object-per-event
 *   "typed" — struct-of-arrays over TypedArrays
 *
 * Run directly (Node >= 22.18 strips types natively, no build step):
 *   node bench.ts obj   200000
 *   node bench.ts typed 1000000
 *
 * See ../README.md for results and interpretation.
 */

// ---------------------------------------------------------------- parameters

const NSTOPS = 4000;
const NVEH = 2000;
const VEH_STOPS = 40;
const LEGS = 3;

// Plain consts rather than `enum`: `enum` is not erasable syntax, so it would
// force a build step. Everything here stays runnable by `node bench.ts`.
const PAX_START = 0;
const PAX_ARRIVE = 1;
const PAX_BOARD = 2;
const PAX_ALIGHT = 3;
const VEH_STOP = 4;

type Kind = 0 | 1 | 2 | 3 | 4;

const M32 = 0xffffffff;

/** mulberry32. Bit-identical to the Python implementation in bench.py. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

export interface Result {
  runtime: string;
  mode: string;
  pax: number;
  events: number;
  seconds: number;
  events_per_sec: number;
  checksum: number;
  rss_mb?: number;
}

// -------------------------------------------------------- object-based core

interface Event {
  time: number;
  kind: Kind;
  ent: number;
  seq: number;
}

function runObjects(npax: number): { events: number; checksum: number } {
  const rng = makeRng(12345);
  const waiting = new Array<number>(NSTOPS).fill(0);
  const vehLoad = new Array<number>(NVEH).fill(0);
  const paxLeg = new Array<number>(npax).fill(0);
  const vehStopCount = new Array<number>(NVEH).fill(0);

  const heap: Event[] = [];
  let seq = 0;

  // Ties are broken by insertion sequence. A real simulator needs deterministic
  // tie-breaking, so its cost belongs in the measurement.
  const less = (a: Event, b: Event): boolean =>
    a.time < b.time || (a.time === b.time && a.seq < b.seq);

  function push(time: number, kind: Kind, ent: number): void {
    const node: Event = { time, kind, ent, seq: seq++ };
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(node, heap[p]!)) break;
      heap[i] = heap[p]!;
      i = p;
    }
    heap[i] = node;
  }

  function pop(): Event {
    const top = heap[0]!;
    const last = heap.pop()!;
    const n = heap.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        if (l >= n) break;
        let m = l;
        if (r < n && less(heap[r]!, heap[l]!)) m = r;
        if (!less(heap[m]!, last)) break;
        heap[i] = heap[m]!;
        i = m;
      }
      heap[i] = last;
    }
    return top;
  }

  for (let p = 0; p < npax; p++) push(rng() % 86400, PAX_START, p);
  for (let v = 0; v < NVEH; v++) push(rng() % 3600, VEH_STOP, v);

  let processed = 0;
  while (heap.length > 0) {
    const e = pop();
    processed++;
    const t = e.time;
    const ent = e.ent;
    switch (e.kind) {
      case PAX_START:
        waiting[rng() % NSTOPS]!++;
        push(t + 60 + (rng() % 600), PAX_ARRIVE, ent);
        break;
      case PAX_ARRIVE:
        waiting[rng() % NSTOPS]!--;
        push(t + 30 + (rng() % 900), PAX_BOARD, ent);
        break;
      case PAX_BOARD:
        vehLoad[rng() % NVEH]!++;
        push(t + 120 + (rng() % 1800), PAX_ALIGHT, ent);
        break;
      case PAX_ALIGHT:
        vehLoad[rng() % NVEH]!--;
        paxLeg[ent]!++;
        if (paxLeg[ent]! < LEGS) push(t + 60 + (rng() % 300), PAX_ARRIVE, ent);
        break;
      case VEH_STOP: {
        const s = rng() % NSTOPS;
        const dwell = 15 + (waiting[s]! > 0 ? 2 : 0) + (rng() % 45);
        vehStopCount[ent]!++;
        if (vehStopCount[ent]! < VEH_STOPS) {
          push(t + dwell + 60 + (rng() % 180), VEH_STOP, ent);
        }
        break;
      }
    }
  }

  return { events: processed, checksum: checksum(waiting, vehLoad, paxLeg, processed) };
}

// ----------------------------------------------- struct-of-arrays / typed core

function runTyped(npax: number): { events: number; checksum: number } {
  const rng = makeRng(12345);
  const waiting = new Int32Array(NSTOPS);
  const vehLoad = new Int32Array(NVEH);
  const paxLeg = new Uint8Array(npax);
  const vehStopCount = new Uint8Array(NVEH);

  // Peak queue depth is bounded: every passenger and vehicle holds at most one
  // scheduled event at a time.
  const cap = npax + NVEH + 16;
  const hTime = new Float64Array(cap);
  const hPay = new Int32Array(cap); // kind << 28 | ent
  const hSeq = new Uint32Array(cap);
  let n = 0;
  let seq = 0;

  function push(time: number, kind: Kind, ent: number): void {
    const pay = (kind << 28) | ent;
    const sq = seq++;
    let i = n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hTime[p]! < time || (hTime[p]! === time && hSeq[p]! < sq)) break;
      hTime[i] = hTime[p]!;
      hPay[i] = hPay[p]!;
      hSeq[i] = hSeq[p]!;
      i = p;
    }
    hTime[i] = time;
    hPay[i] = pay;
    hSeq[i] = sq;
  }

  let popTime = 0;
  let popPay = 0;

  function pop(): void {
    popTime = hTime[0]!;
    popPay = hPay[0]!;
    n--;
    if (n > 0) {
      const lt = hTime[n]!;
      const lp = hPay[n]!;
      const ls = hSeq[n]!;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        if (l >= n) break;
        let m = l;
        if (r < n && (hTime[r]! < hTime[l]! || (hTime[r]! === hTime[l]! && hSeq[r]! < hSeq[l]!))) {
          m = r;
        }
        if (hTime[m]! > lt || (hTime[m]! === lt && hSeq[m]! > ls)) break;
        hTime[i] = hTime[m]!;
        hPay[i] = hPay[m]!;
        hSeq[i] = hSeq[m]!;
        i = m;
      }
      hTime[i] = lt;
      hPay[i] = lp;
      hSeq[i] = ls;
    }
  }

  for (let p = 0; p < npax; p++) push(rng() % 86400, PAX_START, p);
  for (let v = 0; v < NVEH; v++) push(rng() % 3600, VEH_STOP, v);

  let processed = 0;
  while (n > 0) {
    pop();
    processed++;
    const t = popTime;
    const kind = (popPay >>> 28) as Kind;
    const ent = popPay & 0x0fffffff;
    switch (kind) {
      case PAX_START:
        waiting[rng() % NSTOPS]++;
        push(t + 60 + (rng() % 600), PAX_ARRIVE, ent);
        break;
      case PAX_ARRIVE:
        waiting[rng() % NSTOPS]--;
        push(t + 30 + (rng() % 900), PAX_BOARD, ent);
        break;
      case PAX_BOARD:
        vehLoad[rng() % NVEH]++;
        push(t + 120 + (rng() % 1800), PAX_ALIGHT, ent);
        break;
      case PAX_ALIGHT:
        vehLoad[rng() % NVEH]--;
        paxLeg[ent]++;
        if (paxLeg[ent]! < LEGS) push(t + 60 + (rng() % 300), PAX_ARRIVE, ent);
        break;
      case VEH_STOP: {
        const s = rng() % NSTOPS;
        const dwell = 15 + (waiting[s]! > 0 ? 2 : 0) + (rng() % 45);
        vehStopCount[ent]++;
        if (vehStopCount[ent]! < VEH_STOPS) {
          push(t + dwell + 60 + (rng() % 180), VEH_STOP, ent);
        }
        break;
      }
    }
  }

  return { events: processed, checksum: checksum(waiting, vehLoad, paxLeg, processed) };
}

// --------------------------------------------------------------- equivalence

/**
 * Final-state fingerprint. All three implementations (obj, typed, Python) must
 * agree — that is what proves they performed identical work, rather than merely
 * similar-looking work.
 */
function checksum(
  waiting: ArrayLike<number>,
  vehLoad: ArrayLike<number>,
  paxLeg: ArrayLike<number>,
  processed: number,
): number {
  let a = 0;
  for (let i = 0; i < waiting.length; i++) a = (a + Math.imul(waiting[i]!, 31)) | 0;
  for (let i = 0; i < vehLoad.length; i++) a = (a + Math.imul(vehLoad[i]!, 17)) | 0;
  for (let i = 0; i < paxLeg.length; i++) a = (a + Math.imul(paxLeg[i]!, 7)) | 0;
  return ((a + processed) >>> 0) as number;
}

// ---------------------------------------------------------------------- main

const mode = process.argv[2] ?? "obj";
const npax = Number.parseInt(process.argv[3] ?? "200000", 10);
const fn = mode === "typed" ? runTyped : runObjects;

// Warm-up, so we measure steady-state JIT output rather than the interpreter tier.
fn(Math.min(20000, npax));

const t0 = process.hrtime.bigint();
const out = fn(npax);
const t1 = process.hrtime.bigint();
const secs = Number(t1 - t0) / 1e9;

const result: Result = {
  runtime: `node ${process.version}`,
  mode,
  pax: npax,
  events: out.events,
  seconds: Number(secs.toFixed(3)),
  events_per_sec: Math.round(out.events / secs),
  checksum: out.checksum,
  rss_mb: Number((process.memoryUsage().rss / 1048576).toFixed(1)),
};
console.log(JSON.stringify(result));
