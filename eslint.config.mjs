// @ts-check
import tseslint from "typescript-eslint";

/**
 * The four determinism rules.
 *
 * These are not style preferences. The entire project rests on runs being
 * reproducible from a seed: open-loop scoring, the golden-trajectory test and
 * cross-machine comparability all depend on it. Violating one of these breaks
 * the project in ways that surface much later as unexplainable score
 * differences.
 *
 * Required by TECHNICAL-RESEARCH.md §11 and TIME-MODEL.md §1. See CLAUDE.md.
 *
 * If one of these blocks you, the design is probably wrong. Raise it rather
 * than adding an exception.
 */
const NO_ASYNC =
  "No async/await in the simulation core: it introduces non-deterministic " +
  "ordering and puts I/O in the model. Keep the core synchronous; I/O lives " +
  "at the boundary. (TECHNICAL-RESEARCH.md §11)";

const NO_WALL_CLOCK =
  "No wall-clock reads in the simulation core: wall time is not part of the " +
  "model. Use the injected virtual clock. (TIME-MODEL.md §1)";

const NO_MATH_RANDOM =
  "No Math.random in the simulation core: it is not seedable. Use the " +
  "injected seeded PRNG, threaded explicitly. (TECHNICAL-RESEARCH.md §11)";

const NO_TRANSCENDENTALS =
  "No transcendental Math functions in the simulation core: V8 changes these " +
  "across versions, so results stop reproducing. Precompute offline in " +
  "Python; + - * / and sqrt are IEEE-exact and safe. (TECHNICAL-RESEARCH.md §11)";

const TRANSCENDENTAL =
  "^(sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh" +
  "|exp|expm1|pow|log|log2|log10|log1p|cbrt|hypot)$";

const determinismRules = [
  // -- no async / await / Promises ------------------------------------------
  { selector: "AwaitExpression", message: NO_ASYNC },
  { selector: "FunctionDeclaration[async=true]", message: NO_ASYNC },
  { selector: "FunctionExpression[async=true]", message: NO_ASYNC },
  { selector: "ArrowFunctionExpression[async=true]", message: NO_ASYNC },
  { selector: "ForOfStatement[await=true]", message: NO_ASYNC },
  { selector: "Identifier[name='Promise']", message: NO_ASYNC },

  // -- no wall clock ---------------------------------------------------------
  { selector: "NewExpression[callee.name='Date']", message: NO_WALL_CLOCK },
  { selector: "MemberExpression[object.name='Date'][property.name='now']", message: NO_WALL_CLOCK },
  { selector: "MemberExpression[object.name='performance']", message: NO_WALL_CLOCK },
  { selector: "MemberExpression[object.property.name='hrtime']", message: NO_WALL_CLOCK },
  { selector: "MemberExpression[object.name='process'][property.name='hrtime']", message: NO_WALL_CLOCK },

  // -- no unseeded randomness ------------------------------------------------
  { selector: "MemberExpression[object.name='Math'][property.name='random']", message: NO_MATH_RANDOM },

  // -- no transcendentals ----------------------------------------------------
  {
    selector: `MemberExpression[object.name='Math'][property.name=/${TRANSCENDENTAL}/]`,
    message: NO_TRANSCENDENTALS,
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "benchmarks/**",
      // Fixtures deliberately violate the rules. The determinism test lints
      // them explicitly with --no-ignore and asserts that it fails.
      "**/fixtures/**",
    ],
  },

  tseslint.configs.recommended,

  {
    // The determinism rules apply only where determinism is load-bearing.
    // Servers, scoring and tooling may use async, the wall clock and anything
    // else they need.
    files: ["src/core/**/*.ts", "src/router/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...determinismRules],
    },
  },

  {
    files: ["**/*.test.ts", "**/scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
