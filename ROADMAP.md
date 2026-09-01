# Roadmap — Phase 0

Milestones for the phase currently being built. **Phase 0 is the MVP**: one hand-built Tier-2 world, end to end.

* What Phase 0 delivers, and the three gates that decide whether it succeeded — [`docs/PHASES.md`](docs/PHASES.md).
* Scope, repository layout, toolchain — [`README.md`](README.md).

**No dates.** Milestones are dependency-ordered and sized relative to each other. Calendar estimates need a capacity figure that is not recorded anywhere.

---

## Milestones

Each milestone states an **exit condition** — something that must be demonstrably true, not a list of files written.

### M0 — Scaffolding ✅ complete

*Completed 2026-09-01. All exit conditions verified.*

Repository layout, npm workspaces, `tsconfig` with `erasableSyntaxOnly`, the four determinism lint rules, Python tooling, CI.

**Delivered:** eight `src/*` workspace packages with the `core → schema` dependency direction encoded; ESLint 10 flat config carrying the four determinism rules scoped to `src/core` and `src/router`, each message citing the specification that requires it; `node:test` and `uv`/`ruff`/`pytest`; a three-job CI workflow; and the schema pipeline proven end to end — `/identity` and `/health` defined in Zod, generating the committed OpenAPI documents under `contract/`.

**Also settled here — where generated API documents live.** `PLAYER-CONTRACT.md` §14 and the repository layout disagreed about this; the resolution splits by lifetime:

| Document | Lives | Committed | Why |
|---|---|---|---|
| `contract/player-api.yaml`, `contract/control-api.yaml` | repository root | **yes**, with a CI no-diff check | one per contract version, identical for every world; players and agents need a stable URL |
| operator API documents | the world bundle, served at `docs_url` | no | vary per world with the projection manifest, and at higher tiers are deliberately imperfect — a property of a *world*, not of the project |

Generated from `src/schema`, so the CI check guarantees the committed copies always match the source.

**Exit:** `npm test` and `ruff check` pass on an empty skeleton; regenerating `contract/*.yaml` produces no diff; **and a deliberate `Math.random()` added to `src/core` fails CI.** — all verified.

The last condition is checked two independent ways: a fixture violating all four rules is linted by `src/core/test/determinism.test.ts`, and a dedicated CI job mutates the real `src/core/src/index.ts` and asserts lint rejects it — so the guarantee survives someone deleting the fixture.

That second clause is the entire point of M0. The four lint rules below are load-bearing — three separate specifications assume they exist — and they are cheap now and painful to retrofit once there is code to fix.

| Rule (scoped to `src/core`, `src/router`) | Required by |
|---|---|
| no `async` / `await` / Promises | `TECHNICAL-RESEARCH.md` §11 |
| no `Date.now`, `performance.now`, `new Date()` | `TIME-MODEL.md` §1 |
| no `Math.random` | `TECHNICAL-RESEARCH.md` §11 |
| no `Math.sin/cos/tan/exp/pow/log/atan2` | `TECHNICAL-RESEARCH.md` §11 — V8 cross-version drift |

### M1 — Walking skeleton ✅ complete

*Completed 2026-09-01. All exit conditions verified.*

The thinnest possible end-to-end slice, built to prove the seams rather than any component: a hand-drawn 20-quay city, **one** operator, no defects, static timetable, `virtual` clock, ten scored queries, a trivial player, one number printed at the end.

Deliberately crosses every layer — schema → world bundle → core → projection → operator API → contract → run log → score.

**Exit:** `npm run demo` builds the world, runs the simulation, calls a player and prints a score. Twice, with identical output. — verified, byte-identical.

**Delivered:** a Python world builder emitting a byte-deterministic SQLite bundle; L1 loading via `node:sqlite`; virtual clock, seeded PRNG and a sequence-tie-broken event queue; RAPTOR serving P0 and P1; a faithful operator projection with its own published identifier namespace; operator and control HTTP APIs; the obligation loop with clock-pause-on-ask; a reference player running as a **separate process**; and a capture-based scorecard.

**The risk this retired:** eight specifications were written before any code existed, and they cross-reference each other heavily. Some of them were wrong. M1 found four things:

