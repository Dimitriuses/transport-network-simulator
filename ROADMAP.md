# Roadmap — Phase 0

Milestones for the phase currently being built. **Phase 0 is the MVP**: one hand-built Tier-2 world, end to end.

* What Phase 0 delivers, and the three gates that decide whether it succeeded — [`docs/PHASES.md`](docs/PHASES.md).
* Scope, repository layout, toolchain — [`README.md`](README.md).

**No dates.** Milestones are dependency-ordered and sized relative to each other. Calendar estimates need a capacity figure that is not recorded anywhere.

---

## Milestones

Each milestone states an **exit condition** — something that must be demonstrably true, not a list of files written.

### M0 — Scaffolding

Repository layout, npm workspaces, `tsconfig` with `erasableSyntaxOnly`, the four determinism lint rules, Python tooling, CI.

**Also settled here — where generated API documents live.** `PLAYER-CONTRACT.md` §14 and the repository layout disagreed about this; the resolution splits by lifetime:

| Document | Lives | Committed | Why |
|---|---|---|---|
| `contract/player-api.yaml`, `contract/control-api.yaml` | repository root | **yes**, with a CI no-diff check | one per contract version, identical for every world; players and agents need a stable URL |
| operator API documents | the world bundle, served at `docs_url` | no | vary per world with the projection manifest, and at higher tiers are deliberately imperfect — a property of a *world*, not of the project |

Generated from `src/schema`, so the CI check guarantees the committed copies always match the source.

**Exit:** `npm test` and `ruff check` pass on an empty skeleton; regenerating `contract/*.yaml` produces no diff; **and a deliberate `Math.random()` added to `src/core` fails CI.**

That second clause is the entire point of M0. The four lint rules below are load-bearing — three separate specifications assume they exist — and they are cheap now and painful to retrofit once there is code to fix.

| Rule (scoped to `src/core`, `src/router`) | Required by |
|---|---|
| no `async` / `await` / Promises | `TECHNICAL-RESEARCH.md` §11 |
| no `Date.now`, `performance.now`, `new Date()` | `TIME-MODEL.md` §1 |
| no `Math.random` | `TECHNICAL-RESEARCH.md` §11 |
| no `Math.sin/cos/tan/exp/pow/log/atan2` | `TECHNICAL-RESEARCH.md` §11 — V8 cross-version drift |

### M1 — Walking skeleton

The thinnest possible end-to-end slice, built to prove the seams rather than any component: a hand-drawn ~20-quay city, **one** operator, no defects, static timetable, `virtual` clock, ten scored queries, a trivial player, one number printed at the end.

Deliberately crosses every layer — schema → world bundle → core → projection → operator API → contract → run log → score.

**Exit:** `npm run demo` builds the world, runs the simulation, calls a player and prints a score. Twice, with identical output.

**The risk this retires:** eight specifications were written before any code existed, and they cross-reference each other heavily. Some of them are wrong. This is the largest risk in the project, and M1 exists to hit it in week one rather than at M5.

### M2 — Oracle and baselines

RAPTOR in `src/router`; P0, P1 at `timetable` competence, P2; the three-gap calibration from `REFERENCE-POLICY.md` §10; capture scoring on the Service family.

**Exit:** all three gaps computed and reported for the M1 world. A player that does nothing scores capture 0.0; the oracle scores 1.0.

**Why this early:** `TECHNICAL-RESEARCH.md` §7 argued the oracle was the highest-leverage single component. Since then the reference policy (`REFERENCE-POLICY.md` §6) and the entire scoring normalisation (`SCORING.md` §2) have both been built on it. Nothing downstream means anything without it.

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
| Ghost-rider capacity denial | `REFERENCE-POLICY.md` §9 | **M2** |
| Preparation cost scored or free | `PLAYER-CONTRACT.md` §4 | M2 |
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
