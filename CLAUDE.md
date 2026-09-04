# CLAUDE.md

Guidance for Claude Code and for anyone else working in this repository.

## What this is

A simulation game about integration engineering. A generated city, several independent transport operators whose data disagrees in deliberate and specific ways, and a player who must unify them. See [`README.md`](README.md).

**Current state: specification complete; Phase 0 reopened on a failed Gate 3.**

P0M0–P0M6 delivered one hand-built Tier-2 world end to end and were recorded as passing all three proof gates. P1M0 then found Gate 3 had been measured with an instrument wrong at both ends — a baseline handed the true disruption set so it never read a feed, and a reference granted foresight of unannounced disruptions. Corrected, **Gate 3 fails**: the declared conflicts cost 3 % of headroom against a ratified 20 % threshold.

`docs/PHASES.md` says not to begin Phase 1 on a failed Gate 3, so Phase 0 now runs **P0M7 (`replan`, done)**, **P0M8 (an instrument that can see a realistic conflict, done)**, **P0M9 (a world big enough to measure one, done)** and **P0M10 (conflict potency)**. Phase 1's generation milestones are blocked behind their joint exit. See [`ROADMAP.md`](ROADMAP.md).

**The constraint that shapes all of it:** a conflict must stay realistic. Two operators can disagree about where a stop is; at 500 m apart that is a broken map, not a disagreement, and it teaches something other than integration. Every route to a passing gate that runs through "make the conflict bigger" is closed.

Milestones are numbered `P<phase>M<milestone>`. [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) records what each completed milestone delivered and, more usefully, what it corrected. [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md) lists defects we know about — check it before reporting one, and add to it rather than leaving a problem undocumented.

**Gate 1 and Gate 3 were both restructured on 2026-09-03**, and for the same reason: *a gate measured by running a solution we wrote is a gate about that solution.* Gate 1 splits into solvable / not-trivial / discoverable, of which only the first two are gates; the competent reference solution is a **regression detector, not a gate instrument**. Gate 3 measures `P2rt` on journey time against headroom — the ratified metric — because `P2rt` is specified in `REFERENCE-POLICY.md` while the naive player is an implementation that could change and take the gate with it. See `docs/PHASES.md`.

