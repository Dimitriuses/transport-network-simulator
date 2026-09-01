# Transport Network Simulator

A simulation game about **engineering**, not about trains.

Each playthrough generates a city, a set of independent transport companies, and — crucially — their information systems. Every company publishes its own data, in its own schema, with its own idea of what a "stop" is, its own timezone handling, and its own way of being wrong. None of them talk to each other.

Your job is to build the layer that unites them: fetch from every operator, reconcile their models, match stops that nobody has ever declared to be the same place, plan journeys across the whole network, notice when the world changes, and tell people in time.

There is no reference solution, and no single right answer. You are scored on what happens to the passengers.

---

## Status

**Phase 0 complete. All three proof gates pass.**

The loop runs end to end: a hand-built 34-quay city, **three operators whose data genuinely disagrees**, live operator APIs, a reference player in its own process, and a capture-scored scorecard — reproducibly, byte for byte.

Central Square is published by all three: as two stands (`NL-S0001`/`NL-S0002`), as `7` "Central Sq" 150 m north of where it is, and as `1` "Tsentralna" — one stop covering two platforms. Their timestamps are ISO-with-offset, epoch seconds, and local time with no offset at all. A coordinate-threshold matcher now forfeits **38 % of the available headroom** and scores *negative*: worse than not integrating at all.

```
npm ci
npm run world:build            # Python: city -> SQLite world bundle
npm run demo                   # build -> simulate -> call a player -> score
npm run calibrate              # the three-gap difficulty calibration
npm run audit                  # every declared conflict must actually be present
npm run check                  # lint, typecheck, contract drift, tests
```

The world is now **live**: services run late and get cancelled, each operator's feed lags and lies in its own way, and a player that never looks at a realtime feed scores exactly 0 on Information while one that polls sensibly scores 0.658.

Runs now produce a full scorecard — three families, a named profile, tier clearance, and a report of **where the capture went**. A player that plans with information no feed published is caught by the information-set audit even though its score looks perfect.

Four solutions of different quality separate cleanly, a lazy integrator forfeits **61 %** of its shortfall to the declared conflicts, and a player planning with information no feed published is caught by the information-set audit even though its score looks perfect.

```
npm run gates                  # the three Phase 0 proof gates
npm run conformance -- URL     # check a player speaks the contract
```

**Want to build a solution?** [`docs/PLAYING.md`](docs/PLAYING.md).

Next is Phase 1 — generation — scoped in [`docs/PHASES.md`](docs/PHASES.md).

---

## The idea in one page

Most "integration" exercises hand you static mock responses. Here the operator APIs are **live interfaces to a running simulation** — a world of vehicles, delays, breakdowns and travellers that keeps moving whether or not your solution is any good.

The difficulty is deliberately **semantic, not cosmetic**. Renaming a field is busywork; a player writes one adapter and it is solved forever. The interesting problems are the ones where two systems *disagree about what is true*:

* the same physical stop, published by two operators under different names, 40 m apart, one modelling the station and the other its five platforms;
* a feed that is silently 90 seconds stale, next to one that is fast but frequently wrong;
* trips that vanish from a feed instead of being marked cancelled;
* delays in seconds here and minutes there, one signed, one not.

Your score is **how much of the available headroom you captured**: 1.0 means you matched a planner with perfect information, 0.0 means you did no better than a city with no integration layer at all, and negative means you made things worse.

---

## Documentation

Read in this order. Each is a draft; each marks its own open questions with **OPEN**.

| | |
|---|---|
| [`docs/CORECONCEPT.md`](docs/CORECONCEPT.md) | **Start here.** What the project is, the catalogue of semantic conflicts, the difficulty ladder, and the 44 questions everything else answers |
| [`docs/TECHNICAL-RESEARCH.md`](docs/TECHNICAL-RESEARCH.md) | Prior art, technology choices, and the measurements behind them |
| [`docs/PLAYER-CONTRACT.md`](docs/PLAYER-CONTRACT.md) | The player↔simulator interface. **The actual product** |
| [`docs/TIME-MODEL.md`](docs/TIME-MODEL.md) | Two clocks, three modes, and why a paused clock is safe |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Three layers: canonical world, live state, operator projections |
| [`docs/REFERENCE-POLICY.md`](docs/REFERENCE-POLICY.md) | How travellers decide *without* a player — the baseline you compete against |
| [`docs/SCORING.md`](docs/SCORING.md) | Headroom capture, the three metric families, explaining a score |
| [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) | Per-traveller causal tracing, and forensics on impossible scores |
| [`docs/PLAYING.md`](docs/PLAYING.md) | **Building a solution.** Start here if you want to play |
| [`docs/PHASES.md`](docs/PHASES.md) | The long arc: Phase 0 (MVP) through Phase 5, and Phase 0's result |
| [`ROADMAP.md`](ROADMAP.md) | Work still to do — the current phase, broken into milestones |
| [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) | What has been built, and what each milestone taught us |
| [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md) | Defects and gaps we know about and have not fixed |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | Shared vocabulary. Useful early, and useful when a term looks familiar but is being used precisely |
| [`docs/LICENSING-NOTES.md`](docs/LICENSING-NOTES.md) | Why MIT, and why OpenStreetMap data stays out of the repository |

Two words are easy to confuse, and they mean different things:

