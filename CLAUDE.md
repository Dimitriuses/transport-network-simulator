# CLAUDE.md

Guidance for Claude Code and for anyone else working in this repository.

## What this is

A simulation game about integration engineering. A generated city, several independent transport operators whose data disagrees in deliberate and specific ways, and a player who must unify them. See [`README.md`](README.md).

**Current state: Phase 0 complete. All gates pass as of 2026-09-04.**

P0M0–P0M6 delivered one hand-built Tier-2 world and were recorded as passing all three gates. P1M0 found that result had been measured with a blind instrument, Phase 0 was reopened, and P0M7–P0M10 rebuilt the instruments, the world and the references. `npm run gates` now reports **all gates pass**: 1a solvable, 1b not trivial, 1c PASS *by decision*, 2 discriminating at 0.934 of spread, 3 at **36 % of headroom** against a ratified 20 % bar.

**Two things that PASS does not say.** Gate 1c is scope rather than evidence — nothing is known about whether a stranger can discover this world's conflicts (`docs/KNOWN-ISSUES.md` #3), and the playtest is still owed. And the competent reference solution is a **regression detector, not a gate instrument**: it was written by people who had seen the world.

Next is **Phase 1 — generation**, in [`ROADMAP.md`](ROADMAP.md).

**The constraint that shapes all of it:** a conflict must stay realistic. Two operators can disagree about where a stop is; at 500 m apart that is a broken map, not a disagreement, and it teaches something other than integration. Every route to a passing gate that runs through "make the conflict bigger" is closed.

Milestones are numbered `P<phase>M<milestone>`. [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) records what each completed milestone delivered and, more usefully, what it corrected. [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md) lists defects we know about — check it before reporting one, and add to it rather than leaving a problem undocumented.

**Gate 1 and Gate 3 were both restructured on 2026-09-03**, and for the same reason: *a gate measured by running a solution we wrote is a gate about that solution.* Gate 1 splits into solvable / not-trivial / discoverable, of which only the first two are gates; the competent reference solution is a **regression detector, not a gate instrument**. Gate 3 measures `P2rt` on journey time against headroom — the ratified metric — because `P2rt` is specified in `REFERENCE-POLICY.md` while the naive player is an implementation that could change and take the gate with it. See `docs/PHASES.md`.

**The lesson worth carrying into Phase 1** is `docs/KNOWN-ISSUES.md` #26, now fixed: a scored journey must be able to *reward* integration. Where the restricted and unrestricted transfer graphs agree there is nothing to win, and every extra leg a player takes is exposure to a cancellation nobody announced. P0M9's generated query set was 88 % such journeys and the competent solution scored below the naive one because of it. `npm run headroom` selects for this; **a generator must do the same, and must not "fix" it by lowering the cancellation rate**, which would delete the point of realtime integration.

**Conflict strengths have enforced ceilings.** Each catalogue setting in `SWEEPS` carries the strongest value two real operators could differ by and the cause that produces it — a coordinate offset past ~150 m is a broken map rather than a disagreement. Tests enforce it. Every failing-gate pressure in this project has pointed at "make the conflict bigger"; that route is closed deliberately.

**And ceilings are per setting, which P1M1 found is not sufficient.** The generator drew three geometry conflicts for one operator, each inside its ceiling, and published stops 2,200 km from their quays — declaring three geometry conflicts and containing one, because nothing subtler survives underneath a lat/lon swap. **Realism and measurability are properties of the combination.** The catalogue now carries an `excludes` relation, and `npm run realism` measures the composed consequence on the world itself, which is the only defence that works against combinations nobody anticipated.

**The catalogue is one source of truth for three consumers** — `src/schema/src/catalogue.ts`, emitted to `contract/catalogue.json` (CI drift-checked) and read by `tools/worldbuild/catalogue.py`. Add a setting there, never in the probe or the builder.

