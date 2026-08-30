"""Discrete-event simulation core benchmark -- Python.

Baseline counterpart to bench.ts. Same parameters, same event mix, same RNG
stream, same deterministic tie-breaking, so the final-state checksum must match
the TypeScript implementations exactly.

Uses heapq, whose C implementation favours Python -- this is deliberately the
strongest reasonable Python baseline, not a straw man.

Run:
    python bench.py 200000

See ../README.md for results and interpretation.
"""

import heapq
import json
import sys
import time

# ---------------------------------------------------------------- parameters

NSTOPS = 4000
NVEH = 2000
VEH_STOPS = 40
LEGS = 3

K_PAX_START, K_PAX_ARRIVE, K_PAX_BOARD, K_PAX_ALIGHT, K_VEH_STOP = 0, 1, 2, 3, 4

M32 = 0xFFFFFFFF


def make_rng(seed):
    """mulberry32. Bit-identical to the TypeScript implementation in bench.ts."""
    a = seed & M32

    def rng():
        nonlocal a
        a = (a + 0x6D2B79F5) & M32
        t = a
        t = ((t ^ (t >> 15)) * (1 | t)) & M32
        t = (((t + (((t ^ (t >> 7)) * (61 | t)) & M32)) & M32) ^ t) & M32
        return (t ^ (t >> 14)) & M32

    return rng


def checksum(waiting, veh_load, pax_leg, processed):
    """Final-state fingerprint; must equal the value produced by bench.ts."""
    a = 0
    for v in waiting:
        a = (a + v * 31) & M32
    for v in veh_load:
        a = (a + v * 17) & M32
    for v in pax_leg:
        a = (a + v * 7) & M32
    return (a + processed) & M32


def run(npax):
    rng = make_rng(12345)
    waiting = [0] * NSTOPS
    veh_load = [0] * NVEH
    pax_leg = [0] * npax
    veh_stop_count = [0] * NVEH

    heap = []
    push = heapq.heappush
    pop = heapq.heappop
    seq = 0

    # Ties are broken by insertion sequence, matching bench.ts.
    for p in range(npax):
        push(heap, (rng() % 86400, seq, K_PAX_START, p))
        seq += 1
    for v in range(NVEH):
        push(heap, (rng() % 3600, seq, K_VEH_STOP, v))
        seq += 1

    processed = 0
    while heap:
        t, _, kind, ent = pop(heap)
        processed += 1

        if kind == K_PAX_START:
            waiting[rng() % NSTOPS] += 1
            push(heap, (t + 60 + rng() % 600, seq, K_PAX_ARRIVE, ent))
            seq += 1
        elif kind == K_PAX_ARRIVE:
            waiting[rng() % NSTOPS] -= 1
            push(heap, (t + 30 + rng() % 900, seq, K_PAX_BOARD, ent))
            seq += 1
        elif kind == K_PAX_BOARD:
            veh_load[rng() % NVEH] += 1
            push(heap, (t + 120 + rng() % 1800, seq, K_PAX_ALIGHT, ent))
            seq += 1
        elif kind == K_PAX_ALIGHT:
            veh_load[rng() % NVEH] -= 1
            pax_leg[ent] += 1
            if pax_leg[ent] < LEGS:
                push(heap, (t + 60 + rng() % 300, seq, K_PAX_ARRIVE, ent))
                seq += 1
        else:
            s = rng() % NSTOPS
            dwell = 15 + (2 if waiting[s] > 0 else 0) + rng() % 45
            veh_stop_count[ent] += 1
            if veh_stop_count[ent] < VEH_STOPS:
                push(heap, (t + dwell + 60 + rng() % 180, seq, K_VEH_STOP, ent))
                seq += 1

    return processed, checksum(waiting, veh_load, pax_leg, processed)


def main():
    npax = int(sys.argv[1]) if len(sys.argv) > 1 else 200000

    run(min(20000, npax))  # warm-up, for parity with the TypeScript harness

    t0 = time.perf_counter()
    processed, chk = run(npax)
    secs = time.perf_counter() - t0

    print(json.dumps({
        "runtime": "python " + sys.version.split()[0],
        "mode": "heapq",
        "pax": npax,
        "events": processed,
        "seconds": round(secs, 3),
        "events_per_sec": round(processed / secs),
        "checksum": chk,
    }))


if __name__ == "__main__":
    main()