* **Tier** — how hard a *world* is for the player. Tiers 0–5, defined in `CORECONCEPT.md` §7. Appears in the run brief.
* **Phase** — how far the *project* has been built. Phases 0–5, defined in `docs/PHASES.md`.

Phase 0 delivered a Tier-2 world. Milestones are numbered **`P<phase>M<milestone>`**, so `P1M2` is the third milestone of Phase 1.

---

## Scope: the specifications are not the MVP

The specs describe the finished system. Phase 0 builds a deliberately small subset. Without stating which is which, the first week tries to build all of it.

**In scope for Phase 0**

| Spec | What of it |
|---|---|
| `PLAYER-CONTRACT.md` | all of it — the contract is the product |
| `TIME-MODEL.md` | `virtual` mode, `latency: none`, both deadlines, ticks, snapshot rule |
| `DATA-MODEL.md` | all three layers, one hand-authored world, manifest-driven projections |
| `REFERENCE-POLICY.md` | P0, P1 at `timetable`, P2 |
| `SCORING.md` | capture, three families, validity / clearance / score |
| `OBSERVABILITY.md` | `trace` level, information-set audit |

**Deferred**

| Deferred | Until |
|---|---|
| World generation of any kind — city, names, schemas | the core loop is proven interesting |
| Closed loop, app-user fraction, ghost-rider feedback | Phase 2 |
| `realtime` / `scaled` modes, `latency: sim` / `wall` | Phase 2–3 |
| Monitoring UI, map replay, visualisation | Phase 2 |
| Tiers 3–5, `single_operator_rt`, `habitual` | Phase 3 |
| Counterfactual ablation | P0M5 (attribution stage 1 before that) |
| Hosted anything, sandboxing, leaderboards | Phase 4 |

The target is **one hand-built Tier-2 world**: three operators, semantically divergent hand-written schemas, static timetables plus simple delays, open loop, a fixed query set, a scorecard.

---

## Repository structure

Maps one-to-one onto the specifications, so the code for any section is findable.

```
/
├── README.md               this file
├── ROADMAP.md              milestones for the current phase
├── CLAUDE.md               conventions and hard rules for contributors
├── LICENSE                 MIT
├── docs/                   specifications
├── benchmarks/             measurements that back decisions
├── contract/               generated OpenAPI — committed, CI-checked, stable URLs
├── src/                    TypeScript — runtime (npm workspaces)
│   ├── schema/             source of truth: Zod → types, JSON Schema, OpenAPI
│   ├── core/               DES engine, L2 state, virtual clock, seeded RNG
│   ├── router/             RAPTOR; serves the P0 oracle and the P1 baseline
│   ├── projections/        L3 operator projections + defect library
│   ├── server/             operator APIs, control API, obligation issuing
│   ├── scoring/            run log → scorecard
│   ├── refplayer/          deliberately mediocre reference player
│   └── conformance/        suite any candidate player runs against itself
├── tools/                  Python — offline
│   ├── worldbuild/         city → L1 → SQLite bundle
│   ├── validate/           the five gates (DATA-MODEL §7)
│   └── analysis/           calibration, scoring analysis
└── worlds/                 committed world bundles + OSM extract
```

The boundary that matters: `src/core` may depend on `src/schema`, never the reverse, and `schema` stays free of runtime concerns so the Python side can consume its output.

---

## Why two languages

**TypeScript at runtime, Python offline**, split along the world-build seam — which is clean, because world building already emits a data artefact.

TypeScript was chosen for the *type system*, not for speed: this project's content is schemas and their mutations, and one schema source feeding types, validators, OpenAPI documents and generated operator documentation is the whole game. A benchmark ([`benchmarks/`](benchmarks/)) confirmed speed is not the constraint either way — a TypeScript discrete-event core runs ~17× a Python one and processes a million-passenger day in about five seconds, but the API layer will dominate long before the event loop does.

Python keeps the offline pipeline: OSM extraction, world building, validation, and scoring analysis, where its numeric and geospatial ecosystem is far stronger.

---

## Toolchain

**TypeScript** — Node 22, npm workspaces, `node:test` and `node:sqlite` (both built in, so the runtime side starts with close to zero required dependencies). `tsconfig` sets **`erasableSyntaxOnly`**, so every script and tool stays runnable by `node file.ts` with no build step.

**Python** — `uv`, `ruff`, `pytest`. Consumes JSON Schema emitted by `src/schema` and validates on write.

**CI** — lint, typecheck, tests, and the golden-trajectory hash from P0M4 onward.

Four lint rules are load-bearing rather than stylistic, and are enforced in `src/core` and `src/router`. They exist because determinism is a hard requirement; see [`CLAUDE.md`](CLAUDE.md).

---

## Licence

**MIT** — see [`LICENSE`](LICENSE).

World bundles under `worlds/` are data rather than software and may carry their own terms. None currently contain third-party data: Phase 0's city is hand-authored, and OpenStreetMap extracts are deliberately kept out of the repository so that nothing here is encumbered by ODbL share-alike. The reasoning is in [`docs/LICENSING-NOTES.md`](docs/LICENSING-NOTES.md).

## Contributing

Nothing to build against yet. When there is, [`CLAUDE.md`](CLAUDE.md) carries the conventions and the rules that must not be broken.

The specifications are the source of truth. If code and spec disagree, that is a bug in one of them — say which.