1. **The monotonic-clock guard fired on the first run.** Obligations are issued one deadline *before* their traveller departs, so the clock started later than the first event. A guard written from `TIME-MODEL.md` §8 caught a bug in the harness within seconds of the code first executing.
2. **The simulator let players teleport.** It validated that an itinerary's trips existed and connected, but never that the traveller could physically *reach* the first boarding quay from their origin. A journey therefore silently began wherever the player chose to board. The reference player found this immediately and beat the oracle — impossible by construction. Both sides now charge for access walking.
3. **`capture > 1` is blind without headroom.** The headline leak detector (`SCORING.md` §2) is a ratio, and M1's world has a zero denominator: one operator and no conflicts means P1 already matches P0. The invariant could not fire on a genuine violation. Fixed with a strictly stronger per-traveller check — *no traveller may arrive sooner than perfect information allows* — which holds regardless of headroom. **This needs folding back into `SCORING.md` §11.**
4. **The golden-trajectory hash must exclude wall-clock diagnostics.** `latencyMs` is recorded for every obligation and differs on every run by design (`TIME-MODEL.md` §5). Hashing it made the reproducibility test fail for the one reason that proves the time model is working.

**Also confirmed, and expected:** M1's capture is undefined, and the scorer says so rather than dividing by zero. A single-operator world with no declared conflicts has no headroom, because there is nothing to integrate. That is a true statement about the world, not a defect — and it is the first concrete illustration of Phase 0 Gate 2 (`docs/PHASES.md`).

### M2 — Oracle and baselines ✅ complete

*Completed 2026-09-01. All exit conditions verified.*

RAPTOR in `src/router`; P0, P1 at `timetable` competence, P2; the three-gap calibration from `REFERENCE-POLICY.md` §10; capture scoring on the Service family.

**Exit:** all three gaps computed and reported. A player that does nothing scores capture 0.0; the oracle scores 1.0. — verified: `npm run calibrate` reports the gaps, a declining player scores exactly `0.000` end to end, and the oracle endpoint is asserted in `src/scoring/test/capture.test.ts`.

**Why this early:** `TECHNICAL-RESEARCH.md` §7 argued the oracle was the highest-leverage single component. Since then the reference policy (`REFERENCE-POLICY.md` §6) and the entire scoring normalisation (`SCORING.md` §2) have both been built on it. Nothing downstream means anything without it.

**Scope note — a second operator arrived here, not at M3.** M2's exit condition is unreachable in a one-operator world: with nothing to integrate, P0 and P1 coincide, capture has no denominator, and "scores 0.0" cannot be demonstrated. The world therefore gained **Ostline**, a tram operator whose quays sit ~80 m from Nordline's but in *separate Sites* — physically trivial transfers that no publication declares. P0 may use them; P1 may not. That difference is the headroom, and it is topology, not semantics: Ostline's data is entirely faithful. Semantic conflict is still M3's job.

**Calibration on the M2 world:**

| Gap | Value | Reading |
|---|---:|---|
| P0−P1 | **1.70 min** | headroom exists; a solution can distinguish itself |
| P0−P2 | **0.00 min** | a coordinate-threshold matcher reconciles this world *perfectly* |
| P1−P2 | **1.70 min** | integrating lazily captures all of the available benefit |

**That middle row is the finding, and it is a preview of Gate 3.** All of the current difficulty is topology; none of it is semantic conflict, because none is declared. A lazy integrator scores as well as the oracle. `src/scoring/test/calibration.test.ts` asserts `P0−P2 < 60s` and says so in its own message: **when M3 lands, that assertion should fail and be replaced by its opposite.** The failure is the milestone's evidence.

**Two things M2 found:**

1. **P2 must be evaluated against the world, not against its own model.** The first implementation planned P2 on its merged view and scored it there — so a lazy matcher that fused two quays 80 m apart got a free, instantaneous transfer and *beat the oracle by 1.8 minutes*. A lazy integrator's advantage is imaginary; reality charges for the difference, and measuring that difference is the entire point of P2. It now plans on its merged model and is then charged for what actually happens — including two queries where the walk it never accounted for loses it the connection entirely.
2. **The same class of bug as M1's teleport, in a new place.** Both were "a model believed something the world does not owe it". The per-traveller `journey ≥ oracle` invariant added at M1 caught this one immediately, in a world where `capture > 1` still could not fire.