`npm run demo` runs the whole loop; `npm run calibrate` reports the three-gap difficulty calibration; `npm run audit` checks every declared conflict is actually present; `npm run world:build` regenerates the world bundle (content-hashed, and CI checks it). `npm run gates` runs the three proof gates; `npm run probe` sweeps each conflict's strength on each operator; `npm run horizon` separates what a lazy integrator loses to conflicts from what it loses to not knowing yet; `npm run stability` recalibrates across seeds and reports the spread.

**Added at P1M1**, and all of them take a world path so they can be pointed at a *generated* bundle: `npm run realism` measures each operator's composed published geometry against the plausibility ceiling; `npm run docs` prints what a player reads at an operator's `docs_url`; `npm run information` scores the four candidate Information formulas side by side against the declared and honest worlds. Generated worlds are built with `python -m worldbuild <path> --tier N`.

**Every per-world instrument must run against every generated world**, not as a release check. The audit, the realism check, the identifiability audit and the symptom check each caught something on a generated world that nobody had thought to look for — see `KNOWN-ISSUES.md` #28–#33.

**A test that cannot fail is not a test, and the tell is an evidence line whose value never changes.** Both of P1M1's audit defects had that shape: `C-coordinate-offset` compared a stop with an unrelated quay, and `D-staleness` passed on a condition that is true whenever staleness is non-zero, printing `hides 0 disruption(s)` on a world where it hid nothing *and* on one where it hid a third of them. Neither was caught by asserting the audit passes, because both did. When you add a check, construct the case it should reject and require a different answer.

**The audit has three verdicts.** `ok`, `MISS`, and `INRT` — present in the data and incapable of changing any outcome. Absent and inert are different problems needing different fixes, and inert does not fail the audit: it means two of the world's parameters do not fit together, not that a projection misbehaved.

**Two numbers that decide something together must live in one place.** `noticeLeadS` and `D-staleness` sat in different packages, and their relationship decided whether catalogue D existed at all — it did not, for the whole of Phase 0 (`KNOWN-ISSUES.md` #19). The disruption policy is now in `@tns/schema` and ships in `contract/catalogue.json`. Before adding a threshold, ask what else it is implicitly compared against.

**The world is 38 sites, 50 quays, 10 lines and 98 scored journeys, and the instruments take minutes.** `npm run probe` is the slowest — several hundred calibrations.

**The slow instruments report progress on stderr**, with a bar and an estimate of the time left. Progress never goes to stdout, so redirecting a report keeps it clean and still shows the bar on screen:

```
npm run probe > probe.txt        # bar on screen, report in the file
```

Without a terminal — piped, in CI, or a background job — it prints a plain line every fifteen seconds instead of a carriage-return bar, which is what makes a backgrounded run legible. `TNS_PROGRESS=off` silences it.

**Never quote a single calibration as a world's difficulty.** `npm run probe` and `npm run stability` average over seeds and report the spread; `npm run gates` does not yet. Across seeds, with only the disruptions changing, headroom has a standard deviation of 31 % of its mean and conflict cost 36 %. One run is a draw from that distribution, not a measurement of the city.

**When you add a measurement, check both sides of the comparison for matched information — and for a matched opportunity set.** Seven times now this project has credited something with an advantage the world does not owe it: five flattering a player, once flattering the reference, once a skipped leg in a replanned itinerary. `docs/BUILD-LOG.md` lists them. The generalisation that keeps recurring: *a baseline that suddenly beats its reference has been given something, and it is almost always a movement nobody was charged for.*

**And the corollary found at P0M8:** varying data quality also varies how much data there is. A comparison that changes both cannot attribute to either.

Run `npm run check` before proposing changes: lint, typecheck, contract-drift and tests. The Python side is `cd tools && uv run ruff check . && uv run ruff format --check . && uv run pytest`.

**`ruff format --check` is not optional and is easy to forget** — `ruff check` is the linter and passes on code the formatter would rewrite. CI runs both, and a formatting-only failure has broken the build once.

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
