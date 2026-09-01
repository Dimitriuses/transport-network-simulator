# CLAUDE.md

Guidance for Claude Code and for anyone else working in this repository.

## What this is

A simulation game about integration engineering. A generated city, several independent transport operators whose data disagrees in deliberate and specific ways, and a player who must unify them. See [`README.md`](README.md).

**Current state: specification complete; Phase 0 in progress.** M0 (scaffolding), M1 (the walking skeleton), M2 (oracle, baselines, three-gap calibration) and M3 (semantic conflicts, the defect library, the audit gate) are done. The active work is [`ROADMAP.md`](ROADMAP.md) milestone **M4** — the live world.

`npm run demo` runs the whole loop; `npm run calibrate` reports the three-gap difficulty calibration; `npm run audit` checks every declared conflict is actually present; `npm run world:build` regenerates the world bundle (content-hashed, and CI checks it).

Run `npm run check` before proposing changes: lint, typecheck, contract-drift and tests. The Python side is `cd tools && uv run ruff check . && uv run pytest`.

## The specifications are the source of truth

Nine documents in [`docs/`](docs/) describe the system. They are heavily cross-referenced and have been corrected several times as later work invalidated earlier assumptions.

* **Read the relevant spec before writing code that touches its area.** They contain reasoning, not just decisions, and the reasoning is usually why the obvious implementation is wrong.
* **If code and spec disagree, that is a bug in one of them.** Say which, and fix that one. Do not silently make the code match a spec you think is wrong, and do not silently diverge.
* **Each milestone ends by reconciling the specs it touched.** Part of the milestone, not cleanup afterwards.
* Items marked **OPEN** are genuinely undecided. Do not resolve one by implementing a guess — raise it. `ROADMAP.md` lists the milestone by which each must be closed.

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
* **Capture** — the score. `(P1 − player) / (P1 − P0)`. 1.0 matches the oracle, 0.0 is no better than no integration at all, negative means actively harmful, above 1.0 is impossible and signals a leak.
* **L1 / L2 / L3** — canonical world (immutable), simulation state (mutable), operator projections (derived). `DATA-MODEL.md`.
* **Site / Quay** — a station complex, and a specific boarding point within it. Operators publish at different granularities, and that mismatch is a core challenge rather than an inconvenience.
* **Obligation** — something the simulator asks the player: `plan`, `replan`, `tick`.
* **τ** — simulated time.

## Working style here

* Prefer raising a design concern over implementing around it. This project has repeatedly found that the obvious implementation breaks something three documents away.
* When something surprises you in a spec, it is usually deliberate and usually explained a paragraph later.
* Measure before optimising, and put the measurement in [`benchmarks/`](benchmarks/) with a note on what decision it informed.
