// Seeded PRNG.
//
// Math.random is banned in this package: it is not seedable, and the entire
// project rests on runs being reproducible from a seed (CLAUDE.md).
//
// One seed, threaded explicitly. Never a module-level default instance — a
// shared implicit generator couples unrelated parts of the simulation and makes
// their draw order an accident of call sequence.

/** mulberry32. Same generator the DES benchmark uses; see benchmarks/. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Uniform integer in [0, bound). */
export function below(rng: () => number, bound: number): number {
  return rng() % bound;
}
