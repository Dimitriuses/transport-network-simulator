# Benchmarks

Measurements that back decisions recorded in [`TECHNICAL-RESEARCH.md`](../docs/TECHNICAL-RESEARCH.md). Each benchmark exists to answer one specific question that was otherwise going to be settled by guesswork.

## `des-core/` — simulation core throughput

**Question it answered:** can a TypeScript core carry a realistic number of simulated passengers over a simulated day, or does the language choice cap the project's scale?

**Answer:** it is not the constraint. See [`TECHNICAL-RESEARCH.md` §11](../docs/TECHNICAL-RESEARCH.md).

### Running it

```
cd des-core
node run-all.mjs                  # default: 200k and 1M passengers
node run-all.mjs 50000 500000     # custom sizes
```

Individual implementations:

```
node bench.ts typed 1000000
node bench.ts obj   1000000
python bench.py     1000000
```

No dependencies and no build step. Node ≥ 22.18 runs the `.ts` file directly by stripping types; Python needs only the standard library.

### What it measures

A binary-heap discrete-event loop over a transit-shaped event mix — passenger start, arrive-at-stop, board, alight, and vehicle-stop — with 4 000 stops, 2 000 vehicles, 40 stops per vehicle, 3 legs per passenger. Three implementations:

| | Description |
|---|---|
| `bench.ts typed` | Struct-of-arrays over `Float64Array` / `Int32Array` / `Uint32Array` |
| `bench.ts obj` | Idiomatic one-object-per-event |
| `bench.py` | Python with `heapq` — the C implementation, so this is the strongest reasonable Python baseline, not a straw man |

All three break scheduling ties by insertion sequence, because the real simulator requires deterministic tie-breaking and its cost belongs in the measurement.

### Why the comparison is trustworthy

Equivalence is enforced rather than asserted:

* the RNG is a mulberry32 that is **bit-identical** across TypeScript and Python;
* control flow never branches on RNG output, so event counts cannot drift;
* each implementation emits a **final-state checksum** over all mutable state;
* `run-all.mjs` **fails the run** if the checksums disagree at any size.

If you change one implementation and forget the others, the harness tells you instead of silently reporting a meaningless speedup.

### What it does *not* measure

Only the event loop. Real per-event work is heavier, and the operator API layer plus player round-trips are expected to dominate total run time. Treat these numbers as a ceiling on the core, not as a prediction of end-to-end performance.

Caveats: one machine, one run per configuration, synthetic per-event work. The ratios are large; the precision is not.