**Open items closed:** ghost-rider capacity denial (`REFERENCE-POLICY.md` §9 — yes, from background load; implemented at M4 when capacity first exists) and preparation cost (`PLAYER-CONTRACT.md` §4 — free and bounded; the interesting version is *recovery*, revisited in Phase 3).

### M3 — Conflicts

The projection manifest and defect library; three operators with genuine semantic divergence from `CORECONCEPT.md` §2.1 A–C; the resolution table; the defect audit gate.

**Exit:** the same physical stop appears under three different identities, and P2 — coordinate-threshold matching — measurably underperforms correct manual matching. The defect audit confirms every declared conflict is actually present in the projections.

This is the first milestone where the project is recognisably itself.

### M4 — Live world

DES event generation (delays, cancellations, breakdowns); L2 dynamics; realtime projections with per-operator staleness `sₖ`; ticks; notifications; catalogue §2.1 D defects; the Information metric family.

**Exit:** the golden-trajectory hash test passes in CI. A player that never polls scores near 0 on Information; one that polls sensibly scores meaningfully higher.

### M5 — Judgement

Full scoring vector and profiles; validity and tier clearance; run log at `trace` level; attribution stage 1; the information-set audit; the scorecard from `SCORING.md` §13.

**Exit:** a complete scorecard renders for a real run, and the information-set audit correctly flags a deliberately planted leak.

### M6 — Phase 0 complete

The reference player (valid but bad); the conformance suite; player-facing documentation; one polished Tier-2 world committed to `worlds/`.

**Exit:** someone who has never seen the repository can clone it, read the brief, and build a solution that scores.

Then the three proof gates in [`docs/PHASES.md`](docs/PHASES.md) decide whether Phase 1 begins.

---

## When open questions become due

No open item blocks M0 or M1 — work can start now. Each has a milestone by which it must be closed.

| Open item | Source | Due |
|---|---|---|
| ~~Ghost-rider capacity denial~~ | `REFERENCE-POLICY.md` §9 | ✅ closed M2 |
| ~~Preparation cost scored or free~~ | `PLAYER-CONTRACT.md` §4 | ✅ closed M2 |
| `docs_url` always present | `PLAYER-CONTRACT.md` §6.1 | **M3** |
| `latency: sim` promotion — a pagination defect depends on it | `DATA-MODEL.md` §4 | **M4** |
| Modelled response delay δ | `TIME-MODEL.md` §4 | M4 |
| Wait-time weighting | `SCORING.md` §4 | **M5** |
| Information combination form | `SCORING.md` §5 | **M5** |
| `capture > 1`: invalidate or quarantine | `SCORING.md` §11 | M5 |
| Ablation standard or opt-in | `SCORING.md` §10 | M5 |
| Trace redaction line | `OBSERVABILITY.md` §8 | M6 |
| `verbatim` log size cap | `OBSERVABILITY.md` §7 | M6 |
| Free-running ingestion in `realtime` | `TIME-MODEL.md` §6 | Phase 2 |
| Sub-second resolution | `TIME-MODEL.md` §8 | Phase 2 |
| Trajectory in-bundle vs regenerated | `DATA-MODEL.md` §6 | Phase 2 |

---

## Risks

**Integration between eight specifications written before any code.** The largest risk, and the reason M1 is a walking skeleton rather than a well-built first component. Expect the specs to be wrong somewhere; find out in M1.

**Hand-authoring a world is content design, not coding.** Three operators with genuinely divergent semantics, plus documentation for each, is real authorial work and should be budgeted as such. It is not wasted effort — whatever we find ourselves doing by hand becomes Phase 1's generator specification.

**Gate 3 might fail.** The honest risk: if lost capture turns out to be dominated by topology rather than by declared conflicts, the central thesis is wrong for this design. That is a finding, and the roadmap should stop rather than proceed to generators.

**Specification drift.** Nine documents cross-reference each other heavily and have already needed correcting several times as later work invalidated earlier assumptions. **Each milestone ends by reconciling the specifications it touched** — this is part of the milestone, not cleanup afterwards.
