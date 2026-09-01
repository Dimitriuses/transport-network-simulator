// DELIBERATELY BROKEN. Do not fix.
//
// Every line below violates one of the four determinism rules. The test in
// ../determinism.test.ts lints this file and asserts that ESLint rejects it.
// If this file ever passes lint, the rules have stopped working and the
// project's reproducibility guarantee is silently gone.
//
// Excluded from the normal lint run and from typechecking. See
// eslint.config.mjs and src/core/tsconfig.json.

// 1. async / await / Promises
export async function fetchesSomething(): Promise<number> {
  const value = await Promise.resolve(1);
  return value;
}

// 2. wall-clock reads
export function readsWallClock(): number {
  const a = Date.now();
  const b = new Date().getTime();
  const c = performance.now();
  return a + b + c;
}

// 3. unseeded randomness
export function rollsUnseeded(): number {
  return Math.random();
}

// 4. transcendental Math functions
export function usesTranscendentals(x: number): number {
  return Math.sin(x) + Math.cos(x) + Math.exp(x) + Math.pow(x, 2) + Math.log(x);
}