The single most important open item is **Gate 3**, and every attempt to measure it has found the instrument wrong before finding anything about the conflicts. Journey-time attribution is now sound — conflict cost is positive, monotonic, and 19 % of headroom against a ratified 20 % threshold. The run-based half of the gate reports **INCONCLUSIVE**: at 22 travellers, arrival being binary, one journey changing outcome is worth ~0.1 of headline and the effect is ~0.1, so its answer is decided by a single traveller (`docs/KNOWN-ISSUES.md` #4, #14). P0M9 fixes that by growing the world; nothing about Gate 3 can be decided before it.

**Conflict strengths have enforced ceilings.** Each catalogue setting in `SWEEPS` carries the strongest value two real operators could differ by and the cause that produces it — a coordinate offset past ~150 m is a broken map rather than a disagreement. Tests enforce it. Every failing-gate pressure in this project has pointed at "make the conflict bigger"; that route is closed deliberately.

`npm run demo` runs the whole loop; `npm run calibrate` reports the three-gap difficulty calibration; `npm run audit` checks every declared conflict is actually present; `npm run world:build` regenerates the world bundle (content-hashed, and CI checks it). `npm run gates` runs the three proof gates; `npm run probe` sweeps each conflict's strength on each operator; `npm run horizon` separates what a lazy integrator loses to conflicts from what it loses to not knowing yet; `npm run stability` recalibrates across seeds and reports the spread.

**The world is 38 sites, 50 quays, 10 lines and 132 scored queries as of P0M9, and every instrument is about six times slower for it.** Run the probe in the background.

**Never quote a single calibration as a world's difficulty.** `npm run probe` and `npm run stability` average over seeds and report the spread; `npm run gates` does not yet. Across seeds, with only the disruptions changing, headroom has a standard deviation of 31 % of its mean and conflict cost 36 %. One run is a draw from that distribution, not a measurement of the city.

**When you add a measurement, check both sides of the comparison for matched information — and for a matched opportunity set.** Seven times now this project has credited something with an advantage the world does not owe it: five flattering a player, once flattering the reference, once a skipped leg in a replanned itinerary. `docs/BUILD-LOG.md` lists them. The generalisation that keeps recurring: *a baseline that suddenly beats its reference has been given something, and it is almost always a movement nobody was charged for.*

**And the corollary found at P0M8:** varying data quality also varies how much data there is. A comparison that changes both cannot attribute to either.

Run `npm run check` before proposing changes: lint, typecheck, contract-drift and tests. The Python side is `cd tools && uv run ruff check . && uv run pytest`.

## The specifications are the source of truth

Nine documents in [`docs/`](docs/) describe the system. They are heavily cross-referenced and have been corrected several times as later work invalidated earlier assumptions.

* **Read the relevant spec before writing code that touches its area.** They contain reasoning, not just decisions, and the reasoning is usually why the obvious implementation is wrong.
* **If code and spec disagree, that is a bug in one of them.** Say which, and fix that one. Do not silently make the code match a spec you think is wrong, and do not silently diverge.
* **Each milestone ends by reconciling the specs it touched.** Part of the milestone, not cleanup afterwards.
* Items marked **OPEN** are genuinely undecided. Do not resolve one by implementing a guess — raise it. Things that are *wrong* rather than undecided belong in `docs/KNOWN-ISSUES.md`.

## Hard rules — determinism

The entire project rests on runs being reproducible from a seed. Open-loop scoring, the golden-trajectory test, and cross-machine comparability all depend on it. These are not style preferences, and violating one breaks the project in ways that surface much later as unexplainable score differences.

**In `src/core` and `src/router`, never:**

| Forbidden | Why | Instead |
|---|---|---|
| `async` / `await` / Promises | non-deterministic ordering; I/O in the model | keep the core synchronous; I/O lives at the boundary |
| `Date.now()`, `performance.now()`, `new Date()` | wall clock is not part of the model | the injected virtual clock |
| `Math.random()` | not seedable | the injected seeded PRNG |
| `Math.sin/cos/tan/exp/pow/log/atan2` | V8 changes these across versions; results stop reproducing | precompute offline in Python; `+ - * / sqrt` are IEEE-exact and safe |

All four are enforced by lint. If a rule blocks you, the design is probably wrong — raise it rather than adding an exception.

**Related invariants that lint cannot catch:**

* One seed, threaded explicitly. Never a module-level default RNG.
* Simulated time is a **monotonic integer** count from the world epoch. Local time, offsets, DST and `25:10:00` are *rendering*, and rendering happens exactly once, at the operator API boundary.
* Operator responses are pure functions of `(operator, endpoint, params, τ)` — never of wall time, never of call count. This is the snapshot rule (`PLAYER-CONTRACT.md` §6.4) and a great deal depends on it, including log size.
* Iteration order must never come from a hash container in a way that affects results. Break ties explicitly.
* Never parallelise the simulation core. Parallelise across seeds instead.

## Language split

**TypeScript at runtime** — simulation core, router, projections, servers, scoring. Chosen for the type system, not for speed: this project's content is schemas and their mutations.

**Python offline** — OSM extraction, world building, validation, scoring analysis. Its numeric and geospatial ecosystem is far stronger.

The seam is world building, which emits a SQLite bundle. `src/schema` is the source of truth for both sides: Zod definitions generate TypeScript types, JSON Schema, OpenAPI documents and validators, and Python consumes the generated JSON Schema.

## Conventions

* **Erasable TypeScript syntax only.** No `enum`, `namespace`, parameter properties or decorators — they break `node file.ts` direct execution. Use `const` declarations plus union types. Enforced by `erasableSyntaxOnly`.
* **Struct-of-arrays over TypedArrays in the hot path** — the event queue and per-entity state, not everywhere. Measured at roughly 3× objects, and it degrades far more gracefully under load ([`benchmarks/`](benchmarks/)).
* Dependency direction: `src/core` may depend on `src/schema`; never the reverse.
* `node:test` and `node:sqlite` are built in — prefer them to adding dependencies.
* British spelling in prose, to match the specifications.

## Vocabulary

Full terminology in [`docs/GLOSSARY.md`](docs/GLOSSARY.md). The essentials:

Two words are easy to confuse:

* **Tier** — how hard a *world* is for the player (0–5, `CORECONCEPT.md` §7). Appears in the run brief.
* **Phase** — how far the *project* has been built (0–5, `docs/PHASES.md`). Phase 0 delivers a Tier-2 world.

Others worth knowing before reading code:

* **P0 / P1 / P2** — the oracle (perfect information), the reference policy (how travellers behave with no integration layer), and a lazy-integration baseline. `REFERENCE-POLICY.md` §2.
* **Capture** — the score. `(P1 − player) / (P1 − P0a)` since 2026-09-04. 1.0 means as well as anyone could have done *knowing what could be known*; 0.0 is no better than no integration at all; negative is actively harmful. **Above 1.0 is legitimate** — `P0a` is a strategy, not a bound — and triggers `captureVsOracle` against clairvoyant `P0`, where above 1.0 *is* impossible and quarantines the run. Scores recorded before that date used `P0` and are not comparable. `SCORING.md` §2.
* **L1 / L2 / L3** — canonical world (immutable), simulation state (mutable), operator projections (derived). `DATA-MODEL.md`.
* **Site / Quay** — a station complex, and a specific boarding point within it. Operators publish at different granularities, and that mismatch is a core challenge rather than an inconvenience.
* **Obligation** — something the simulator asks the player: `plan`, `replan`, `tick`.
* **τ** — simulated time.

## Working style here

* Prefer raising a design concern over implementing around it. This project has repeatedly found that the obvious implementation breaks something three documents away.
* When something surprises you in a spec, it is usually deliberate and usually explained a paragraph later.
* Measure before optimising, and put the measurement in [`benchmarks/`](benchmarks/) with a note on what decision it informed.
