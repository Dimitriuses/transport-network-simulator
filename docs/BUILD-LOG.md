# Build log

What was built, milestone by milestone, and what each one taught us.

This is a record, not a plan — [`ROADMAP.md`](../ROADMAP.md) is where the work
still to do lives. It is kept because the findings are the valuable part: nearly
every milestone here corrected something a specification had got wrong, and
several of those corrections only make sense alongside the mistake.

**Milestones are numbered `P<phase>M<milestone>`.** Plain `M0`–`M6` in older
prose means Phase 0.

---

## Phase 0 — MVP

Delivered one hand-built Tier-2 world end to end, and **all three proof gates
passed** (`docs/PHASES.md`). Seven milestones, and a recurring theme worth
naming up front:

> **Four separate times, something was credited with an advantage the world
> does not owe it.** A free access walk (P0M1), an imagined zero-cost transfer
> (P0M2), a service that never ran (P0M4), and a bound that was not a bound
> (P0M6). Each was caught by an invariant rather than by a test of the thing
> itself, and each would otherwise have surfaced much later as scores that
> stopped making sense.

### P0M0 — Scaffolding ✅ complete

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

That second clause is the entire point of P0M0. The four lint rules below are load-bearing — three separate specifications assume they exist — and they are cheap now and painful to retrofit once there is code to fix.

| Rule (scoped to `src/core`, `src/router`) | Required by |
|---|---|
| no `async` / `await` / Promises | `TECHNICAL-RESEARCH.md` §11 |
| no `Date.now`, `performance.now`, `new Date()` | `TIME-MODEL.md` §1 |
| no `Math.random` | `TECHNICAL-RESEARCH.md` §11 |
| no `Math.sin/cos/tan/exp/pow/log/atan2` | `TECHNICAL-RESEARCH.md` §11 — V8 cross-version drift |

### P0M1 — Walking skeleton ✅ complete

*Completed 2026-09-01. All exit conditions verified.*

The thinnest possible end-to-end slice, built to prove the seams rather than any component: a hand-drawn 20-quay city, **one** operator, no defects, static timetable, `virtual` clock, ten scored queries, a trivial player, one number printed at the end.

Deliberately crosses every layer — schema → world bundle → core → projection → operator API → contract → run log → score.

**Exit:** `npm run demo` builds the world, runs the simulation, calls a player and prints a score. Twice, with identical output. — verified, byte-identical.

**Delivered:** a Python world builder emitting a reproducible SQLite bundle (believed byte-deterministic here; P0M2 found that is only true per-machine — see below); L1 loading via `node:sqlite`; virtual clock, seeded PRNG and a sequence-tie-broken event queue; RAPTOR serving P0 and P1; a faithful operator projection with its own published identifier namespace; operator and control HTTP APIs; the obligation loop with clock-pause-on-ask; a reference player running as a **separate process**; and a capture-based scorecard.

**The risk this retired:** eight specifications were written before any code existed, and they cross-reference each other heavily. Some of them were wrong. P0M1 found four things:

1. **The monotonic-clock guard fired on the first run.** Obligations are issued one deadline *before* their traveller departs, so the clock started later than the first event. A guard written from `TIME-MODEL.md` §8 caught a bug in the harness within seconds of the code first executing.
2. **The simulator let players teleport.** It validated that an itinerary's trips existed and connected, but never that the traveller could physically *reach* the first boarding quay from their origin. A journey therefore silently began wherever the player chose to board. The reference player found this immediately and beat the oracle — impossible by construction. Both sides now charge for access walking.
3. **`capture > 1` is blind without headroom.** The headline leak detector (`SCORING.md` §2) is a ratio, and P0M1's world has a zero denominator: one operator and no conflicts means P1 already matches P0. The invariant could not fire on a genuine violation. Fixed with a strictly stronger per-traveller check — *no traveller may arrive sooner than perfect information allows* — which holds regardless of headroom. Folded back into `SCORING.md` §11, and it went on to catch P0M2's P2 bug.
4. **The golden-trajectory hash must exclude wall-clock diagnostics.** `latencyMs` is recorded for every obligation and differs on every run by design (`TIME-MODEL.md` §5). Hashing it made the reproducibility test fail for the one reason that proves the time model is working.

**Also confirmed, and expected:** P0M1's capture is undefined, and the scorer says so rather than dividing by zero. A single-operator world with no declared conflicts has no headroom, because there is nothing to integrate. That is a true statement about the world, not a defect — and it is the first concrete illustration of Phase 0 Gate 2 (`docs/PHASES.md`).

### P0M2 — Oracle and baselines ✅ complete

*Completed 2026-09-01. All exit conditions verified.*

RAPTOR in `src/router`; P0, P1 at `timetable` competence, P2; the three-gap calibration from `REFERENCE-POLICY.md` §10; capture scoring on the Service family.

**Exit:** all three gaps computed and reported. A player that does nothing scores capture 0.0; the oracle scores 1.0. — verified: `npm run calibrate` reports the gaps, a declining player scores exactly `0.000` end to end, and the oracle endpoint is asserted in `src/scoring/test/capture.test.ts`.

**Why this early:** `TECHNICAL-RESEARCH.md` §7 argued the oracle was the highest-leverage single component. Since then the reference policy (`REFERENCE-POLICY.md` §6) and the entire scoring normalisation (`SCORING.md` §2) have both been built on it. Nothing downstream means anything without it.

**Scope note — a second operator arrived here, not at P0M3.** P0M2's exit condition is unreachable in a one-operator world: with nothing to integrate, P0 and P1 coincide, capture has no denominator, and "scores 0.0" cannot be demonstrated. The world therefore gained **Ostline**, a tram operator whose quays sit ~80 m from Nordline's but in *separate Sites* — physically trivial transfers that no publication declares. P0 may use them; P1 may not. That difference is the headroom, and it is topology, not semantics: Ostline's data is entirely faithful. Semantic conflict is still P0M3's job.

**Calibration on the P0M2 world:**

| Gap | Value | Reading |
|---|---:|---|
| P0−P1 | **1.70 min** | headroom exists; a solution can distinguish itself |
| P0−P2 | **0.00 min** | a coordinate-threshold matcher reconciles this world *perfectly* |
| P1−P2 | **1.70 min** | integrating lazily captures all of the available benefit |

**That middle row is the finding, and it is a preview of Gate 3.** All of the current difficulty is topology; none of it is semantic conflict, because none is declared. A lazy integrator scores as well as the oracle. `src/scoring/test/calibration.test.ts` asserts `P0−P2 < 60s` and says so in its own message: **when P0M3 lands, that assertion should fail and be replaced by its opposite.** The failure is the milestone's evidence.

**Three things P0M2 found:**

1. **P2 must be evaluated against the world, not against its own model.** The first implementation planned P2 on its merged view and scored it there — so a lazy matcher that fused two quays 80 m apart got a free, instantaneous transfer and *beat the oracle by 1.8 minutes*. A lazy integrator's advantage is imaginary; reality charges for the difference, and measuring that difference is the entire point of P2. It now plans on its merged model and is then charged for what actually happens — including two queries where the walk it never accounted for loses it the connection entirely.
2. **The same class of bug as P0M1's teleport, in a new place.** Both were "a model believed something the world does not owe it". The per-traveller `journey ≥ oracle` invariant added at P0M1 caught this one immediately, in a world where `capture > 1` still could not fire.
3. **The world bundle was not reproducible across machines, and the CI check was asserting the wrong thing.** Caught by CI on its first run against a Linux runner. Two independent causes:
   * **SQLite stamps its own version number into the database header**, so a different Python build produces a byte-different file from an identical world. Byte-comparing bundles is simply the wrong invariant. Replaced with a **content hash** over the canonical logical rows, verified by `python -m worldbuild --verify`. A `VACUUM` now provably leaves the hash unchanged while rewriting every byte.
   * **Moving transcendentals to Python did not make them deterministic — it relocated the problem.** CPython's `math.sin`/`cos`/`asin` delegate to the platform libm, which differs between operating systems in the last ULP exactly as two V8 versions do. `TECHNICAL-RESEARCH.md` §11 had been treating the offline pipeline as a zone where floating point behaves; it is not. Fixed by storing distances as **integer metres**, putting nine orders of magnitude between libm noise and the stored value, so no libm-produced float reaches the bundle at all.

   Both corrections are folded back into `TECHNICAL-RESEARCH.md` §11 and `DATA-MODEL.md` §6, and the content hash now names the world in the run header.

**Open items closed:** ghost-rider capacity denial (`REFERENCE-POLICY.md` §9 — yes, from background load; implemented at P0M4 when capacity first exists) and preparation cost (`PLAYER-CONTRACT.md` §4 — free and bounded; the interesting version is *recovery*, revisited in Phase 3).

### P0M3 — Conflicts ✅ complete

*Completed 2026-09-01. All exit conditions verified.*

The projection manifest and defect library; three operators with genuine semantic divergence from `CORECONCEPT.md` §2.1 A–C; the resolution table; the defect audit gate.

**Exit:** the same physical stop appears under three different identities, and P2 — coordinate-threshold matching — measurably underperforms correct manual matching. The defect audit confirms every declared conflict is actually present in the projections. — all verified.

**Central Square, as published:**

| Operator | id | name | position |
|---|---|---|---|
| Nordline | `NL-S0001`, `NL-S0002` | "Central Square, stand A" / "stand B" | the quays |
| Ostline | `7` | "Central Sq" | ~150 m north of the quays |
| Sudbahn | `1` | "Tsentralna" | Site centroid; **one stop covering two platforms** |

Three identities, colliding integer ids across two operators, three name forms, three positions, and three time encodings — `iso_offset`, `epoch_s`, `local_naive`.

**Delivered:** a manifest-driven projection (`src/projections/src/project.ts`) replacing the faithful one; a defect library implementing identity granularity, id schemes, naming variants, coordinate precision, coordinate source, systematic coordinate offset and time encoding; the resolution table now **operator-keyed and one-to-many**; and the defect audit as a CI gate.

**Calibration — the row that was flat at P0M2 has moved:**

| Gap | P0M2 | P0M3 | Reading |
|---|---:|---:|---|
| P0−P1 | 1.70 min | 1.16 min | headroom |
| **P0−P2** | **0.00 min** | **0.44 min** | what the conflicts cost a lazy integrator |
| P1−P2 | 1.70 min | 0.72 min | what lazy integration still captures |

**Conflicts now take 38 % of the available headroom from a lazy integrator, and leave it with no workable plan at all on 4 of 22 queries.** The reference player's live capture went from **+0.256 to −0.229**: it is now *actively harmful*, routing travellers into journeys worse than they would have found alone. That is the negative region of the capture scale doing exactly what `SCORING.md` §2 designed it for, and it is the single clearest piece of evidence that the conflicts are not decorative.

Two assertions written at earlier milestones flipped, as promised. `calibration.test.ts` asserted `P0−P2 < 60s` with a note saying P0M3 should break it; it did. `walking-skeleton.test.ts` asserted the naive player captured *something*; it now asserts the opposite.

**Three things P0M3 found:**

1. **The defect audit caught a vacuous declaration on its first run** — the exact failure it exists for. Sudbahn declared Site granularity while having only one quay per Site, so publishing at Site level changed nothing. The world was declaring a conflict it did not have, which would have silently made it easier than its manifest claimed and corrupted any difficulty comparison against it. Fixed by giving Sudbahn two platforms at Central. A second vacuous declaration (a coordinate truncation that changed no digits) was removed the same way.
2. **Truncating coordinate precision is a weak defect; a systematic offset is a strong one.** Truncation is noise, and a generous matching threshold absorbs it. An offset moves every stop the same way, so widening the threshold recovers nothing and only adds wrong pairs. Replacing "3 decimal places" with "a legacy datum, converted approximately, ~130 m out" is what actually moved P0−P2 off zero.
3. **The calibration was excluding P2's worst outcomes.** Queries where P2 produced no workable plan at all were dropped as "not comparable" — so the baseline's total failures did not count against it. They now fall back to P1, exactly as a player's declined obligation does. Same shape as the P0M1 and P0M2 findings: a metric quietly dropping the cases that mattered most.

**A better instrument, added here:** the **conflict share**, `(P0−P2) / (P0−P1)` — the fraction of available headroom the conflicts take from a lazy integrator. An absolute minute gap says nothing without knowing how much headroom existed to lose; the share is scale-free and is the right measure for the question Phase 0 Gate 3 asks.

**Open item closed:** `docs_url` is always present (`PLAYER-CONTRACT.md` §6.1). Withholding it would test endpoint-guessing rather than integration, and would break the agent-benchmark use case. Documentation *quality* still varies — that is catalogue §2.1 F, and it is the interesting version.

This is the first milestone where the project is recognisably itself.

### P0M4 — Live world ✅ complete

*Completed 2026-09-01. All exit conditions verified.*

DES event generation (delays, cancellations, breakdowns); L2 dynamics; realtime projections with per-operator staleness `sₖ`; ticks; notifications; catalogue §2.1 D defects; the Information metric family.

**Exit:** the golden-trajectory hash test passes in CI. A player that never polls scores near 0 on Information; one that polls sensibly scores meaningfully higher. — both verified:

| Player | Information family |
|---|---|
| `blind` — never declares `tick`, so never sees a feed | **0.000** — 3 material events, 3 never warned |
| `naive` — polls every 120 simulated seconds | **0.658** — recall 1.000, precision 1.000, timeliness 0.316 |

**Delivered:** seeded disruption generation with an `announcedAtS` per event, so a fact becomes *knowable* at a moment rather than being true from the start; realtime projections serving `L2@(τ − sₖ)` through each operator's own honesty policy; the `/realtime` endpoint, cached per τ so the snapshot rule is structural; `POST /v1/tick` driving ingestion at a player-declared cadence; `POST /v1/notify` with simulator-stamped arrival; disruption-aware routing (P0 with perfect information, P1 executed reactively against the real day); the four-part Information family; and the golden-trajectory fingerprint.

**Catalogue D, live.** Nordline is honest and current. Ostline is 90 seconds behind and reports delays in whole minutes. Sudbahn is five minutes behind and **cancelled trains simply stop appearing** rather than being marked — the ghost-trip failure, indistinguishable from a feed that has not caught up. Fifteen conflicts now declared and audited, up from eleven.

**Calibration, with the day actually happening:**

| Gap | P0M3 | P0M4 | Reading |
|---|---:|---:|---|
| P0−P1 | 1.16 min | **3.14 min** | headroom nearly trebles — P1 gets stranded and replans |
| P0−P2 | 0.44 min | **0.84 min** | conflicts cost more when there is more to get wrong |
| conflict share | 38 % | 27 % | a smaller *share* of a much larger pie |

**Two things P0M4 found:**

1. **The last decision point was set to the wrong instant.** For a traveller whose *first* leg is disrupted there is no previous leg, and the deadline had defaulted to the moment the plan was issued — demanding a warning before the player had even answered. Every such event scored as untimely. It is now that service's own scheduled departure, up to which the traveller is still standing there able to do something else. Timeliness went from 0.000 to 0.316.
2. **"Evaluate against reality" needed extending from geometry to the day.** P2 was charged for the walks it never accounted for but still allowed to ride cancelled trains, so it beat the oracle again — **the third appearance of the same bug shape.** P0M1: a free access walk. P0M2: an imagined zero-cost transfer. P0M4: a service that never ran. Each time, a model was credited with something the world does not owe it, and each time the per-traveller `journey ≥ oracle` invariant caught it.

**Open items settled:** modelled response delay δ — closed, answers land at the deadline, because a modelled delay is still a delay and would blur the one property `virtual` mode exists to guarantee. `latency: sim` promotion — reviewed and deferred: the pagination defect that depends on it is not implemented either, and the two must arrive together or neither is worth having.

**Scope correction:** the P0M2 decision on ghost-rider capacity assumed vehicle loads would first exist at P0M4. They do not. Loads require simulating a background population *as individuals*, and open loop has no crowd — its population is the reference policy applied to a demand table. Capacity moves to Phase 2 with closed loop, where riders are real. The decision itself stands; only its milestone moves.

### P0M5 — Judgement ✅ complete

*Completed 2026-09-01. All exit conditions verified.*

Full scoring vector and profiles; validity and tier clearance; run log at `trace` level; attribution stage 1; the information-set audit; the scorecard from `SCORING.md` §13.

**Exit:** a complete scorecard renders for a real run, and the information-set audit correctly flags a deliberately planted leak. — both verified, and both checked in CI on every build.

**Delivered:** the three-family vector with four named profiles; three levels of verdict (valid / quarantined / invalid, then tier clearance, then a continuous score); capture computed on **generalised time** with waiting weighted double; attribution stage one naming where the capture went; trace-level causal attribution of ingestion calls to the tick that caused them; the information-set audit; and a **cheating player** that opens the world bundle directly and plans with the oracle's information, so the audit has a real violation to catch.

**The audit works, and the discrimination is the point:**

| Player | capture | information-set audit |
|---|---:|---|
| `naive` — honest | −1.386 | **clean** over 22 obligations |
| `cheat` — plans with the oracle's information | 1.000 | **1 leak**: *"beat its information set by 386 s; 6 disruptions affecting this day were not yet visible in any feed it had read"* |

Note what the headline invariants cannot do here. The cheat lands on **exactly 1.000**, not above it, so `capture > 1` never fires and the per-traveller `journey ≥ oracle` check stays silent. **Only the information-set audit separates earned from unearned.** That is precisely the case `OBSERVABILITY.md` §5 was written for.

> **Corrected at P0M6.** The audit as built here used the reactive executor as its ceiling, and that is a *heuristic*, not an upper bound on achievable performance — so it flagged honest players whose plans happened to survive the day, and the "leak" it found was partly an artefact of its own weakness. P0M6 replaced it with a sound bound and then found that the sound version detected nothing at all, because the world gave a cheat almost nothing to cheat with. Both problems, and the fix, are recorded under P0M6.

**Attribution, stage one, on a real run:**

```
  WHERE THE CAPTURE WENT
      8.25  2 travellers     did not arrive: origin_unreachable:7
      3.00  3 travellers     arrived, but slower than the oracle
      2.00  2 travellers     forgone obligation — fell back to the reference policy
```

The top line is the ID collision biting: stop `7` means different places to different operators, and the naive player picked the wrong one. The report names it without anyone having to open the log.

**One thing P0M5 found:** introducing generalised time created two inconsistent bases — capture on weighted minutes, the reported mean on raw ones, over *different populations*. Caught immediately by the P0M2 test asserting a declining player scores exactly 0.0, which stopped being exactly 0.0. The scorecard now reports raw minutes for a human to read and computes capture on generalised time, over one population, and says which is which.

**All four open items closed, one of them on evidence:**

* **Wait counts double** (§4) — capture on generalised time. On raw totals a solution that trades two minutes riding for eight minutes less waiting looks *worse*, which is exactly backwards.
* **Information combines** as `F1(recall, precision) × (0.5 + 0.5 × timeliness)` (§5) — timeliness scales rather than averages, floored at 0.5 because being told late is still worth something.
* **Ablation is opt-in** (§10) — stage one is free and always on; stage two costs one evaluation per declared conflict, and there are already fifteen.
* **`capture > 1` quarantines rather than invalidates** (§11) — **decided on evidence.** The signal fired three times during Phase 0 and every single time it was *our* bug, not a player's. A rule that hard-invalidated would have discarded three legitimate runs and explained nothing.

### P0M6 — Phase 0 complete ✅ complete

> **The heading was true when written and is not true now.** P1M0 re-measured Gate 3 and it fails; Phase 0 is reopened with P0M7 and P0M8. Left as written, with the correction attached, because the record of what was believed at the time is the useful part.

*Completed 2026-09-01. All exit conditions verified. **All three proof gates pass.***

The reference player (valid but bad); the conformance suite; player-facing documentation; one polished Tier-2 world committed to `worlds/`.

**Delivered:** a **competent** reference solution — the honest instrument for Gates 1 and 2, and the worked example a player can read; a conformance suite (`npm run conformance`) checking any candidate speaks the contract; [`docs/PLAYING.md`](PLAYING.md); conflict ablation and the gates harness (`npm run gates`); and the world promoted to **Tier 2**.

**The solution ladder, which is Gate 2's evidence:**

| mode | capture | information | headline | audit |
|---|---:|---:|---:|---|
| `null` — declines everything | 0.000 | 0.000 | 0.000 | clean |
| `blind` — plans, never looks at a feed | −0.023 | 0.000 | −0.014 | clean |
| `naive` — polls, matches by coordinates | −0.023 | 0.825 | 0.316 | clean |
| `competent` — reconciles properly | **0.292** | **0.928** | **0.546** | clean |
| `cheat` — plans with the oracle's information | 1.000 | 0.920 | — | **3 leaks** |

**Four things P0M6 found, and three of them were wrong before it started.**

**1. A player that answers nothing scored a *perfect* Information family.** Declining every obligation meant no traveller held an itinerary a disruption could hit, so there were no material events, so recall and precision were both vacuously 1.0 — 0.400 on the headline for doing nothing at all, beating a player that tried. Forgone travellers now generate material events from the reference policy's journey: they still hit the trouble, and the player still owed them a warning. Declining now scores 0.000 on both families, as `REFERENCE-POLICY.md` §8 always intended.

**2. The information-set audit's bound was not a bound.** It used the reactive executor as its ceiling — a heuristic, so a player whose plan happened to survive the day beat it and was flagged. An audit that flags honest players is worse than no audit. Replaced with a sound ceiling: the optimal *predicted* time under what had actually been served. Reality only ever adds delay, so no player restricted to that information can realise better.

**3. The sound bound then caught nothing — and the reason was a modelling error.** Travellers were asking for plans **twenty seconds before departure**, which is nobody's behaviour. Every disruption relevant to a journey had therefore already been announced by the time it was planned, so there was nothing a player could fail to know and nothing for a cheat to gain. Travellers now plan **thirty minutes ahead**, and it fixed three things at once: the audit became demonstrable, the Information family gained a window in which a warning can still change somebody's mind, and the competent solution's capture nearly doubled — 0.174 to 0.292 — because it can finally *use* what it learns.

   The audit's tell is now about choices rather than times: *"never once boarded a service it could not have known was cancelled, where an optimal planner with the same information would have done so four times — that is not luck."* Comparing times against a sound bound turns out to be far too permissive; comparing decisions is sharp.

**4. The coordinate offset is not fully recoverable, and that is the correct answer.** The competent solution estimates it by iterated mutual-nearest-neighbour displacement — and lands on 223 m for a 130 m offset, because the displacement and the genuine ~80 m separation between neighbouring quays are the same order of magnitude and proximity cannot decompose them. No cleverer estimator fixes this. The engineering response is to stop trusting the geometry and put a floor under transfer times, which is what it does.

**Open items closed:** trace disclosure gained a **third** level (§8) — `attributed` names the catalogue *section* that cost you capture without naming the operator or setting, which is the difference between a hint and an answer key; and `verbatim` is capped at 250 MB and **downgrades rather than truncates** (§7), because a truncated log looks complete until you need the missing part.

---

---

## P1M0 — Evidence before generation

**Part B, the conflict-depth probe, is complete. Part A, the external playtest, cannot be run from inside the project** — [`PLAYTEST-KIT.md`](PLAYTEST-KIT.md) is the runnable form of it and is waiting on a session with an engineer who has not seen this repository.

### The instrument was blind, and reported the blindness as an absence

Before the probe could measure anything it had to be trusted, and it could not be.

`calibrate()` built P2rt — the realtime-aware lazy baseline, and the instrument Gate 3 is measured on — from `disruptionsForNaive(world, disruptions)`: the world's **true** disruption set. It never fetched a feed. So every conflict that lives in a feed cost it exactly nothing *by construction*:

| Conflict | What it does | What P2rt saw |
|---|---|---|
| `D-staleness` | feed describes the past | nothing; it never read the feed |
| `D-silent-cancellation` | cancelled trip simply vanishes | nothing; it was told the truth |
| `C-delay-unit` | delay published in minutes, read as seconds | nothing; it never parsed a delay |
| `D-no-delays` | delays not published at all | nothing |

Ablation reported all four at 0.00 and the report was not wrong about its own arithmetic. It was answering a question nobody had asked: *what do these conflicts cost a reader that does not read?*

**This is the fifth time in this project that something was credited with an advantage the world does not owe it** — a free access walk (P0M1), an imagined zero-cost transfer (P0M2), a service that never ran (P0M4), a bound that was not a bound (P0M6), and now a baseline handed the answer. The first four were found because a number looked too good. This one was found because the milestone whose job is to distrust the previous milestone's numbers went looking.

**The fix.** [`src/scoring/src/belief.ts`](../src/scoring/src/belief.ts) — `believedDisruptions()` polls each operator's published feed on a five-minute cadence up to the moment of planning and believes what it is told: a delay figure at face value in seconds whatever unit was meant, an absent trip as running, a stale feed as the present. Each is a mistake a real integrator makes, and each is now something a world can charge for.

`src/scoring/test/belief.test.ts` guards it with the assertion the old code would have failed: *a naive reader must believe something, and what it believes must not be the truth.* Four more assert that each feed defect changes belief.

### Gate 3, re-measured

```
its shortfall, as things are                 2.37m
the same, with every conflict switched off   2.26m
caused by conflicts   0.10m  (4%)
```

**Gate 3 fails.** The recorded 61 % is withdrawn; `PHASES.md` carries the correction with the original number left visible.

The coincidence is worth naming so nobody reads it as a mistake: the *original* P2 measurement also gave 4 %, and was rejected on the sound grounds that a baseline ignoring realtime is guaranteed to lose to a disrupted day. That reasoning was right. The replacement was simply built wrong.

### What the probe found

`npm run probe` — every conflict alone, at each strength, on each operator in turn, against a conflict-free world.

> **Re-measured against `P0a` after the reference was corrected, and every per-conflict figure came back identical.** Only the floor moved, 2.26m to 0.00m. The clairvoyance term was a constant present in both sides of the probe's subtraction, so it always cancelled — the probe was the one instrument in the project already immune to the bug, by construction rather than by foresight.

**The floor is 0.00 min, and that is a check rather than a result.** Against `P0a` a conflict-free world costs a lazy integrator nothing, because with nothing to misreconcile it is optimal. Any non-zero floor would mean something other than a declared conflict was being attributed to the conflicts.

*(Measured against clairvoyant P0 the floor was 2.26 min — a world with no conflicts at all still cost that much, because the reference knew about trouble before it was announced. Roughly twenty times the conflict term, and the reason Gate 3 read 4 %. The probe subtracted it away without knowing it was there.)*

| Conflict | Best | On | At | Verdict |
|---|---|---|---|---|
| `C-latlon-order` | 2.13m | nordline | `lon_lat` | bites hard |
| `B-time-encoding` | 2.13m | nordline | `epoch_ms` | bites hard |
| `C-coordinate-offset` | 1.85m | nordline | 500 m | bites, with a threshold |
| `C-delay-unit` | 0.31m | nordline | `minutes` | bites weakly |
| `D-staleness` | 0.31m | nordline | 900 s | bites weakly, with a threshold |
| `D-no-delays` | 0.31m | nordline | `false` | bites weakly |
| `A-coordinate-precision` | 0.10m | ostline | 3 | below the noise floor |
| `A-granularity`, `A-id-scheme`, `A-naming`, `A-coordinate-source`, `D-silent-cancellation` | 0.00m | — | — | **inert everywhere** |

**Six of twelve can be made to bite. Six cannot, at any setting, on any operator.**

The strongest single setting available anywhere in the catalogue is 2.13 min, against 3.14 min of headroom — so even the best conflict, pushed to its most extreme value on the operator that expresses it best, reaches about two thirds of headroom on its own. The catalogue is not incapable of producing a hard world. The committed world simply is not one.

### Four things the probe forced

**Conflicts have thresholds, and the committed world sits below them.** `C-coordinate-offset` costs nothing at 30, 60 or 130 m and only bites from 260 m. The committed world uses **130 m**. `D-staleness` costs nothing at 60 or 300 s and bites from 900 s; the committed world uses 90 s and 300 s. The catalogue is not as shallow as P0M6 concluded — *the settings are too weak*, which is a much more tractable problem than a wrong catalogue.

**Which operator carries a defect matters more than the defect.** Every conflict scores highest on `nordline`, and **sudbahn scores 0.00 on all twelve at every strength** — it is not on enough critical paths for anything done to it to reach a traveller. A generator that scatters conflicts uniformly across operators will produce worlds whose declared difficulty is mostly decorative. *Conflict placement must be weighted by how much traffic an operator actually carries.*

**Being perceptible and being costly are different properties, and both must be checked.** The belief tests prove all four feed defects *do* change what a naive reader believes. The probe shows three of them barely change what it *chooses*. That is a real finding rather than another blind spot — but only because the two were measured separately. Had `belief.test.ts` not been written, "inert" would have been indistinguishable from "invisible", which is exactly the error being corrected.

**The identity conflicts are the inert ones, and that is the most uncomfortable result here.** `A-granularity`, `A-id-scheme`, `A-naming`, `A-coordinate-source` — the whole of catalogue A except precision — cost nothing anywhere. Identity reconciliation is what `CORECONCEPT.md` presents as the heart of the challenge. The probe says that in this world it is free, because the naive merger matches on geometry and never needs ids to agree. **A conflict only costs something if the solver's method depends on the thing being corrupted**, and difficulty is therefore a property of the pair, not of the world alone. That belongs in the specification, and it makes P2's merge strategy part of the measuring instrument rather than an implementation detail of a baseline.

### Exit

The milestone's exit is *"we can name which conflicts are worth generating and roughly how strong each must be, and we have at least one external data point on discoverability."*

**First clause: met.** Named above, with thresholds.

**Second clause: not met, and not meetable from here.** [`PLAYTEST-KIT.md`](PLAYTEST-KIT.md) makes it a session someone can run rather than an intention.

**And Gate 3 now fails, which `PHASES.md` says must be allowed to stop the project rather than be tuned away.**

**Outcome: Phase 0 was reopened.** Phase 1's generation milestones are blocked behind a new joint exit — P0M7 (`replan`) then P0M8 (conflict potency) — and Gate 3's criterion was ratified at 20 % of headroom. Conflict potency moved out of Phase 1 into Phase 0, since it is gate remediation rather than generation work, and the remaining Phase 1 milestones shifted down one.

### The reference was wrong too — P0a

Correcting the baseline (above) left Gate 3 at 4 %, with 96 % attributed to "everything else". That residual was never diagnosed, only named, so `npm run horizon` was written to decompose it. It is not topology and not routing difficulty:

**1.46 of the 2.26 minutes is trouble that had not been announced when the plan was made.** `REFERENCE-POLICY.md` §2 grants P0 "full L1 + perfect realtime", which includes disruptions *before they are published* — P0 planning at 09:00 routes around a cancellation announced at 09:20. The same table calls P0 "the achievable optimum". Those are two different objects, and the contradiction had been sitting in the spec since the document was written.

For **normalisation** the clairvoyant reading is right: the reference must be fixed, seed-derived and unbeatable, and `SCORING.md` §10's invariant depends on it. For **attribution** it is ruinous, because the foresight term sits in the denominator Gate 3 divides by, and it is twenty times the numerator.

**The fix, chosen by the project owner from three options:** keep P0 clairvoyant for the score; give Gate 3 an announcement-limited optimum. `P0a` (`REFERENCE-POLICY.md` §2.1) plans optimally over the canonical world knowing only what had been announced at its planning instant, then is charged for the day that happens. It and `P2rt` plan at the same moment on the same announcements, so the only thing between them is reconciliation.

Implementing it forced something implicit to be named, and that implicitness is the source of this whole class of bug: **which id space a plan is written in.** `evaluateAgainstTruth` hard-coded the lazy integrator's `operator:trip` space. `PlanSpace` now states it, with `naivePlanSpace` and `canonicalPlanSpace` as the two answers.

### The result

```
excluded — P0's unreachable foresight        2.26m
its shortfall, against a matched optimum     0.10m
the same, with every conflict switched off   0.00m
caused by conflicts        0.10m  (100% of that shortfall)
conflict cost against the 3.14m of headroom:   3%
FAIL
```

**Gate 3 still fails, and the share is no longer why.** That `0.00m` is the load-bearing result and now carries a test: *with no conflicts, a lazy integrator on a matched horizon is exactly optimal.* Which means the conflict-caused share is **100 % by construction** — remove the conflicts and there is nothing else left to lose to. Share stopped being a test the moment the reference was matched, and a gate reading "100 % PASS" would have been the purest available form of tuning a gate until it passes.

So the gate now judges **materiality**: conflict cost against the 3.14 min of headroom a player actually competes for. That reads **3 %**. The 20 % threshold was chosen because the gate needed one, and ratified by the project owner immediately afterwards; it is recorded in `PHASES.md` under Gate 3.

### What this located

`npm run horizon`, over the planning lead:

| lead | P0 foresight | conflict cost | P0a plans that failed |
|---|---|---|---|
| 1800 s | 2.26m | 0.10m | 6/18 |
| 900 s | 2.14m | 0.22m | 5/18 |
| 300 s | 0.36m | 0.46m | 3/18 |
| 0 s | 0.36m | 0.46m | 1/18 |

Conflict cost more than quadruples as the lead shortens, and the failure column falls with it. One cause: **a planner that never replans is mostly blind, and a blind planner cannot be punished for reconciling badly.** At the harness's 30-minute lead, neither the optimum nor the lazy integrator knows enough for reconciliation quality to matter much.

That makes `KNOWN-ISSUES.md` #1 — `replan`, specified since contract v0.3 and never issued — a **prerequisite for Gate 3** rather than a Phase 2 enrichment. It does not close the gate alone: 0.46m is still 15 % of headroom. Conflict strengthening and `replan` are now both necessary, and P0M8 owns the decision.

### The pattern, for the sixth time

A free access walk (P0M1), an imagined zero-cost transfer (P0M2), a service that never ran (P0M4), a bound that was not a bound (P0M6), a baseline handed the answer (P1M0), and now **a reference credited with foresight the world does not owe it**. The first five flattered a *player*; this one flattered the *ruler*, which is why it survived five milestones of hunting for the first kind.

The generalisation worth keeping: *every* comparison here needs both sides checked for matched information, not only the side being scored.

---

## P0M7 — `replan`

**Delivered: the obligation exists and is issued. Not delivered: the measurement it was pulled forward to unblock**, because wiring it into the baselines uncovered two defects in how conflict cost is attributed at all (`KNOWN-ISSUES.md` #14 and #15).

### What was built

`PLAYER-CONTRACT.md` §5.5 has specified `replan` since v0.3 and nothing ever sent one. Now:

* **The harness issues it.** `simulateItinerary` became `simulateFrom`, which resumes rather than only failing. It distinguishes two kinds of wrong that were previously scored identically: a plan naming a trip that does not exist is *malformed* and the traveller never sets out; a plan whose vehicle is cancelled breaks **in front of the traveller**, at a place and a time, and earns a `replan`.
* **Triggers describe perception, never cause.** `vehicle_cancelled` for a service that never arrives, `missed_connection` for a departure already gone, `stranded` for a transfer that cannot be made. A traveller knows their bus did not come; they do not know the operator stopped publishing cancellations. Naming the cause would hand over catalogue §2.1 D.
* **Position is operator-scoped** (§7) — the same published stop reference the player itself used in the itinerary that broke, never a canonical quay.
* **The destination is deliberately not re-sent.** The player was told where the traveller was going at `/v1/plan` and is expected to have kept it. The reference player now does, and a player that had not could not answer at all.
* **The reference player answers**, resolving the operator-scoped position through its own merged model — which is exactly where identity and coordinate conflicts bite.
* **`continue` and `abandon` are answers, not refusals.** `abandon` is charged exactly as failing to route is, so advising it to a traveller who could have arrived costs the same. Anything else — `no_route`, `declined`, an error, a timeout — leaves the traveller resuming under the reference policy **from where they stand**, not from the origin.
* **One replan budget.** `MAX_REPLANS` moved out of the router and is now shared by P1, P2rt, P0a and the player. A player allowed more attempts than P1 would be compared against a traveller held to a stricter rule than itself.

On the committed world the naive player now receives six `replan` obligations, all `vehicle_cancelled`, and answers all six.

### The bug I wrote, for the seventh time

Restarting the walk over a freshly-returned itinerary was written as `i = restart()`, where `restart()` set `i = -1` and returned `0`. The assignment won, the loop's own increment moved to `1`, and **the first leg of every replanned itinerary was skipped** — a free teleport along it. P2rt promptly beat an optimum, which is impossible.

The pattern is now so consistent it is worth stating as a rule rather than an anecdote: *a baseline that suddenly beats its reference has been given something, and the something is almost always a movement nobody was charged for.*

### Two findings that stop Gate 3 being measurable

Fixing the teleport did not restore a sensible number, and chasing why produced the two results that matter more than the milestone.

**1. A conflict-free world is harder, not easier (`KNOWN-ISSUES.md` #14).** The naive matcher fuses stops within 120 m, and this city has 19 pairs of genuinely distinct quays closer than that — the nearest 31 m apart. With every operator publishing exact coordinates the matcher collapses 34 canonical quays into **19** stops; the declared conflicts push them apart and leave **26**. So "the same world with every conflict switched off" is not a floor, and every instrument that attributes by subtracting it — ablation, the probe, Gate 3 — is subtracting a *harder* world. Conflict cost comes out at −1.01 min.

This also retires the 0.00 min clean floor recorded at P1M0. It held only because a failing P2rt was handed P1's whole-journey outcome and P1 happened to match P0a there. Once the baselines could replan the rescue stopped firing, and the real shape showed.

**2. P0a is a strategy, not a bound (`KNOWN-ISSUES.md` #15).** It plans once on what had been announced and replans only when its plan breaks. On `q15` it detours around an announced delay that turns out not to matter and arrives in 43.22 min, while the *lazy* integrator ignores the announcement and arrives in 36.40. A bound cannot lose to something with less information. P0a is already the better of its own plan and P1's outcome — P1 being achievable with no disruption knowledge at all — and that patch closes many cases but not this one.

### What this milestone actually changed

`replan` exists, is specified-conformant, and is exercised. `KNOWN-ISSUES.md` #1 is closed.

The claim it was pulled forward to support — that conflict cost rises once the planner can see — **is not established, and cannot be until #14 and #15 are resolved.** The honest position is that P0M7 removed one confound and revealed two larger ones underneath it. Both belong to P0M8, and they are the same question: *what is a fair reference for attributing conflict cost in a city where the lazy baseline's own matcher is the dominant source of error?*

---

## P0M8 — An instrument that can see a realistic conflict *(in progress)*

**Scoped by a constraint from the project owner:** a conflict must stay realistic. Two operators can disagree about where a stop is; at 500 m apart that is not a disagreement, it is a broken map, and it teaches something other than integration. Every route to a passing gate that runs through *"make the conflict bigger"* is closed by construction.

That constraint turned out to be the diagnosis, not just a rule. Three numbers, none of them a property of the conflicts:

| | |
|---|---|
| the lazy matcher fused stops within | 120 m |
| `C-coordinate-offset` first cost anything at | 260 m |
| a real disagreement about one stop's position tops out around | 150 m |

The realistic band and the biting band did not overlap, and the reason was the first row.

### Threshold derived from the world, not guessed — **done**

A baseline used for attribution must be exactly right when there is nothing to reconcile, or whatever it loses to its own crudeness is charged to the conflicts. `naiveMatchThresholdM()` now returns the largest threshold that never fuses two distinct quays.

| | before (120 m) | after (derived, 30 m) |
|---|---|---|
| conflict-free world merges 34 quays to | 19 stops | **34 — exact** |
| conflict-free floor | 1.13m | **0.23m** (the poll cadence) |
| conflict cost, journey time | **−1.01m** | **+0.59m** |
| as a share of headroom | — | **19 %** |

Conflict cost is now positive, monotonic in planning lead — 0.59 min at 1800 s, 0.95 at 300 s — and produced at the world's *declared, realistic* settings. `KNOWN-ISSUES.md` #14's first half is closed. The gate reads 19 % against a ratified 20 % threshold and **fails by one point**, which is left alone.

A sweep first tested whether a tighter matcher alone would make realistic offsets bite. It does not, and the reason is worth recording: at a 60 m threshold a 30 m offset costs 0.90 min, a 60 m offset costs **−0.44**, and a 130 m offset costs 0.01. Merge outcomes are discrete, so across 22 queries the result is decided by which stops happen to flip. **The only magnitudes that produced a clean monotonic signal were the unrealistic ones.** That is what put P0M9 — a world big enough to measure one — ahead of any conflict tuning.

### Gate 3 over the whole score — **done, and it found the next problem**

Capture is journey time, and journey time is the family realistic conflicts move least. Staleness costs a traveller a third of a minute of travel; its real damage is that nobody warned them, which lands entirely in the Information family and was invisible to the gate. Information is only observable from a **run** — a routing model warns nobody — so Gate 3 now compares scorecards from real runs of the naive reference player against this world and against the same world with every conflict switched off.

The headline already runs from 0 (no better than a city with no integration layer) to 1 (perfect), so a difference in it *is* a share of what a player competes for. No separate headroom division is needed, and none was invented — that is where the old gate hid the oracle's foresight.

### What it found: not density, but a sample too small to ask the question

The run-based gate reported the naive player scoring **0.316** on this world and **0.218** with honest values — conflicts apparently *helping*, again.

The first suspicion was density. Switching conflicts off puts 21 stop pairs inside the player's 200 m transfer radius against the declared world's 11, and a player treating any such pair as an interchange has twice as many chances to be wrong. On that reading the fix was to hold the entity set fixed, which the project owner chose: switch off only value-level conflicts, leave granularity as declared. `valueCleanWorld` does that, and ablation, the probe and the gate now all attribute from it.

**It changed nothing — 0.218 either way.** So the diagnosis was wrong, and comparing failure modes said why:

| | arrived | replans issued | failure modes |
|---|---|---|---|
| declared | 15/22 | 6 | identical but for one traveller |
| honest values | 14/22 | 6 | one extra forgone-and-abandoned |

**One traveller.** The whole 0.098 headline swing is a single journey changing outcome. Arrival is binary and there are 22 of them, so the instrument resolves about 0.1 of headline per traveller while the effect it is chasing is about 0.1. The sign of the answer is decided by one journey.

The run-based gate is therefore neither wrong nor measuring a confound. **It cannot resolve its own question at this world size.** `npm run gates` now computes that resolution, prints it, and returns **INCONCLUSIVE** rather than a verdict:

```
22 scored travellers, and the two runs differ by 1 arrival.
One traveller changing outcome is worth about 0.098 of headline.

INCONCLUSIVE — the effect is smaller than one traveller.
```

That distinction is the point. A number smaller than the instrument's own resolution must not be recorded as a finding, and this project has already done that once — the 61 % Gate 3 pass that stood for four milestones.

Journey-time attribution is untouched by this, because it averages a continuous quantity rather than counting binary arrivals: **+0.59 min, 19 % of headroom, stable.**

The density observation survives as a true property of the naive reference player — it is bad at transfers, and accurate data offers it more transfers to be bad at — but it is not what inverted the gate. `KNOWN-ISSUES.md` #4 is promoted from a caveat to a blocker and reassigned to P0M9.

### Realism as an enforced budget — done

`SWEEPS` now carries, per setting, the strongest value two real operators could differ by and **the cause that produces it**:

| Setting | Ceiling | Because |
|---|---|---|
| `C-coordinate-offset` | 150 m | station centroid published for a specific quay at a large interchange; kerb pole vs platform centre is 5–30 m, geocoding from an address 10–100 m |
| `A-coordinate-precision` | 3 dp | ~110 m, rare but real; 2 dp is ~1.1 km and no feed ships it |
| `D-staleness` | 900 s | a five-minute rebuild behind a cache; half an hour is an outage, not a cadence |

The probe still *tests* beyond the ceiling, because knowing where a conflict would bite is diagnostic — but it now picks its best setting from the plausible ones only, marks the rest `!`, and says they may not be generated there.

Three tests enforce it: every declared setting in the committed world is plausible, every ceiling names its provenance, and at least one swept value lies beyond a ceiling — so the constraint cannot quietly become decorative.

This matters more than any single number. Every failing-gate pressure in this project has pointed the same way — make the conflict bigger — and `C-coordinate-offset` costs 27 minutes at 500 m. The route was always open. It is now closed in code rather than in prose.

### Re-probing the catalogue: it was never as weak as it looked

With the derived threshold and the value-level floor, `npm run probe` reports **8 of 12 conflicts biting, up from 6 — and now at settings that could actually occur.**

| Conflict | Best plausible | On | At |
|---|---|---|---|
| `C-latlon-order` | 7.88m | nordline | `lon_lat` |
| `B-time-encoding` | 4.36m | nordline | `epoch_ms` |
| `C-delay-unit` | 0.67m | nordline | `minutes` |
| `D-staleness` | 0.67m | nordline | 900 s |
| `D-no-delays` | 0.67m | nordline | not published |
| `C-coordinate-offset` | 0.55m | ostline | **60 m** |
| `A-granularity` | 0.43m | nordline | `site` |
| `A-coordinate-source` | 0.43m | nordline | `site` |

The sixth row is the vindication. `C-coordinate-offset` needed **260 m** to cost anything before P0M8 and now bites at **60 m** — kerbside pole against platform centre, the most ordinary disagreement in transit data. `D-staleness` bites at 300 s, which is what the committed world already publishes. Two catalogue A conflicts that had been inert everywhere now register.

**The catalogue was never one conflict deep. The instrument could not see past its own 120 m matcher.** `KNOWN-ISSUES.md` #2 has been describing a measurement artefact since P0M6.

Four remain inert: `A-coordinate-precision` (0.10m, under the noise floor), `D-silent-cancellation` (0.01m), and `A-id-scheme` and `A-naming` at exactly zero. The last two are pure-identifier conflicts and cost nothing because the lazy merger matches on geometry and never needs identifiers to agree — the P0M10 fork, unchanged.

And the scatter has not gone: `C-coordinate-offset` on ostline reads 0.10 / 0.55 / 0.55 / **−0.09** / 3.30 across 30 / 60 / 130 / 260 / 500 m. Non-monotonic in the middle, which is P0M9 again.

### Where this leaves the milestone

All three parts done. Gate 3 does not pass, and now says honestly that it cannot yet be decided rather than reporting a failure it did not measure. **P0M9 is next and is a hard prerequisite:** neither the run-based gate nor the conflict-depth probe can resolve a realistic conflict at 22 travellers and 34 quays.

---

## P0M9 — A world big enough to measure one *(in progress)*

**The problem, stated as a number.** At 22 scored travellers, one journey changing outcome was worth about **0.098 of the headline score**, and Gate 3 has to decide whether conflicts cost **0.2** of it. The gate was reading a 0.1 signal with a 0.1 ruler, and P0M8 made it say so — `INCONCLUSIVE` rather than a verdict it had not earned. `KNOWN-ISSUES.md` #4 had recorded the risk since P0M6 and assigned it to Phase 1; it turned out to block the gate that Phase 1 is waiting on.

### The city grew

| | before | after |
|---|---|---|
| sites | 27 | **38** |
| quays | 34 | **50** |
| lines | 7 | **10** |
| scored queries | 22 | **132** |

Two new arms (a north-west/south-east diameter), one orbital that never touches Central, four extended termini, a second stand at Market Hall, two more undeclared tram interchanges, a third platform at Central, and a third Sudbahn line.

The additions are not filler. The orbital is the only bus link between the western and southern arms, so journeys between them either wait for it or cross the city — a choice rather than a single path. The third Central platform deepens the Site-granularity conflict: Sudbahn publishes all three as one stop, so a player boarding "Central Square" is told nothing about which of them its train leaves from. The second stand at Market Hall means Central is no longer the only place where a transfer costs a walk.

**Nothing was placed closer than the existing minimum.** The closest pair of distinct quays is still `q-central-b`/`t-central` at 30.9 m, so `naiveMatchThresholdM()` returns what it did before and P0M8's instrument calibration is unchanged. That was checked rather than assumed — a new quay 20 m from an old one would have silently narrowed the matcher and moved every conflict's biting point.

### The query set is generated, and inspectable

The 22 hand-picked queries are kept verbatim as `SEED_QUERIES`, because each encodes a structure worth exercising — a direct run, a free transfer at stand A, a walk across Central, a journey that is only fast if you know the tram chord exists — and a generated set would cover them only by luck.

The other 110 are systematic: every ordered pair of Sites at least 1500 m apart and reachable on foot from some quay, taken in a fixed order at a fixed stride, with departures spread across the working day on a stride chosen not to clump on a headway boundary. Coverage is 37 of 38 sites as an origin, 34 as a destination, and 10–16 departures in every hour from 07:00 to 17:00.

Systematic rather than seeded-random on purpose: a seeded sample would be reproducible too, but this set can be derived by hand from the city, and no generator has to be trusted.

**Selection uses only `+ - * / sqrt`.** Not haversine. `math.sin` and `math.cos` differ in their last bits between platform libms, so a pair sitting on the 1500 m cut-off would be included on one machine and excluded on another — changing the query set, and therefore every score, for a reason nobody would ever find. The same trap cost a day at P0M2 and is why `content_hash.py` exists.

### A new instrument: `npm run stability`

The other half of the exit is that the gaps describe the *city* rather than the particular day it drew. The seed changes only which services run late and which never run at all, so `stability` recalibrates across several seeds and reports the mean, standard deviation and spread of each gap, plus conflict cost.

It reports rather than asserts. A tolerance nobody has measured is a guess, and this is the evidence for choosing one.

### What the bigger world measured

**The operative exit clause is met by a factor of two hundred.**

| | 22 travellers | 132 travellers |
|---|---|---|
| one traveller changing outcome is worth | 0.098 of headline | **0.001** |
| the question Gate 3 must decide | 0.2 | 0.2 |

**And journey-time conflict cost more than doubled**, from 0.59 min (19 % of headroom) to **1.41 min (42 %)** — above the ratified 20 % threshold. Bigger is not automatically harder; more origin-destination pairs simply give the declared conflicts more journeys on which they can matter. `B-time-encoding:sudbahn` alone accounts for 0.96 min.

### And it broke two gates, which is the more useful result

The first run on the grown world had `null` — a player that declines every obligation — arriving **120/132**, while `naive` arrived 83 and `competent` fell from +0.292 capture to −0.296. Declining beat trying.

**Cause: the world enforced a walking limit it never published.** `MAX_WALK_M` is 400 m and the simulator refuses any longer access walk, charging the traveller as not arriving. The brief never said so, and the reference player searched 500 m. At 22 travellers that cost three of them and looked like noise; at 132 it cost 49.

A rule the world enforces but never states is not a conflict to be discovered — catalogue §2.1 is about operators disagreeing with *each other*, and this was the simulator disagreeing with everyone in secret. The brief now publishes `limits.max_walk_m` and `limits.walk_speed_mps`, along with the `replan` obligation P0M7 added and never advertised. Naive arrivals went 83 → 112 and capture −0.799 → −0.266. (`KNOWN-ISSUES.md` #16.)

### The competent solution did not survive the move

It stayed at −0.296 after the brief fix, and is now the *worst* of the four solutions on capture. Fourteen of its twenty-two failures are `replan_no_route`: stranded by a cancelled service, it declines to name an onward route and the traveller is abandoned. It refuses to board services it believes cancelled — right — and has nothing to offer instead — not right.

A coordinate-frame bug was found and fixed along the way: `/v1/replan` resolved the traveller's operator-scoped position through the *naive* model regardless of which solution was playing, so a player that had corrected an operator's systematic offset was handed a position displaced by the very offset it had worked out. **Fixing it changed no outcome**, which is worth recording as plainly as if it had — the diagnosis was wrong and the number said so.

The real finding is larger than a bug. The competent solution was written against a 34-quay city where Central was almost the only interchange, and it does not transfer to a 50-quay one. That is the first direct evidence on the question `ROADMAP.md` P1M4 exists to ask — *does a solution built for one world perform comparably on another* — and for the only solution we have, the answer is no.

It also means **Gate 1 currently measures the reference solution rather than the world**: it asks whether a competent solution can be built and reports whether *this* one still works. Recorded as `KNOWN-ISSUES.md` #17 and left for P0M10 rather than patched until the gate goes green, which is what `PHASES.md` forbids.

### Stability across seeds: not met, and now quantified

`npm run stability` recalibrates across six seeds. Only the disruptions change — same city, same timetable, same conflicts.

| measure | mean | sd | spread | sd as % of mean |
|---|---|---|---|---|
| P0−P1 headroom | 2.99m | 0.92m | 2.77m | **31 %** |
| P0−P2 | 2.79m | 0.79m | 2.20m | 28 % |
| P1−P2 | 0.20m | 0.21m | 0.57m | **107 %** |
| conflict cost | 1.10m | 0.39m | 1.02m | **36 %** |

Headroom ranges from 1.51m to 4.28m depending only on which services happen not to run that day, and conflict cost from 0.52m to 1.54m. **132 travellers fixed the resolution of a single measurement and did not make the measurement repeatable.**

The two are different problems and it took separating them to see it. Resolution is about whether one traveller can flip the answer — fixed, 0.001 of headline. Repeatability is about whether the answer describes the city or the day, and the day still dominates. The 42 % conflict-cost figure from the committed seed is a draw from a distribution whose standard deviation is 36 % of its own mean.

So the headline number quoted anywhere from this world means little on its own. **Difficulty has to be reported as a mean over seeds with its spread**, not as a single calibration, and P0M10 cannot compare conflict settings by running one seed each.

Two routes, and the second is almost certainly right:

* **More queries.** Variance falls as 1/√n, so halving the spread needs four times the travellers — 528, at four times the runtime of something already six times slower than it was.
* **Average over seeds.** Report a world's difficulty as the mean over *k* seeds and publish the spread as the tolerance. Statistically honest, cheaper, and it makes the tolerance an output rather than a guess. It also matches what `P1M4` will need: "two worlds are equally hard" is a claim about distributions, and it was never going to be settled by two single runs.

### Re-pinned deliberately

`trajectoryFingerprint` moved from `681b1b84a5823ae4` to `a845cd476a2cc0da`: 1102 journeys now, 286 disruptions drawn from them. The golden test says the new value must be pasted in deliberately and never automatically, and this is that. **Every score recorded before P0M9 is against a different world and is not comparable to one after it.**

### Monotonicity: met, on a probe that now averages over seeds

A single-seed sweep would have produced a curve made of noise — the stability run had just shown conflict cost varying by 36 % of its own mean across seeds, which is larger than most of the differences the sweep is trying to resolve. So `probeCatalogue` now takes `seeds` (default 5), every point is a mean, and the combined spread is reported beside it as `value=cost±sd`.

**Monotonicity is judged against that spread rather than by eye.** A step counts as a rise or a fall only if it exceeds the seed-to-seed noise at either end; otherwise the verdict is *flat within noise*, which is a different and more honest answer than *monotonic*. And only settings with a numeric strength are judged at all: `lon_lat` is not weaker than `epoch_ms`, and ordering categorical values would invent a scale nobody declared.

Five seeds, 132 queries:

| conflict | operator | verdict |
|---|---|---|
| `C-coordinate-offset` | nordline | **MONOTONIC** |
| `C-coordinate-offset` | ostline | **MONOTONIC** |
| `A-coordinate-precision` | nordline | **MONOTONIC** |
| `D-staleness` | all three | flat within noise |
| `C-coordinate-offset` | sudbahn | flat within noise |

`C-coordinate-offset` on nordline runs **−0.01 → 0.10 → 0.55 min across 30 → 60 → 130 m**, entirely inside the plausible band. On the pre-P0M9 world the same sweep gave 0.10 / 0.55 / 0.55 / **−0.09** / 3.30 — a scatter with a negative step in the middle. **The exit clause is met.**

`D-staleness` on nordline reads 0.02 / 0.16 / 0.31 / 0.34, which looks like a curve and is not called one: its steps are inside the spread. That is the check working rather than failing.

### The catalogue on the bigger world

**9 of 12 conflicts bite, at plausible settings** — up from 8 before the world grew and 6 before P0M8 fixed the matcher.

| conflict | best plausible | on |
|---|---|---|
| `C-latlon-order` | 11.71m | nordline |
| `B-time-encoding` | 7.14m | nordline |
| `A-coordinate-precision` | 0.61m | nordline |
| `C-coordinate-offset` | 0.55m (at 130 m) | nordline |
| `C-delay-unit` / `D-no-delays` | 0.34m | nordline |
| `D-staleness` | 0.31m (at 900 s) | nordline |
| `A-granularity` / `A-coordinate-source` | 0.22m | nordline |

Three remain inert: `D-silent-cancellation`, `A-id-scheme`, `A-naming`. The last two are pure-identifier conflicts and cost exactly nothing because the lazy merger matches on geometry and never needs identifiers to agree — the fork P0M10 owns, unchanged since P1M0 first found it.

**A reporting bug found and fixed.** The per-point line never rendered the `!` marker for implausible settings or the `±` spread: an earlier edit had matched nothing and failed silently, so two successive changes to that line were both no-ops. The measurements and the plausible-only selection of each conflict's best setting were always correct — `C-coordinate-offset` is reported at 130 m, not at the 500 m that costs 38 min — but the output was quieter than intended about which columns nobody may generate. Worth recording because it is the same failure mode as a bad measurement: a change that silently does nothing looks exactly like a change that works.

---

## P0M10 — Conflict potency *(in progress)*

### Two statistical errors, found in the gate's own output

Both halves of Gate 3 were made seed-averaging first, because P0M9 had shown a single calibration is a draw rather than a measurement. Then the gate reported something that could not be true, and reading it produced two corrections in a row.

**1. An average was tested against the scatter of single runs.** The gate averaged over seeds and asked whether the effect exceeded the *standard deviation of individual runs*. The uncertainty of a mean is the standard error, `sd/√n`. Testing against the population sd meant **adding seeds tightened the mean while leaving the bar exactly where it was — the gate could never have resolved anything, however many seeds it was given.**

**2. A paired design was thrown away.** With the standard error corrected, going from 5 seeds to 12 moved it from 0.076 to **0.081** — it did not shrink at all. Twelve seeds had simply measured the run-to-run variance more honestly than five had.

The two worlds are run on the *same disruption draws*. The difference can be taken run by run and the day cancels out of it. Differencing two independent means instead carries the whole seed-to-seed variation into the answer, and no number of seeds removes a variance the design need never have had. Gate 3 now uses `sd(clean_i − declared_i)/√n`: same estimate of the effect, a fraction of the uncertainty.

Both are the project's signature failure again — **not a wrong number, but a right number compared against the wrong thing** — and this time the wrong thing was a choice of statistic rather than a choice of baseline. Recorded as `KNOWN-ISSUES.md` #18.

### Fork A: the conflicts moved to the operator that carries the city

`city.py` said of Nordline: *"Everything it does is right, which is what makes it useful as a reference point for the others."* It also runs five of the ten lines and calls at **39 line-stops against Ostline's 10 and Sudbahn's 9**. So every declared conflict sat on operators covering about a fifth of the network, while the probe reported that every conflict bites hardest precisely where none of them was.

Swapped, on the project owner's decision: Nordline takes the legacy profile, Ostline becomes the clean modern reference, Sudbahn is untouched — it is the only Site-granularity operator and that is what makes the three platforms at Central one published stop.

**A pure transplant, deliberately.** The same fifteen conflicts at the same settings, re-derived automatically by `_declared_conflicts()` from the manifests. Nordline's staleness was left at 90 s rather than raised to the far more biting 300 s while the file was open: that would have confounded placement with strengthening, and it is exactly the dial-turning the realism constraint exists to prevent. Geometry, timetable and traffic are untouched, so the difference is attributable to placement and nothing else.

| | conflicts on ostline | conflicts on nordline |
|---|---|---|
| lazy shortfall vs matched optimum | 1.60m | **2.89m** |
| the same, honest values | 0.30m | 0.19m |
| **conflict cost** | **1.30m** | **2.69m** |
| as a share of 3.35m headroom | 39 % | **80 %** |

**Placement alone doubled it.** Nothing was made stronger, more numerous, or less realistic — the same defects were simply put where the traffic is. That is the sharpest available answer to the question P1M0 asked and P0M8 could not settle: the catalogue was never weak, and the last thing masking it was where it had been put.

### A test fired to say the world had changed under it

`matched-reference.test.ts` asserted that P0's unreachable foresight *dominates* a lazy integrator's shortfall — true since P1M0, and the reason a matched reference was needed at all. After the swap it is 2.10m against a 2.89m shortfall, and the assertion failed with the message it had been written to carry: *re-check whether Gate 3 still needs a matched reference*.

It does. What matters is not that foresight is the larger term but that it is a large enough share to distort attribution if left in — about 40 % here. The assertion now says that instead, and will fire again if foresight ever becomes negligible.

### The measurement, at last decisive — and it splits three ways

Twelve seeds, paired. Individual runs scatter by 0.234 of headline; the *same-seed difference* only by 0.101, so the mean difference carries a standard error of **0.029**. The effect is **4.4σ** where the unpaired statistic had it at 1.3σ on identical data.

```
                       headline  capture  information  arrived
this world             -0.044   -0.586   0.768   111/132
honest values           0.085   -0.370   0.767   115/132

conflicts cost   0.129 of the score  (standard error 0.029, 4.4σ)
caused by conflicts, journey time only:  2.53m (76% of 3.35m headroom)
```

**1. On journey time the conflicts are overwhelming: 76 % of headroom.** Attribution is now spread across five conflicts rather than resting on one — `B-time-encoding:sudbahn` 0.72m, `A-coordinate-precision:nordline` 0.56m, `C-coordinate-offset:nordline` 0.54m, `C-delay-unit:nordline` 0.21m, `D-staleness:nordline` 0.04m. The exit's "no single conflict supplies more than half" is satisfied for the first time.

**2. On the whole score they cost 0.129, and the bar is 0.20. Gate 3 fails.** Not inconclusively — 4.4σ. This is a real, well-measured shortfall.

**3. The Information family does not move at all: 0.768 against 0.767.**

That third line is the finding, and it contradicts the reasoning that put Gate 3 on the whole score in the first place. P0M8 argued that staleness's real damage is that nobody gets warned, and that measuring capture alone would miss it. **The measurement says the Information family is insensitive to every declared conflict**, so the whole-score gate is a diluted capture gate rather than a broader one: `0.6 × 0.216 + 0.4 × 0.001 = 0.129`.

The likely mechanism, which deserves its own measurement rather than assertion: 90 s and 300 s of staleness are negligible against warning deadlines set by a leg's scheduled departure, usually tens of minutes away; and `D-silent-cancellation` sits on Sudbahn, which reaches nine line-stops. Neither moves recall, precision or timeliness enough to register.

### The threshold is being applied to a metric it was not ratified against

The 20 % criterion was ratified after P1M0 **against journey-time headroom**, where it now reads 76 %. P0M8 then redefined Gate 3 to the whole headline score and carried the same 20 % across without re-deriving it. Since conflicts move only the Service component, which carries weight 0.6, a 20 % bar on the headline is an effective 33 % bar on capture — a stricter test than the one that was agreed to, arrived at silently.

Both numbers are honest and they disagree:

| measured on | conflict cost | 20 % bar |
|---|---|---|
| journey-time headroom (as ratified) | **76 %** | passes |
| whole headline score (as redefined) | **12.9 %** | fails |

This is not a number to choose between on convenience. Recorded, and put to the project owner.

### Fork B, resolved by reclassification rather than measurement

`A-id-scheme` and `A-naming` are now **cosmetic** (`CORECONCEPT.md` §2.1), on the project owner's judgement: they are bound to exist, and they are not the world's main challenge. Both have measured exactly zero on every operator at every setting since P1M0.

§2.1's own definition of cosmetic variation already read *"different ID formats"*, so the id-scheme entry had been mis-catalogued from the start. `A-id-collision` — two operators using `7` for **different places** — stays semantic: an ambiguous identifier is not something an adapter settles.

The catalogue A section is now split explicitly into semantic and cosmetic, and `SWEEPS` carries a `cosmetic` flag so the probe counts them separately. A cosmetic conflict measuring zero is the expected result; reporting it beside the semantic ones invited the conclusion that the catalogue was thin when what it showed was that the catalogue was mislabelled.

**Recorded caveat.** The measured zero is partly a property of the instrument: the lazy baseline matches on geometry and never reads a name, so a name variant has nothing to be wrong about. The reclassification is a design judgement, not a demonstration that a name-matching solver would be unaffected — and it is written up as one.

### Why Gates 1 and 2 were failing: neither reason was the world

**Gate 2 was not failing at all.** It computed separation as `competent − null`, which measures separation only if the competent solution is the best. It was not, so the gate reported a spread of 0.005 for a set of solutions actually spanning **0.299** — comfortably over its own bar. Now `max − min`, with the ordering checked separately and a mis-ordering reported as a Gate 1 matter. **Gate 2 passes.**

A gate that fails for the wrong reason is worse than one that fails: it sends you looking at the world when the fault is in the solution, and two milestones of "the world broke the players" reasoning rested partly on this.

**Gate 1 was failing on two overfit assumptions in the competent solution, both mine to the extent that P0M7 and P0M9 exposed them.**

*A seven-day error.* The replan handler passed the traveller's position with a timestamp from `toSeconds`, which counts from the start of the month, where `planCompetently` indexes departures from the world epoch. The solution was asked to route from a point **seven days in the future** and answered `no_route` to **26 of 26** replans. For two milestones that looked like a solution too conservative to reroute anybody. One shared `simSeconds` later: 63 of 63 succeed.

*A reference frame chosen by size.* `buildCompetentModel` took the operator with the most stops as its coordinate frame. P0M10's swap put the 130 m offset on exactly that operator, so the solution corrected everyone *towards* a displaced frame — and placed Ostline, which publishes flawless coordinates, 62 m from where it is. The frame is now chosen by **consensus**: each candidate scored by how much correcting it implies for all the others, least wins. A displaced feed disagrees with everyone; a good one disagrees only with the displaced.

Both fixes are legitimate engineering rather than gate-tuning — a solution answering `no_route` to every replan because of a calendar error is broken, and one that trusts the biggest feed to be the true frame has assumed something it cannot know. Neither made Gate 1 pass.

### Where P0M10 stands

| gate | verdict |
|---|---|
| 1 — buildable | **FAIL**, and `KNOWN-ISSUES.md` #3 says it cannot honestly be closed by us at all |
| 2 — discriminating | **PASS** — spread 0.299, four distinct scores |
| 3 — conflicts doing the work | 76 % of headroom on journey time; 12.9 % of the whole score at 4.4σ. Threshold provenance unresolved (#20) |

**Every gate failure this milestone traced to an instrument or a reference solution. None traced to the world.** The world's own numbers are the best the project has recorded: conflict cost 76 % of headroom, spread across five conflicts, monotonic in strength, at settings inside their declared realistic ranges, with the defect audit confirming all fifteen present.

### Capture stopped being scored against an impossible ceiling

`P0` is clairvoyant. On the P0M9 world it sits 2.10 min below `P1` out of 3.35 min of headroom, so a solution reconciling perfectly and reading every feed the instant it published still topped out near **0.37**. A capture of 1.0 was not hard, it was unreachable, and every figure the project had recorded was scaled against it.

Capture now normalises against `P0a` — the same optimum held to what had actually been announced. **1.0 means "as well as anyone could have done knowing what could be known".** The naive solution moved from −0.178 to −0.465, a factor of 2.61 that matches the ratio of the two denominators almost exactly, which is the check that it did what it should.

**The `capture > 1` invariant moved rather than disappeared.** `P0a` is a strategy, not a bound (`KNOWN-ISSUES.md` #15), so a real solution may legitimately beat it, and quarantining that would punish a player for outperforming a heuristic. What stays impossible is beating `P0`. So: capture is reported against `P0a`; **only** when it exceeds 1.0 is `captureVsOracle` computed against `P0`; and *that* exceeding 1.0 quarantines the run.

One silent failure the implementation forced out: `executeReactively` returns null when the announcement-limited run does not arrive, and capture then reverted to the clairvoyant scale **without saying so**. Fixed by flooring `P0a` at `P1` — the reference policy plans with no disruption knowledge at all, which is strictly less than "everything announced by now", so any optimum must dominate it. The same rule `baselines.ts` had already needed, for the same reason.

**Recorded rather than adjusted:** `CLEARANCE` sets a minimum headline per tier, chosen while capture was normalised against `P0`. Rescaling by 2.6 without touching those bars makes every tier materially harder to clear than its number was chosen to mean — the naive solution's headline fell from 0.192 to 0.019 against an unchanged 0.25. That is `KNOWN-ISSUES.md` #20 again, and re-deriving it is a decision about how hard a tier should be rather than an arithmetic correction.

### Gate 1a, built: `npm run identifiability`

The dual of the defect audit. That one confirms the declared conflicts are present; this confirms they have not made the world unanswerable. It needs no solver — only the data.

A quay's signature is every published observation of it, from every operator: stop id, name, coordinates. Two quays with identical signatures cannot be told apart by anybody reading only what was published, and the walk between them is a cost no solver can predict.

**One thing is deliberately not treated as distinguishing: which trips call there.** An operator publishing at Site granularity names one stop for three platforms and its trips call at that stop, so the calling pattern separates them no better than the stop does. Counting it would report a world as fair on the strength of information the player cannot act on.

**It found something on its first run.** Sudbahn's three platforms at Central all publish as `sudbahn|1|Tsentralna|50.450200|30.514200`, no other operator names them, and they are spread over 98 m — **1.27 min of unpredictable walking, 38 % of headroom**, over the provisional 25 % bar it ships with.

That is `A-granularity:sudbahn` working exactly as declared, which is the point worth keeping: **a conflict can be correctly declared, audited as present, and still ask a question nobody can answer.** The defect audit confirms it exists; only this says what it costs someone who cannot resolve it. And it got worse at P0M9, which added the third platform — no instrument then existed to notice.

The larger consequence is recorded as `KNOWN-ISSUES.md` #23: `P0a` routes on the canonical world, so it knows which platform and no player can. **The ceiling capture was just re-based on is itself unreachable by roughly this amount** — one unreachable ceiling was fixed on 2026-09-04 and a second, smaller one sits underneath it. `PHASES.md` Gate 1a anticipated it: *solvable* should mean "the achievable optimum, **less the ambiguity floor**, is still better than P1". The floor is now measurable and is not yet subtracted anywhere.

### Gate 1's symptom condition, built: `npm run symptoms`

For each declared conflict, does the **player-visible** output differ between a world with it and a world without? The symptom vector is attribution causes, traveller failure reasons and Information event counts. It **excludes the score**, because a conflict that moves the number and nothing else is exactly the case being tested for.

It shares `conflictVariants()` with the ablation, so a conflict one instrument scores and the other never builds cannot slip through.

**Result: nothing in this world is arbitrary.** Five of fourteen conflicts produce a visible symptom, and every silent one costs the solver exactly 0.000 — which is the correct result for texture, not a finding.

### The eighth instance, caught before it was reported

The first version read costs from `npm run probe` and symptoms from its own runs. Those are `P2rt` and the naive reference player — **two different lazy solvers** — and it was about to report `B-time-encoding:sudbahn` as *silent and costly*: arbitrary, the precise failure mode the check exists to catch.

It is neither. On the solver that cannot see the conflict, it also does not pay for it: the naive player parses `local_naive` timestamps using the offset the brief states, so a conflict that defeats `P2rt`'s decoder is free to it. The check now measures cost and symptom in the same run on the same solver.

This is the same error as the clairvoyant reference, the conflict-free floor, the population standard deviation and the unpaired design — **a right number compared against the wrong thing**. It was avoided only because the rule had been written into `CLAUDE.md` after the seventh.

### And the finding underneath it

| conflict | costs `P2rt` | costs the naive player | visible to the player? |
|---|---|---|---|
| `B-time-encoding:sudbahn` | **0.72m — Gate 3's largest term** | **0.000** | no |
| `C-coordinate-offset:nordline` | 0.54m | 0.514 | yes |
| `A-coordinate-precision:nordline` | 0.56m | 0.080 | yes |
| `C-delay-unit:nordline` | 0.21m | 0.000 | no |

`P2rt` loses 76 % of headroom across five conflicts; the naive player loses to **two**, and the conflict dominating Gate 3 costs it nothing.

**Difficulty is not a scalar property of a world.** It is a property of the (world, solver) pair. P1M0 noted that as an aside; this quantifies it, and it means *"this world is hard"* is not a statement that can be made without naming who it is hard for — which nothing in the tier ladder currently does. Recorded as `KNOWN-ISSUES.md` #24.

It also sharpens #19. The Information family's **events** do move — `D-silent-cancellation:sudbahn` produces ten silent events where the honest world has none — while the Information **score** moves by a thousandth. The insensitivity is in the scoring formula, not in the world and not in the instrument, which is a more tractable problem than either and a different one from the mechanism that issue had guessed at.

### #17 resolved, and the cause was not the competent solution

The decisive experiment finally ran. `competent-deaf` plans exactly as `competent` does and never lets a realtime feed reach its routing. **The result is byte-identical to `competent`** — 106 arrived, 12 forgone, 63 replans, the same failure profile. Reading the feeds costs it nothing, and the hypothesis that had stood for two milestones is dead along with every other candidate listed against #17.

**A methodological note first, because it nearly produced a fifth wrong answer.** The first run of `competent-deaf` returned results identical to `naive`, which looked like a finding. `serve.ts` whitelisted player modes and **silently fell back to `naive`** for anything unrecognised, so the diagnostic ran as the wrong player and produced a complete, plausible, meaningless run. It now exits with an error. *A silent default is indistinguishable from a working experiment.*

**What was actually wrong** was visible in what the two solutions attempt:

| | forgone | arrived | slower than P1 |
|---|---|---|---|
| naive | **42** of 132 | 112 | 12, by 5.3m |
| competent | **12** of 132 | 106 | 26, by 11.6m |

The naive solution declines a third of its obligations, and **declining was free**. `REFERENCE-POLICY.md` §8 requires a fixed forgone-obligation penalty, calls it *"a requirement rather than a preference"*, and names the hazard exactly:

> a half-built solution that answers badly could plausibly score worse than one that answers not at all.

It was never implemented. The scorecard counted forgone obligations, attributed them, and charged nothing. **The exploit the specification predicted before any of this was built was live for ten milestones**, and two of those milestones were spent looking for a defect in the competent solution that was really a missing mechanism in the scorer.

### And the measurement that corrected the correction

With both changes in place — the §8 penalty and the `P0a` denominator — the ordering is:

```
null        -1.000      blind      -0.784
naive       -0.784      competent  -1.656
```

`null` lands on exactly **−1.000**, which is §8's second clause stated as a number: *"one that declines everything loses everything."* Gate 2's spread rose from 0.299 to 0.522.

**But the competent solution is now the worst of the four, and worse than declining everything.** An earlier estimate in this milestone concluded the penalty would restore the ordering; it compared a competent figure normalised against `P0` with a naive figure normalised against `P0a`, two scales that differ by a factor of 2.6. The conclusion was an artefact of mixing them — the ninth instance of this project's one recurring error, committed while writing up the eighth.

So the honest position: **two causes were confounded and one is removed.** The missing penalty flattered the naive solution, which collected P1's outcomes free on 42 travellers. The competent solution is *also* genuinely bad — roughly two minutes per traveller worse than no integration at all — and no penalty rescues that. #17 keeps the second half.

### The penalty, implemented

`capture − FORGONE_PENALTY_SHARE × (forgone / travellers)`, expressed as a share of the headroom each declined traveller represented so it scales with the world rather than being an absolute number of seconds meaning different things in different cities. The scorecard reports the deduction on its own line.

The magnitude is **provisional** and decides an ordering rather than a decimal place: at 0.5 the naive solution still outscores the competent one, at 1.0 it does not. The default satisfies §8's other clause directly — *"one that declines everything loses everything"* — and the null solution now scores −1.0 where it scored exactly 0.0.

**A test fired to say so.** `a player that answers nothing scores exactly 0.0` had asserted the exploit as though it were a property, with a comment claiming the player "is not rewarded for the tidiness". It was. Rewritten to assert §8's requirement instead.

### #15 tightened: nothing we can compute beats P0a

`P0a` is now the best of its own plan-and-replan, P1's outcome **and P2rt's** — every achievable strategy this codebase computes. A lazy solver beat it on `q15` before; it now loses on **none of the 120 comparable queries**.

Not a proven bound — the true optimum over announcement-limited strategies is a planning problem over belief states — but nothing constructible outperforms the reference that caps it, which matters more since 2026-09-04 made that reference `capture`'s denominator. The characterisation test now asserts the *absence* of a violation and says what to do if one returns.

### #23 dissolved: the instrument was overstating by a factor of six

The identifiability audit compared **the worst walk one traveller cannot predict** against **mean headroom over the whole population** — a maximum against an average, this project's most familiar error in yet another hat.

| | |
|---|---|
| worst walk one traveller cannot predict | 1.27m — 38 % of headroom |
| reachable by | **20 of 132** scored queries |
| worst cost across the scored population | 0.19m — **6 %** |

**Gate 1a passes at 6 %.** The audit now charges each ambiguity only to the travellers who could meet it and thresholds that, reporting both. It remains an over-estimate — every traveller who *could* meet the ambiguity is charged once, though not all are routed through it — which is the right direction for a bound.

The world is fine. The instrument needed correcting before its subject could be judged, which is the fourth time that has happened here and the reason the finding is left recorded rather than deleted.

### #17 answered: the solution is fine, the query set is not

Six hypotheses died by measurement before the answer appeared, and each was cheap:

| hypothesis | how it died |
|---|---|
| it mishandles realtime | `competent-deaf` is **byte-identical** to `competent` |
| its transfer budget is too tight | `TRANSFER_FLOOR_S` swept 60/120/180/240 s — 2.3m per traveller at every setting |
| its decoded departure times are off | departures match truth to **0 s** on all three operators, over 1102 trips |
| its reference frame is displaced | true, fixed, and not enough |
| the vanished-trip heuristic misfires | the feed republishes every trip; ids stable all day |
| the delay-unit heuristic misfires | needs a delay ≥ 60 min; the world draws 2–15 |

**The measurement that ended it** was the list of amounts lost on slow arrivals: 30.0, 25.0, 20.0, 20.0, 20.0, 20.0, 18.0, 18.0, 18.0, 15.0 minutes. Round numbers, and they are the line headways in `city.py`. It misses a vehicle and waits exactly one headway. Fifty of its sixty-three replans are `vehicle_cancelled`, against the naive solution's twenty-six.

Which led to the number that explains everything:

| | |
|---|---|
| scored queries with **any** headroom against clairvoyant `P0` | **36 of 120** |
| queries where `P0a` equals `P1` — **no reachable headroom at all** | **105 of 120 (88 %)** |

**On seven journeys in eight, the best anything could do knowing only what had been announced is exactly what a traveller does with no integration layer.** There is nothing to win — and plenty to lose, because cancellations are announced after a plan is made and a route with three transit legs is exposed three times where the reference policy's restricted graph is exposed once. Each exposure costs a full headway.

So a solution that reconciles well, finds the cross-operator hops and uses the whole network takes more risk for headroom that mostly does not exist. **The competent solution is not bad at this world. It is playing a game that is 88 % downside**, and the naive solution's flattering score comes from declining a third of its obligations and making simpler plans for the rest.

**And the cause is P0M9.** Growing the query set from 22 hand-picked journeys to 132 generated ones fixed the resolution problem that milestone existed for, and diluted the journeys that need integration to about one in eight. The hand-picked ones were *chosen* to need it — a tram chord beating a trip via Central, an undeclared cross-operator hop. Every Site pair 1500 m apart is mostly a radial journey with one obvious route.

Recorded as `KNOWN-ISSUES.md` #26 with the fix stated as a generator requirement: **a scored query set must be sampled for reachable headroom**, `P1 − P0a` above a threshold, computable before any solution exists.

The warning attached to it matters as much as the fix: **do not resolve it by removing the risk.** Lowering the cancellation rate or the planning lead would make these journeys survivable and would also delete the thing that makes realtime integration worth anything. The problem is not that risk exists — it is that 88 % of the journeys carry risk without reward.

### Ratified 2026-09-04

* **The forgone-obligation penalty at 1.0** — declining forfeits the whole of what integration was worth to that traveller. The null solution scores exactly −1.000, which is `REFERENCE-POLICY.md` §8's second clause as a number.
* **The ambiguity bar at 25 %** of headroom, on the aggregate rather than the per-traveller worst case. Gate 1a passes at 6 %.
* **Gate 1c recorded PASS by decision**, and written into `PHASES.md` in those words — scope, not evidence. What is known about this world's discoverability remains nothing.

### Phase 0's exit criteria met, 2026-09-04

Two divergences between the specification and `gates.ts` had to be closed first, and they were the same divergence twice: **the script was still deciding gates the way it had before the specification changed.**

*Gate 1* still ran the old solution-based check and let its failure drive the verdict, although the split ratified on 2026-09-03 makes the competent solution a regression detector. It now computes 1a (reachable headroom and identifiability, from the world alone), 1b (a lazy integrator must not already win) and reports 1c as a decision.

*Gate 3* still decided on the whole-score figure, although the same ratification returned its criterion to journey-time headroom on `P2rt`. The numbers did not change; which one is binding did.

A guard was corrected rather than silenced along the way. The `#14` warning fired on any honest-values floor above 30 s — a proxy from when the floor was expected to be zero. It is not zero and should not be: a lazy integrator polling every five minutes loses something on entirely honest data, which is a property of the solver rather than a defect in the comparison. It now fires on what #14 was about — a negative conflict cost, or a residual larger than what is being attributed.

```
VERDICT: all three gates pass
```

| | |
|---|---|
| 1a solvable | 6.20m reachable of 8.37m; ambiguity 2 % against a 25 % bar |
| 1b not trivial | a lazy integrator captures 0.200 of reachable headroom |
| 1c discoverable | PASS by decision — scope, not evidence |
| 2 discriminating | 0.934 of spread, four distinct scores |
| 3 conflicts doing the work | 3.04m, **36 % of headroom**, bar 20 % |

**And the competent solution recovered to the top of the table** — capture +0.054, headline 0.334, above the naive solution's 0.169. That is the ordering `REFERENCE-POLICY.md` §8 and Gate 2 both want, and it confirms #17's diagnosis end to end: the solution was never bad at this world, it was playing a query set where seven journeys in eight had nothing to win. Give it journeys with headroom and it wins them.

The honest summary of Phase 0 is not that the gates pass. It is that **they refused to pass for four milestones while every instrument in the project was wrong in a different way**, and that the ninth correction was found by the eighth. `KNOWN-ISSUES.md` #13 through #26 are that record.

---

## Phase 0 — closed

The milestone plans below were carried in `ROADMAP.md` until Phase 0 completed on 2026-09-04. They are moved here because the roadmap is for work still to do, and kept in full because each one's *stated intent* is worth comparing against what it actually produced — in four cases out of four, the milestone found something other than what it was scoped to find.

### The reopened milestones, as planned

**P0M7 — `replan`.** Issue the obligation the contract had specified since v0.3 and the harness had never sent. Scoped because conflict cost quadrupled as the planning lead shortened, so a planner that never replans is mostly blind and a blind planner cannot be punished for reconciling badly.

*Found instead:* the obligation worked, and wiring it into the baselines exposed that the conflict-free world was not a floor and `P0a` was not a bound. Neither was suspected beforehand.

**P0M8 — An instrument that can see a realistic conflict.** Scoped from the project owner's constraint that a conflict must stay realistic: a coordinate offset needed 260 m to bite while realism caps it at ~150 m, and the lazy matcher fused anything within 120 m. Deriving the matcher threshold from the world's own geometry closed that gap.

*Found instead:* the catalogue was never one conflict deep — 8 of 12 settings bite once the instrument can see them, and `C-coordinate-offset` bites at 60 m rather than 260 m.

**P0M9 — A world big enough to measure one.** Scoped because at 22 travellers one journey changing outcome was worth 0.098 of headline while Gate 3 had to decide 0.2 — a 0.1 question read with a 0.1 ruler.

*Found instead:* resolution and repeatability are different problems. 132 travellers stopped one journey deciding the answer and did nothing about the *day* deciding it, and the query set it generated could not reward integration on 88 % of journeys.

**P0M10 — Conflict potency.** Scoped to strengthen the conflicts that bite and retire those that cannot.

*Found instead:* nothing needed strengthening. Moving the same fifteen conflicts, at identical settings, onto the operator that carries the network doubled their cost. What the milestone actually spent its time on was the forgone-obligation penalty that `REFERENCE-POLICY.md` §8 had required and nobody had implemented, a query set that could not reward integration, and two gates deciding on metrics they had not been ratified against.

### What Phase 0 delivered

A hand-built Tier-2 world — 38 sites, 50 quays, 10 lines, 98 scored journeys, 15 declared conflicts — with a contract, a scorer, three reference solutions, and nine instruments that measure it. All gates pass.

### What Phase 0 actually taught

**Every instrument was wrong at least once, and the ninth fault was found by the eighth.** The recurring shape is one sentence: *a right number compared against the wrong thing.* A baseline handed the truth. A clairvoyant reference. A floor harder than the world it floored. A population standard deviation where a standard error belonged. Two independent means where a paired difference belonged. A separation statistic that assumed its own answer. A gate deciding on an unratified metric. A player silently running as the wrong player. A per-traveller maximum compared against a population mean.

None of these was a coding error. Each was a comparison whose two sides were not the same kind of thing, and each survived because the number it produced was plausible.

The habit that came out of it is in `CLAUDE.md` and is the most portable thing this phase produced: **when you add a measurement, check both sides of the comparison for matched information, and for a matched opportunity set.**

---

### The Phase 0 milestone plans, verbatim as the roadmap carried them

Kept because their exits are what the results above should be read against.

### P0M7 — `replan` — **done, and it changed what P0M8 has to do**

Issue the `replan` obligation the contract has specified since v0.3 and the harness has never sent (`docs/KNOWN-ISSUES.md` #1). Triggers, positions and response statuses are already fully specified in `PLAYER-CONTRACT.md` §5.5; this implements them.

**Why it is first and why it is not Phase 2 work.** Half of what a live integration layer is *for* — noticing trouble and rerouting somebody around it — is currently unmeasurable, and the measurement above shows it is also suppressing the thing Gate 3 is trying to see. A player who answers once, thirty minutes ahead, cannot be punished for reconciling badly, because it had almost nothing to reconcile.

**Exit:** a traveller whose plan collapses mid-journey is asked again; `P2rt` and `P0a` both replan on the same cadence; and `npm run horizon` shows conflict cost at the harness's planning lead rising towards its short-lead value.

**First two clauses met. The third cannot be evaluated**, and finding out why is what this milestone produced. Wiring replanning into the baselines exposed that conflict attribution itself is unsound: switching every conflict off makes the world *harder*, because the lazy matcher then over-merges quays that are 31 m apart (`KNOWN-ISSUES.md` #14), and `P0a` is a well-informed strategy rather than a bound (#15). Conflict cost by subtraction currently reads −1.01 min. See [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

**The trap to avoid:** `replan` must not become a way for a player to be handed information it did not fetch. The obligation says a plan needs revisiting; it does not say why, and the information-set audit must still hold.

---

### P0M8 — An instrument that can see a realistic conflict — **done**

**Why this exists.** P0M7 left conflict cost reading −1.01 min, and the diagnosis is not that the conflicts are weak. Three numbers decide everything and none of them is a property of the conflicts:

| | |
|---|---|
| the lazy matcher fuses stops within | **120 m** |
| `C-coordinate-offset` first costs anything at | **260 m** |
| a real disagreement about one stop's position tops out around | **150 m** |

A matcher that cannot tell apart two quays 31 m apart cannot notice a 60 m offset. So "how strong must this conflict be" was always "how far past 120 m", which is a fact about the instrument. And past ~150 m a coordinate offset stops describing a disagreement between two operators and starts describing a broken map — a different lesson, and not the one this project teaches.

Sweeping the matcher threshold does not rescue it. At 60 m, a 30 m offset costs 0.90 min, a 60 m offset costs **−0.44**, and a 130 m offset costs 0.01. Merge outcomes are discrete — a pair of stops either fuses or it does not — so across 22 queries the result is decided by which stops happen to flip, not by conflict strength. **The only magnitudes that produce a clean monotonic signal are the unrealistic ones.**

Three consequences, and they are this milestone:

**A. Tighten the matcher so a conflict-free world costs nothing.** At a 20–30 m threshold the clean world reconstructs exactly — 34 merged stops for 34 canonical quays — and the floor falls from 1.13 min to 0.23, which is just the five-minute poll cadence. That retires `KNOWN-ISSUES.md` #14 and makes subtraction sound again. It does *not* on its own make realistic offsets bite.

**B. Gate 3 attributes across the whole headline score, not capture alone.** Service capture is journey time, and journey time is the family realistic conflicts move least. `D-staleness` costs 0.31 min of travel — but staleness's real damage is that somebody is *not warned*, which lands entirely in the Information family and is invisible to the gate as currently written. Catalogue D may already be earning its place somewhere nobody is looking.

This changes how the gate is computed, not just its arithmetic. Information is only observable from a **run** — a routing model warns nobody — so Gate 3 must compare scorecards from actual runs of the naive reference player against the world and against the world with conflicts off. That is slower than `calibrate()` and worth it.

**C. Realism becomes a budget, not a warning.** Every catalogue setting gets a documented plausible range and the real-world cause that produces it — kerbside pole versus platform centre at 5–30 m, station centroid versus a specific quay at 20–150 m, geocoding from a street address at 10–100 m, staleness after a stop physically moved at 10–200 m. Nothing may be generated outside its range.

This is the structural form of the trap the milestone was already warned about. A note saying "do not make conflicts absurd" loses to a failing gate; a declared range that the audit enforces does not.

**Exit:** a conflict-free world costs a lazy integrator under 0.25 min; Gate 3 reports conflict cost as a share of the headline score, computed from real runs; and every catalogue setting carries a plausible range with its provenance.

**All three met.** The floor is 0.23 min, journey-time conflict cost is positive and monotonic at **+0.59 min (19 % of headroom)**, and the ceilings are enforced by tests rather than prose.

**And the run-based gate cannot yet be decided.** Its resolution is ~0.1 of headline per traveller — arrival is binary and there are 22 — while the effect is ~0.1, so its answer is decided by one journey. `npm run gates` now prints that resolution and returns INCONCLUSIVE rather than a verdict it did not earn. That is P0M9's problem, and it is why P0M9 exists.

---

### P0M9 — A world big enough to measure one — **done, with one clause carried forward**

**You cannot calibrate realistic-magnitude conflicts on 22 queries and 34 quays.** `KNOWN-ISSUES.md` #4 has said the gap estimates are noisy at this size since P0M6 and assigned the fix to network generation, which is Phase 1 work sitting behind a gate that cannot pass without it. P0M8's threshold sweep is the evidence that the wait is no longer affordable: the non-monotonic 0.90 / −0.44 / 0.01 sequence is not a weak signal, it is no signal.

Grow the hand-authored city — more quays, more interchanges where several quays genuinely sit 30–80 m apart, more operators overlapping, and a query set large enough that a single traveller changing outcome does not move a gap.

**Exit:** the three gaps are stable across seeds within a stated tolerance; a realistic-magnitude conflict produces a monotonic cost curve rather than a scatter; and Gate 3's run-based measurement resolves an effect smaller than the 20 % it must decide — that is, one traveller changing outcome must be worth substantially less than 0.2 of headline.

The last clause is the operative one. It is the reason this milestone exists rather than a nicety about tolerance: at 22 travellers the gate is currently deciding a 0.1 question with a 0.1 ruler.

**Where it landed.** The city grew to 38 sites, 50 quays, 10 lines and 132 scored queries. One traveller is now worth **0.001** of headline against the 0.2 the gate decides, and journey-time conflict cost rose from 19 % to **42 %** of headroom. The last clause is met by a factor of two hundred.

**The first clause is not met, and is now measured rather than feared.** Across six seeds, with only the disruptions changing, `P0−P1` headroom has a standard deviation of **31 % of its mean** (1.51m to 4.28m) and conflict cost **36 %**. Resolution and repeatability turned out to be different problems: 132 travellers stopped one journey flipping the answer, and did not stop the *day* deciding it.

**The monotonicity clause is met.** The conflict-depth probe now averages over seeds and judges each step against the spread. `C-coordinate-offset` runs −0.01 → 0.10 → 0.55 min across 30 → 60 → 130 m on nordline, monotonic and entirely inside its plausible band; before the world grew the same sweep gave 0.10 / 0.55 / 0.55 / −0.09 / 3.30. Nine of twelve conflicts now bite at plausible settings, up from six before P0M8.

**Carried into P0M10:** difficulty must be reported as a mean over seeds with its spread, not as a single calibration. Comparing conflict settings on one seed each would be comparing draws from overlapping distributions. `npm run probe` and `npm run stability` both do this; `npm run gates` does not yet, and its Gate 3 number is still a single draw.

**The trap to avoid:** growing the world until the numbers look better. The exit is *stability*, which is falsifiable, not *size*, which is not. Measure the variance and publish it.

---

### P0M10 — Conflict potency

The milestone P0M8 used to be, now executable — with three things P0M9 established that change how it must be done.

**Report over seeds, never one calibration.** Headroom's standard deviation is 31 % of its mean and conflict cost's is 36 %. A single run is a draw, not a measurement, and two settings compared one seed each are two overlapping distributions.

**Gate 3 still reports a single draw.** `npm run gates` has not been made seed-averaging, so its headline conflict-cost figure carries the same 36 % uncertainty the probe now reports explicitly. That should be fixed before the gate is used to decide anything.

**Gate 1 currently measures the reference solution, not the world** (`KNOWN-ISSUES.md` #17). The competent solution went from +0.292 capture on the 34-quay world to −0.296 on this one, and fourteen of its twenty-two failures are `replan_no_route`. Deciding whether to strengthen it, or to accept that Gate 1 needs a solution written by somebody who has not seen the world, comes before reading anything into Gate 1. Strengthen the conflicts the probe shows can bite *within their declared realistic range*, place them on operators carrying enough traffic to express them, retire the ones inert at every plausible setting, and add any the probe suggests are missing.

From `npm run probe`, re-run once the instrument and the world are fixed:

| Finding | Action |
|---|---|
| `sudbahn` expresses nothing at any strength | weight conflict placement by carried traffic |
| `A-granularity`, `A-id-scheme`, `A-naming`, `A-coordinate-source`, `D-silent-cancellation` inert everywhere | make the lazy merger depend on identity, or retire them from the load-bearing catalogue |

That last row is a genuine fork and should be decided explicitly rather than by implementation. Catalogue A is what `CORECONCEPT.md` presents as the heart of the challenge, and it currently costs nothing because `P2` matches on geometry alone. Either the baseline is too narrow to represent a real lazy integrator, or identity reconciliation is not load-bearing in this design. Those call for opposite responses.

**Exit:** Gate 3 passes — conflicts account for at least 20 % of the headline score's headroom, no single conflict supplies more than half of it, every setting sits inside its declared realistic range, and the defect audit still confirms every declared conflict is present.

**Where it got to, and what it produced instead.** Placement did the work: moving the same fifteen conflicts, at the same settings, onto the operator that carries the city took conflict cost from 39 % to **76 % of headroom**, spread across five conflicts rather than resting on one. Gate 2 passes. Gate 1 does not, and Gate 3 is not decidable until a threshold question is settled.

**Both remaining failures turned out to be the same structural fault**, and three proposals now sit in the specifications awaiting ratification:

**All three were ratified on 2026-09-03.**

| decision | where | what it changes |
|---|---|---|
| **Gate 1 splits into three** — solvable, not-trivial, discoverable | `docs/PHASES.md` | the first two are computable per world and stay gates; **1c is removed from the MVP** and returns in Phase 3. The competent solution is demoted to a regression detector |
| **The identifiability audit** | `docs/PHASES.md`, Gate 1a | a per-world check, needing no solver, that the published data can distinguish the entities that matter — the dual of the defect audit, and a lower bound on any solver's loss |
| **Gate 3 returns to its ratified metric** | `docs/PHASES.md`, Gate 3 | journey time against headroom, measured on `P2rt`. The whole-score figure becomes a diagnostic |

**Two instruments to build, both per-world and neither needing a solution:**

* the **identifiability audit** — is the information there at all?
* the **symptom check** (`KNOWN-ISSUES.md` #22) — is a player charged for a conflict given anything to notice? A conflict that silently subtracts capture is not difficult, it is arbitrary.

Together they are what catches a discoverability problem in Phase 0 now that 1c is not a gate. Neither *measures* discoverability; both catch worlds that are unfair rather than hard, which is the part that can be caught without a person in the room.

**Deferred to Phase 3: generated verifier quests.** Directed tasks against the world's own answer key — *find the stop these two operators disagree about and report the distance* — verifier-only, converting discoverability from anecdote into pass/fail data, and doubling as regression tests and as the seed of the Tier 0 tutorial. They arrive with the documentation work because a quest is a question about what can be found in the artefacts, and there is nothing to generate one from until conflicts and documentation are themselves generated.

They do not retire the playtest. A quest asks *can you find X, having been told X exists*; the playtest asks *can you work out that X exists at all*.

The fault they share: **a gate measured by running a solution we wrote is a gate about that solution.** `P2rt` and `P0a` are defined in `REFERENCE-POLICY.md`; the competent and naive players are implementations. Every point of Gate 1's failure at P0M10 traced to a bug or an overfit assumption in ours, and Gate 3's two irreconcilable numbers differ by a factor of 3.5 for no reason other than which of the two kinds of instrument they use.

A fourth question fell out and is recorded as an **OPEN** in `docs/SCORING.md`: `P0a` sits 2.10 min above `P0` against 3.35 min of headroom, so **capture is normalised against a ceiling of about 0.37 that no player can exceed**. Every capture figure the project has recorded is scaled against an unreachable 1.0.

**The honest alternative.** If realistic conflicts cannot reach 20 % even with a sound instrument and a big enough world, the response is the one this roadmap has committed to from the start: **narrow the claim rather than pad the catalogue.** That would not end the project. It would move its centre of gravity from journey-time capture to the Information family and to the engineering effort of getting there — which is arguably where an integration challenge belongs anyway, and would itself be a finding worth publishing.
---

---

## P1M1 — Projection generation *(in progress)*

**Delivered:** a generator that produces per-operator manifests from the §2.1 catalogue for any tier, and worlds built from them that pass every per-world instrument.

**Corrected:** five things, four of which were only visible once a generator existed to produce combinations nobody had chosen by hand.

### One catalogue, three consumers

`build.py` held `DEFAULTS` and `CONFLICT_NAMES`; `probe.ts` held `SWEEPS`; the generator needed both, in Python. Three copies of one list, already drifted. `src/schema/src/catalogue.ts` is now the source, emitted to `contract/catalogue.json` and CI drift-checked, read by `tools/worldbuild/catalogue.py`. `SWEEPS` derives from it and adds only the diagnostic values *beyond* the plausibility ceiling, which the probe sweeps and a generator never does.

### What the generator had to honour, and what it got wrong anyway

Placement weighted by reach, values only from `generate`, the least-reaching operator left honest as a reference — all three from Phase 0 measurements. Then the first two generated worlds failed on things Phase 0 had never had occasion to state.

**Realism is a property of the combination.** One operator drew a lat/lon swap, a 130 m offset and a 3-decimal truncation. Each was inside its own ceiling. The published stops sat **2,200 km** from their quays, and the world declared three geometry conflicts while containing one — nothing subtler survives underneath a swap. The catalogue gained an `excludes` relation, and `npm run realism` measures the *composed* displacement on the world itself, which is the only defence that works against combinations nobody anticipated. `D-no-delays` excludes `C-delay-unit` for the same reason: an operator publishing no delay has no delay unit to get wrong.

> **A conflict that masks another wastes it and teaches one lesson instead of two.**

**A conflict must be one the operator can express.** `A-granularity:ostline` was declared and absent: publishing at Site granularity means one stop where there are several quays, and ostline serves a single quay at every station it calls at. Phase 0's Sudbahn finding in a new form — then a conflict that *cost* nothing, here one that *exists* nowhere, and both make a world quietly easier than its tier claims.

The first attempt at the fix was wrong instructively. Counting stations that *have* several quays gave ostline 1 and would have kept the bug; the projection groups only the quays *that operator serves*, so what matters is whether it serves several. Corrected: nordline 2, ostline 0, sudbahn 1 — matching the audit exactly.

### The eighth "right number compared against the wrong thing"

The audit's offset evidence paired `timetable.stops[i]` with `quays[i]` positionally. Under Quay granularity those lists happen to correspond; under Site granularity they are published *sites* against canonical *quays*, different lengths and no correspondence, so the drift was a distance between two arbitrary points in the city — **668 m reported for a 130 m setting**, true figure 111 m.

It only ever produced a false *pass*, which is the worse direction: a world whose offset conflict had silently vanished would still have audited `ok`. Displacement is now measured against *the same operator's own output with the conflict off*, keyed by stop id — a definition that needs no correspondence between published and canonical entities and so survives any granularity.

**First one of these found by a generator rather than by reading.**

### Documentation, finally served

`docs_url` was advertised in the brief for the whole of Phase 0 and returned 404. Each operator now serves an OpenAPI 3.1 document generated from its own manifest at request time — one source for behaviour and description, so they cannot drift.

The decision inside it is which properties an operator states:

> **Format and units are documented. Accuracy, freshness and completeness are not.**

An operator can only document what it *intends*. It states its time encoding and its identifier scheme; it does not state that its survey is 130 m out or that its cancelled trips vanish, because it does not know or would not say. Sections A and B become readable rather than archaeological — which was never the skill being taught — and every conflict about whether the data is *true* stays discoverable only by measurement.

### Catalogue D does not score, and the reason is not the one recorded

`KNOWN-ISSUES.md` #19 had said the Information family's insensitivity was in the scoring formula. P1M1 implemented all four of `SCORING.md`'s candidate directions as pure functions of the same run and scored them side by side across twelve paired seeds. **Every effect landed inside its own standard error and an order of magnitude below the seed-to-seed noise** — including two candidates built to be markedly more sensitive than the current one. That is not what a formula problem looks like.

`npm run lead` found what it is. `DEFAULT_POLICY.noticeLeadS` is `[300, 1800]`; the committed world declares staleness of **90 s and 300 s**. A feed conceals only a disruption whose announcement lead is shorter than its own lag, and no disruption in this world has a lead below 300 s. **Both settings hide exactly zero, by construction.**

The defect audit had been printing this for months, in a line nobody read closely: *"feed is stamped τ−300s, and hides 0 disruption(s) that are already true."*

> **Two numbers, each defensible alone, chosen in different files by people who never compared them.** `noticeLeadS` was picked so short leads would punish a slow polling cadence; the staleness settings were picked for plausibility. Their *relationship* decides whether the conflict exists, and nothing owned it.

The fix needs no unrealistic setting: 900 s is already the ceiling, already carries its stated cause, and hides 41 % of disruptions. The committed world simply never drew it. And a third generator rule follows, the numeric cousin of the expressibility rule above — **a setting must be capable of expressing itself given the rest of the world's parameters**, which for staleness means a comparison against `noticeLeadS`.

### Also

`python -m worldbuild --out path` silently built a world called `--out`, discarding the rest of the arguments; two tier builds reported plausible content hashes while writing to a junk file, and the audit that followed read a stale bundle and was believed. Unknown options now exit 2. The same silent default cost a whole measurement in Phase 0.

Tiers 3 and 4 generate byte-identical manifests. With A–D active at all three top tiers and twelve settings to draw from, placement saturates by tier 3 and the density lever has nothing left to buy — so P1M1's exit clause about tier bands is carried to P1M4 rather than declared met (`KNOWN-ISSUES.md` #32).

`symptoms`, `gates` and `information` now take a world path, because P1M1's exit asks them about generated worlds and all three were hard-coded to the committed one.

### The audit check that hid it, and the third verdict

The staleness audit passed on `knownNow.length > knownStale.length || feed.as_of !== probe`. **The right-hand side is true whenever staleness is non-zero**, so the check could not fail, and its evidence line reported the disruptions concealed at one arbitrary instant — printing `hides 0 disruption(s)` on a world where staleness was inert *and* on one where it hid a third of them.

> **A line that says the same thing in both cases carries no information at all.** It was the one place this defect was visible, and it was visible for months.

It now measures how many of an operator's disruptions the lag withholds *past the moment a warning could still help*, and the two worlds finally read differently: `0/127` against `54/127`. That 43 % agrees with `npm run lead`'s 41 %, reached by a different calculation.

`INRT` joins `ok` and `MISS` as a third verdict, and deliberately does not fail the audit. **Absent and inert are different problems needing different fixes** — the first is a projection that did not do what it was told, the second is two of the world's parameters that do not fit together. The committed world reports two inert conflicts and still passes gate 4, which is the honest reading: its projections are correct and its Tier-2 realtime component is decorative.

The general lesson is the one this project keeps relearning in new places: *a test that cannot fail is not a test*, and the tell is an evidence line whose value never changes. Both of P1M1's audit defects had that shape, and neither was caught by asserting the audit passes — because both did pass. `src/projections/test/audit-evidence.test.ts` now asserts that the audit **distinguishes**, constructing each pair of cases and requiring different answers.

### Decisions taken, 2026-09-05

* **The Information formula does not change.** The four candidates span 0.202–0.229 against a standard error of 0.027 — inside one σ, on a measurement built to separate them. `SCORING.md`'s item keeps its OPEN label: what is settled is that there is no evidence for a change, not what the family should weigh.
* **`P0a`'s ambiguity floor holds at "publish it, subtract nothing", and moves to P1M2.** It measures 1 % on every generated world and does not grow with tier, because the ambiguity comes from `A-granularity` and the generator will not place that where there is no station to collapse. The case the warning was about is Site granularity over larger stations, and station size is a property of the network.
* **`D-staleness`'s value range needs deriving from the world, not listing as constants** — `KNOWN-ISSUES.md` #34, P1M4. Filtering inexpressible values leaves one usable setting out of three, so staleness is a switch rather than a ladder. Explicitly *not* settled by picking numbers that make the tier ladder look reasonable.

### And the one found while chasing the others

The content hash never covered the `operators` table — every conflict the world declares. Generated Tier-3 and Tier-5 worlds reported the same hash while publishing different time encodings, and `--verify`, which CI runs, could not have seen a change to the generator's output. `content_hash.py` carried a comment saying precisely what would go wrong if a table were added without being added to its list, and then a table was.

The committed world's hash moved to `f6028eedd79e3cb5`; hashing the same bundle under the old table list still gives `54737165504f34b4`, so **the world is unchanged and every score addressed by the old hash refers to the same city.** The test that now guards it reads the bundle's own schema rather than a checked-in list, so the next table to be added fails it instead of being forgotten.

---

## P1M2 — Network generation

**Delivered:** a whole generated city — sites, quays, lines and a scored query set — behind one command. `npm run world:generate -- worlds/x.world.db --tier 3 --seed N`.

**Corrected:** three things, every one of them found by generating a world nobody had authored by hand.

### Generated from roles, not as a graph

`PHASES.md` says the generator's specification is whatever we found ourselves doing by hand. Reading the hand-built city back, it is not an arbitrary graph that happened to work — it is six structural roles, each present for a reason Phase 0 measured:

| role | why it exists |
|---|---|
| a hub with several quays | makes Site/Quay granularity real, and is the only thing that lets `A-granularity` be placed at all |
| radials through it, on alternating stands | so some transfers are free and others a walk |
| an orbital that avoids it | the only link between two arms; a real decision rather than a detour |
| a chord on operator B bypassing it | **the headroom** |
| operator B's stops a short walk from A's, in *separate Sites* | undeclared interchanges: `P0` may use them, `P1` may not |
| a low-reach regional third | a third dialect, deliberately marginal |

**Remove the fifth and headroom goes to zero**, and no scored journey on the network can reward integration. It is not a parameter; it is the reason the world exists. `undeclared_interchanges()` enumerates them rather than counting, so a generator can be checked on *which* it produced.

Coordinates use only `+ - * / sqrt` — arms point along the eight compass directions, whose unit vectors are `0`, `±1` and `±1/sqrt(2)` — and are rounded to six decimals before storage. `math.cos(math.radians(45))` would have been a platform-dependent float in a content-hashed bundle.

### The scored set, selected rather than pasted

P0M9's lesson is that a query set which cannot reward integration measures risk appetite. The criterion is `npm run headroom`, and it needs the router, and the router needs a built world. The hand-authored city resolves that cycle by pasting a list into `city.py`; a generated world cannot, because every seed would need its own paste.

So the build runs twice: once with all 900 candidates so the criterion has something to judge, once with the 200 it selected. `headroom --json` emits the classification, `select_scored` decides the mix, and the ids land beside the bundle as `<name>.scored.json`. **The criterion is not reimplemented in Python** — `CLAUDE.md` is explicit that duplicating the router to break the cycle would guarantee the two drift apart.

The mix is 70 % improvable and 30 % deliberately not. Not 100 %: *a set where every journey needs integration would not notice a solution that breaks the easy ones.*

### Three defects, and the instrument built to find one of them

**`epoch_ms` collapsed the lazy integrator** (`KNOWN-ISSUES.md` #35). `naiveDecodeTime` read every published number as epoch seconds, so nordline's departures landed 125 days out, `P2` could never board one, and it gave up on **158 of 200** journeys. `P1 − P2` came out **negative** — integrating lazily worse than not integrating — which no tier is supposed to mean.

The function contradicted its own docstring, which is what made it a bug rather than a design choice: it claims to handle *shapes* competently precisely so that `P2` degrades rather than collapses, and names the missing offset as the intended defect. Reading milliseconds as seconds is a shape failure.

> **Nothing found it for the whole of Phase 0 because the hand-built world never used `epoch_ms`.** The catalogue had always offered the value; no world had ever selected it. This is the risk `ROADMAP.md` names in as many words — *a generator will produce combinations nobody thought about* — landing on the reference solutions rather than on the world.

The aggregate could not say which conflict was responsible, and the manifest could only have supported a guess. So `npm run fallback` switches each declared conflict on alone over an otherwise clean world and counts where `P2` gives up:

```
    conflict                          fell back    over clean    P1-P2
    no conflicts                         38/200                   7.47m
    B-time-encoding:nordline            158/200         +120     -0.89m
    A-coordinate-source:nordline         66/200          +28      5.99m
    ...
```

One row at +120 against a field of +16 to +28. **A conflict that removes most of the query set has stopped being a conflict and become a wall.**

The committed world is unaffected — checked, not assumed: `m1` calibrates to 33 fallbacks and 8.37 / 5.17 / 3.20 m before and after.

**Two quays 7.1 m apart collapsed the matching tolerance.** `naiveMatchThresholdM` derives `P2`'s stop matching from the closest genuine pair, strictly below it, so it can never fuse two quays that really are different places. The generator placed tram *sites* 70 m from bus sites and then displaced both *quays* by up to 34 m in independent random directions, which sometimes cancelled nearly the whole gap — tolerance 6 m, and no operator's published position matched any other's.

Fixed by placing dependent quays relative to the **quay** they interchange with rather than to its site: the distance that matters is quay to quay, because that is the walk a player discovers and the number the tolerance comes from. `NetworkSpec.min_quay_separation_m` states the invariant and `generate_network` checks it before returning, naming the offending pair.

**Quays sat exactly on their Site centroids**, so `A-coordinate-source: site` published precisely what `quay` publishes and the audit reported MISS. The third form of `KNOWN-ISSUES.md` #30, and the one its "standing risk" paragraph predicted. A Site is a station complex and a Quay a boarding point within it; placing them identically is wrong as modelling before it is wrong as a conflict.

### What it measures

Six seeds each, against the hand-built city:

| | hand-built, 98 queries | generated, 200 queries |
|---|---|---|
| P0-P1 headroom | 7.66m, sd 10 % | **10.85m, sd 7 %** |
| P0-P2 | 4.99m, sd 15 % | 8.89m, sd 8 % |
| P1-P2 | 2.67m, sd 17 % | 1.96m, sd 11 % |
| conflict cost | 2.97m, sd 19 % | 2.07m, sd 23 % |

A generated world is at least as stable as the one every Phase 0 result was measured on, and has more headroom. **The often-quoted "31 % of its mean and conflict cost 36 %" is superseded** — it was measured at P0M9 on the 132-journey set, 88 % of which could not reward integration at all. Fixing the query set halved the scatter and doubling the traveller count halved it again, exactly as P0M9 predicted.

`P0a`'s ambiguity floor, assigned here, measures **1 % of headroom** on the generated network — below the hand-built city's 2 %, and it did not grow. The decision still waits: the case the warning was about is Site granularity over *larger* stations, `NetworkSpec` can now build those, and one city's shape is weaker evidence than it looks.

---

## P1M2 addendum — `KNOWN-ISSUES.md` #19, finished

**The entry said `resolved` and was not.** P1M1 refuted the diagnosis, fixed the instruments and added the generator rule; it never changed the world. One of #19's own bullets said so — *"the committed world understates its own tier, and by a lot"* — while its header claimed resolution. A reader asked which was true, and the header was wrong.

**What was left:** `city.py` declared staleness of 90 s on nordline and 300 s on sudbahn, both at or below the 300 s shortest announcement lead the world draws, so neither concealed anything from anybody. Both are now **900 s** — the plausibility ceiling, carrying its own stated cause, and the only value in the catalogue's `generate` list that survives the expressibility filter, so it is what a generated world of this tier now produces anyway.

**The Information family now registers a realtime conflict**, which is the question #19 exists to ask. Twelve paired seeds:

| staleness | declared | honest | effect | se | σ |
|---|---|---|---|---|---|
| 90 s / 300 s | 0.7044 | 0.7023 | −0.0020 | 0.0145 | **0.1** |
| 900 s / 900 s | 0.5545 | 0.7023 | **+0.1479** | 0.0259 | **5.7** |

The counts confirm the mechanism rather than a coincidence: in-time warnings fell 18.5 → 12.9 per run and late ones rose 2.6 → 8.2, while silent stayed at 9.4. **A stale feed converts warnings that arrive in time into warnings that arrive late** — precisely what staleness is, and nothing else in the manifest does that.

**Gates re-run, all still pass**, and the shape of the change is the interesting part:

* **Gate 3 on journey time barely moved** — 3.01m against 3.04m, still 36 % of headroom. That is not a disappointment; it is P0M8's finding holding up. Staleness costs a traveller almost no travel time, which is exactly why Gate 3 was returned to journey time and why the whole-score version was a *diluted* gate rather than a broader one.
* **Gate 3's whole-score diagnostic nearly doubled** — 0.129 to **0.245 at 6.5σ** — because the family that was contributing nothing now contributes.
* **Both reference players score lower**: naive 0.169 → 0.076, competent 0.334 → 0.256, ordering intact. The world got harder in the one family that had been decorative.
* **The journey-time calibration is byte-identical**: 8.37 / 5.17 / 3.20 m, 33 fallbacks. `P0`, `P1` and `P2` all plan on the published timetable and none reads the realtime feed, so staleness cannot reach them. It reaches `P2rt`, the Information family, and a player.

**Content hash `f6028eedd79e3cb5` → `ce3925325dbd8b0a`.** Unlike #33, this is a real change of world: scores recorded before P1M2 are not comparable on catalogue D, though the journey-time gaps happen to be identical.

**The lesson is about the record, not the code.** A status label is a claim, and this one was contradicted by the entry's own body for two milestones without anybody noticing — including the person who wrote both. When a fix has parts, the header should say which parts.

---

## P1M3 — Name generation

**Delivered:** a city that names itself, and carries every name each place goes by.

**Corrected:** the assumption that a name variant can be computed from a name.

### A variant is data, not a derivation

`publishedName` produced the colloquial form from a hard-coded table of the hand-authored city's five best-known places, falling through to the official name for everything else. On a generated city that rewrote **one name in thirty-three**, and the defect audit reported MISS outright on an operator whose stops it did not know (`KNOWN-ISSUES.md` #39).

The distinction that decides the design:

> An **abbreviation** follows from the string — "Foundry Gate" is "Foundry Gt" by rule. A **transliteration** does not. Nothing about "Central Square" yields "Tsentralna"; you have to know.

So the world carries its names. `place_names` keys every site, quay, line and operator to the forms it answers to — `official`, `colloquial`, `abbreviated`, and `former` for the places that were renamed — and the projection looks them up. Derivation survives only as a fallback for an entity with no row, which after this there are none of.

The generator pairs each stem with its local form: `("Foundry", "Lyvarna")`, `("Salt", "Solianka")`. **The pairing is the point** — the second column cannot be computed from the first, which is exactly why storing it was necessary. A test asserts no colloquial name is a substring of its official form, so a rule could not produce them.

### Names collide on purpose

A stop and the tram stop beside it are one place to anybody who catches a tram there, so they answer to the same word:

```
published names appearing on more than one operator: 17 of 42
    "Havan"       -> nordline, ostline
    "Likhtarna"   -> nordline, ostline
```

That is the clue a good player uses to find an undeclared interchange, and the trap a careless one falls into by fusing two stops that really are different places. `CORECONCEPT.md` §2.1 A asks for "a stop that two operators both name identically but which is physically two different stops"; a world where every colloquial form identified exactly one place would have a second identifier scheme rather than a naming conflict.

Official names stay unique — a city does not have two streets on the same sign — so a reused stem lands on a different descriptor: "Mill Street" and "Mill Lane" are different places that locals both call "Mlynova".

### What it measures

| | before | after |
|---|---|---|
| `A-naming` on a generated city | 1 of 33 rewritten; MISS on one operator | **33/33 and 25/25**, no MISS |
| `A-naming` on the committed city | 5 of 29 | 28/31 and 7/7 |

**And it still carries no difficulty**, which is the other half of the exit and was checked rather than assumed: `npm run calibrate` on the committed world gives 8.37 / 5.17 / 3.20 m and 33 fallbacks, identical before and after. Published names are carried by every solver and used for matching by none — the caveat `CORECONCEPT.md` §2.1 attaches to `A-naming`'s measured zero, still true.

### The bundle format changed, and now says so

`place_names` is a new table, so a bundle written before P1M3 cannot be read. Version 1 bundles previously failed with `no such table: place_names` — true, unhelpful, and three steps from the cause. `SCHEMA_VERSION` is 2 and the reader refuses anything else by name, saying which command rebuilds it.

The content-hash test added at `#33` did its job here without being touched: it reads the bundle's own schema rather than a checked-in list, so `place_names` had to be added to `TABLES` deliberately.

### And the ceiling that was on a part, not the whole

`npm run realism` caught a generated operator at **151 m against a 150 m ceiling** — `source: site`, `offset_m: 130` and `precision: 3` together, each inside its own bound and the total outside. That ceiling's stated cause is *"a station centroid published for a specific quay at a large interchange"*, which describes the composed displacement; the catalogue's `generate` list is the offset alone, and an operator publishing centroids has already spent part of the budget.

**Third instance of one pattern**, and it is now unmistakable: *a ceiling on a part, applied as though it were a ceiling on the whole.* A lat/lon swap hid subtler geometry (#29); a coarse precision rounded a small offset away (#39); a centroid and an offset spend one budget twice (#41).

The fix is a budget rather than a prediction — the displacements are vectors that partly cancel, and 35 m of centroid plus 130 m of offset measured 125 m rather than 165 m, so a rule assuming the sum would reject combinations that measure fine.

**Gates re-run rather than assumed**, because the fix changes what the generator may place:

| | before | after |
|---|---|---|
| Gate 3 | 3.04m, **28 %** of headroom | 2.39m, **22 %** |
| Gate 1b | 0.441 | 0.383 |
| ordering | null < blind < naive < competent | unchanged |

All three still pass. **The margin over the 20 % bar is two points rather than eight**, which is thin enough to say out loud: a generated Tier-3 world is now close to failing Gate 3 for want of geometry strength it cannot take without describing a broken map. That is a finding about the catalogue — the three geometry settings are far more tightly coupled than their independent `generate` lists suggest — and `#34` owns it.

---

## P1M4 — Difficulty calibration

### `route` is not optimal, and not even monotone — `KNOWN-ISSUES.md` #40

Filed at P1M2 as "a traveller beat the information-set audit's bound". The bound was sound; the router underneath it is not.

`npm run leak` gained one column — the same query routed on a day where **nothing goes wrong**, the most optimistic prediction anything can make:

```
g020  by 5.7m  (23.6m against a bound of 29.3m)  0 replan(s)  perfect-day optimum 29.3m
```

The perfect-day optimum *equals* the bound, and the player beat both. Confirmed by routing every scored journey twice: **28 of 200** queries on a generated world route *better* with disruptions applied, worst by 18.1m — and the committed world violates it too. `buildIndex` drops cancelled journeys and adds a positive delay, so a disrupted index offers a subset of options, each no earlier. Routing on it cannot win.

Four hypotheses eliminated, one instructively. The ride phase reads `best` while writing to it, in alphabetical order, so one round chains several rides for some quays and one for others — `MAX_ROUNDS` is not a transfer bound and the result is order-dependent. Reading a start-of-round snapshot is defensible on its own **and changes nothing**: 28 violations before, 28 after. It was reverted. *A correct-looking edit that perturbs every score and fixes nothing measurable is what this project has learned not to ship.*

`src/router/test/monotone.test.ts` states the property on both worlds, marked `todo` so CI stays green while the target stays visible. **Monotonicity is a usable specification for a search whose optimum nobody can independently compute** — cheap to state, cheap to check, needing no knowledge of the right answer.

It invalidates no comparison made so far: every baseline and solution goes through the same `route` and has been handicapped identically. It does mean **headroom is understated**, and every absolute journey time is an upper bound.

### Clearance became a measurement

`CLEARANCE` was `{ 0: 0.0, 1: 0.1, 2: 0.25, ... }`, chosen while `capture` normalised against the clairvoyant `P0`. The denominator moved to `P0a`, every score rescaled by about 2.6, the table did not — and every tier quietly became far harder than its number had been chosen to mean. **Nothing noticed, because a decimal cannot state its intent.**

A rung is now a position between two named reference solutions. "Beat a lazy integrator" moves with the scale on its own, and it is a claim anybody can check.

**That has a consequence worth stating.** A bar defined against reference solutions needs their scores *on that world*, which means running them — and `scoreRun` is a pure function of one run log. So `Scorecard.cleared` and `clearanceThreshold` are gone and `npm run clearance` decides it, writing a sidecar so a later scorecard can be judged without running four solutions again.

| tier | old bar | new bar | asks for |
|---|---|---|---|
| 0 | 0.00 | −0.600 | turn up |
| 1 | 0.10 | −0.139 | match a solution that reconciles nothing |
| 2 | 0.25 | 0.076 | beat a lazy integrator |
| 3 | 0.35 | 0.166 | halfway to doing the job |
| 4 | 0.40 | 0.256 | match our own worked example |
| 5 | 0.45 | 0.301 | beat it |

The comparison is **strict**, which is load-bearing: tier 2's bar *is* the lazy integrator's score, so an anchor never clears the tier it anchors — otherwise "beat a lazy integrator" would mean "be a lazy integrator". `clears()` lives beside the ladder, because a comparison operator is a rule, and rules that live in several places drift (#19, #35).

And it reports what no fixed threshold could: **which references clear which rung.** On the committed world `competent` clears tiers 0–3 and not 4 — our own answer key is a tier-3 solution here.

### Also

`node:sqlite`'s experimental warning is gone (`#8`, open since Phase 0) — `--disable-warning=ExperimentalWarning` on all 23 direct-`node` scripts and every spawned child. Two lines of noise on every instrument is two lines a reader learns to skip, and #19 hid for months in a line people had learned to skip.

### The calibration search — `KNOWN-ISSUES.md` #42

**Select the world; do not narrow the generator.**

A tier declared a *density*, the generator sampled a catalogue against it, and what came out was a distribution of difficulties rather than a difficulty. `TIER_QUOTA` fixed a tier's *composition* — every world now draws an offset, a time conflict, a cancellation setting — and did not fix strength or placement within it. `naive` still saw two Tier-3 worlds as 5.9 times their own noise apart while `competent` saw them as identical.

**Six draws over one city, screened on the sensitive reference:**

```
city seed 481516                    city seed 20260906
    497354   0.097                      20260906   0.024
    481516   0.144                      20284663   0.160
    489435   0.177                      20276744   0.168
    513192   0.190  <- median           20292582   0.207  <- median
    521111   0.232                      20268825   0.211
    505273   0.238                      20300501   0.260
```

**A tier spans 0.097 to 0.260 on one reference.** Shipping "the world for seed S" shipped a draw from that range and nothing said which — and city B's own seed scored 0.024, the *worst* of its six. The original failing comparison was an unlucky draw against a middling one.

| reference | before | after |
|---|---|---|
| `blind` | 1.2x noise | within noise |
| `naive` | **5.9x noise** | **within noise** |
| `competent` | within noise | within noise |

`naive` went from **0.119 apart to 0.022** — and the absolute gap is the part worth quoting, because it does not depend on how the noise was estimated. Three seeds gives a standard deviation from three samples, and it moved from 0.020 to 0.065 between runs of the same shape.

**Why a search rather than a tighter generator.** Both close the gap; only one keeps the variety. Extending the quota to strength buys agreement by removing choices, and `#43` already records variety is thin at the bottom of the ladder. A search leaves every conflict available at every strength and rejects only the draws that land far from the middle, so two shipped worlds may be composed quite differently and still ask the same of a solver.

**And it is a build-time search**, not the "closed loop" this project already uses for passengers bound to the player's endpoint (`CORECONCEPT.md` §370, Phase 2). Nothing about scoring changes; the MVP stays open loop. The naming collision was mine and is corrected throughout — the concept is a *calibration search*.

**The measurement moved into `@tns/scoring`** rather than being copied into the new script. That is deliberate and recent: `#19`, `#35`, `#40` and `#44` were all one rule living in more than one place, and #44 was found the same day.

### The overfitted reference, and the two-sided transfer test

**The exit's second clause needs a solution that *should* fail.**

"A solution built for one world performs comparably on the other" is satisfiable by cheating: make two worlds nearly identical and everything transfers. `PHASES.md` §284 says so in its next sentence — *not satisfied by matching conflict lists alone* — and until now nothing measured that half. Every reference solution we had generalises, so every one of them transfers by construction; a passing result therefore said nothing about the worlds.

`tuned` is the missing half. It is `competent` with its two inferences replaced by a table baked from one specific world (`npm run tune`): each operator's systematic displacement and its time encoding, read from the world's canonical data rather than detected from a feed. It knows nothing about the *day* — no disruptions, no cancellations — so it is not `cheat`. **Knowing this world's conflicts is study, not cheating**, and a student who has memorised one exam is exactly the failure mode the exit is written against.

```
    solution      home     away     change
    competent     0.441    0.441   -0.001
    tuned         0.430   -0.665   -1.096
```

Both halves hold. A solution that reasons carries across; one that memorised cal-a does not just lose its edge on cal-b, it becomes **actively harmful** — it applies a confident correction to data that does not deserve it.

**What separates the two worlds is one operator's encoding.** cal-a publishes Ostline as `local_naive`, cal-b as `epoch_ms`, and Ostline is about 40 % of the network. That is the answer key travelling badly, and it is worth noticing how *little* difference was needed: the two worlds have matching profiles on all four references and differ in a single field of a single manifest.

**The verdict matrix is the deliverable, not the row we got.** `transfers && !collapses` — the worlds too alike — is the row nothing before this could see, and it is precisely what a calibration search introduces by over-converging. The search shipped in the same milestone, so the test that can catch it shipped with it.

### And the fixture hung before it could be read — `KNOWN-ISSUES.md` #45

`tuned`'s decoder returns `NaN` on a world it was not baked for. That is deliberate and stated in `tuning.ts`: a key that noticed it was wrong and re-derived would be the generalising solution we already have. What was not deliberate is that `NaN` fails **every** comparison, including `existing.arriveS <= arriveS` — the test that made the planner's label set a shortest-path tree. Labels were rewritten on every visit, the predecessor chain gained a cycle, and reconstruction walked it forever: 21 minutes of CPU and 1.5 GB in one player process, and a transfer run that produced no verdict.

Three guards, and the third is redundant on purpose: a non-finite arrival is not relaxed, a non-finite departure is not boarded, and reconstruction keeps a visited set. **This is the second unbounded predecessor walk to hang this project** — `#44` was the first, in the naive planner — and the family is now three deep with `#40`: *a relaxation whose termination depends on an ordering property of its edge weights, with nothing checking the weights have it.*

The diagnosis is also a note about method. The hang looked like the harness, because the last one was orphaned processes holding ports; it was found by taking the model out of the server entirely and building it four ways — world A with no key, A with A's key, B with no key, B with A's key — which located it in one cell of that table in a few minutes. **A fixture built to fail must be run against the case it is built to fail on before it is wired into anything.**

### The bottom rung, and what it was hiding — `KNOWN-ISSUES.md` #43

Tier 1 is cosmetic-only. Its quota asked for two settings from section A, the catalogue held exactly two cosmetic ones, and so **every Tier-1 world was the same world** — "two worlds of a tier are different worlds of comparable difficulty" satisfied by making the first half vacuous, which is `#32` wearing different clothes.

Two settings were added at the cosmetic end: `A-route-label` (`code`, or the pair of termini, against the line's own code) and `A-headsign` (`12 inbound`, or `inbound via Linden Park`, against the bare destination). Both are things real feeds differ on; neither is read by anything that matches trips across operators, which is what makes them texture rather than difficulty.

**A third value was drafted and dropped, and it is the smaller lesson.** `code_and_name` concatenated the route id with the line name; on this project's cities both are codes, so it published `1 12`. No feed prints that. *The realism constraint applies to texture too* — it is not only about how far apart two operators may put a stop.

**The larger lesson is what adding them did.** A tier's quota counts settings, and a setting is a setting:

| tier | semantic conflicts before | after adding two cosmetic settings |
|---|---|---|
| 2 | 7.07 | **5.97** |
| 3 | 10.00 | **8.80** |

A tier quietly losing more than a whole semantic conflict per world, with every instrument still reporting the same tier number. This is `#42`'s own defect surviving inside `#42`'s fix — the quota exists to fix *composition*, and a quota that spends slots on things measured at exactly zero does not.

The fix has two halves and the second is not optional: the quota is spent on a section's semantic settings first, and each non-reference operator draws one cosmetic setting *outside* it. Ordering alone would have left tiers 2 and up with **no texture at all**, because section A's semantic pool is exactly Tier 2's quota — trading one wrong world for another.

**The property worth keeping is the invariant, not the fix:** the size of the cosmetic pool no longer affects difficulty. "Add more texture" is now a repeatable answer to a narrow rung instead of a difficulty regression waiting to be measured.

**And the tiers are now harder than every number recorded against them.** Semantic content at tiers 2–3 rose by about two conflicts per world, because the quota finally means what it declares. Re-measured on a fresh tier-3 world: all three gates pass, Gate 3 at **31 % of headroom** against P1M3's 22 %, headroom 12.12m against 10.85m, ambiguity floor unchanged at 1 %.

**Found while fixing it, and left open as `#47`:** section B holds one setting and every tier from 2 up draws it; Tier 5 draws all three of section D. Neither produces identical worlds today — their values differ substantially — but *a choice of values is a weaker guarantee than a choice of settings*, which is precisely what Tier 1 demonstrated. The structural invariant is now a test, with those two exempted by name and the exemption itself checked for staleness.

### A player that won its race could never recover — `KNOWN-ISSUES.md` #46

CI reported `never became ready after 60s. Last: health says "starting"` on the first test of a file whose three other tests passed. `startPlayer` bound the port and *then* read the brief; the harness starts the player before the control API, so a failed first ingestion is the ordinary case; and the rejection left the listener bound. `serve.ts` then retried the whole of `startPlayer` — bind included — every 50 ms against a port the first attempt was still holding, while `/v1/health` answered `starting` from the orphaned socket.

**A lost race, made permanent.** It looked like flakiness because it only happens when the player wins, which on a warm machine it never does and on a cold runner it eventually must.

The wait moved to where the failure is: inside `startPlayer`, next to the fetch, as `ingestBudgetMs`. The listener stays up and honestly reports `starting`; when the budget expires the server is closed so the next process gets a clean failure instead of inheriting a socket that answers. Two coupled budgets in two files — one of which needed a comment explaining it had to exceed the other — became one.

`#27` was the same shape and was fixed by raising both budgets. **A budget makes a lost race rarer without making it recoverable.** Nothing caught either, because no test had ever started a player before its simulator; one now does, and against the old code it does not merely fail — it hangs, which is the CI symptom reproduced in a second and a half.

---

## Phase 1 — closed

**Closed 2026-09-07.** Five milestones, and the phase exit met on a calibrated pair: two independently generated worlds at the same declared tier produce matching difficulty profiles, a solution that reasons carries across them, and one that memorised either collapses on the other.

### What Phase 1 delivered

* **A generator, end to end.** `npm run world:generate` builds a city — sites, quays, lines, patterns, journeys — draws each operator's conflicts from the catalogue against a requested tier, generates the names and the several forms each place goes by, and selects a scored query set on the network rather than pasting one in.
* **One catalogue, three consumers**, drift-checked in CI, where P1M1 found three copies that had already diverged.
* **A calibration search** (`npm run calibrate:tier`), because a tier declares a *distribution* of difficulties and shipping "the world for seed S" ships an unnamed draw from it.
* **Difficulty as a profile** over the reference solutions rather than a scalar, because which conflicts bite is a property of the (world, solver) pair.
* **A clearance ladder stated in references, not decimals** — "beat a lazy integrator", so a bar survives a change of denominator.
* **Two solutions that must disagree** (`npm run transfer`), of which the interesting one is built to fail.
* **Fifteen instruments that take a world path**, so every one of them runs against every generated world rather than as a release check.

### What Phase 1 actually taught

**Every one of these was found by generating a world nobody had authored**, which is the phase's own argument for itself:

1. **A ceiling on a part is not a ceiling on the whole** — three geometry conflicts, each inside its own limit, publishing stops 2,200 km from their quays (#29 → #39 → #41).
2. **A conflict must be one the operator can express**, and "declared and absent" is a world quietly easier than its tier claims (#30).
3. **Two things that must agree, in different places, compared by nothing** — five instances: `noticeLeadS` against `D-staleness` (#19), one decode written four times (#35, #44), the tier written against the tier read (#36), a ceiling on a part against the whole (#41).
4. **A test that cannot fail is not a test, and the tell is an evidence line whose value never changes** (#19, #28).
5. **A relaxation whose termination depends on an ordering property of its edge weights must check for it** — three hangs and one non-optimal search (#40, #44, #45).
6. **A budget makes a lost race rarer without making it recoverable** (#27 → #46).
7. **A quota that counts settings does not fix composition when some settings measure zero** (#42 → #43), which is the phase's last finding and the one most likely to recur: *the fix for a defect can carry the defect.*

### The exit, and what it does not say

`PHASES.md` §284, as amended twice during P1M4: matching **difficulty profiles** rather than three gaps, and the single-solution clause read as two opposite predictions. Measured on cal-a and cal-b: `competent` 0.441 → 0.441, `tuned` 0.430 → −0.665.

**It is one pair, one tier, two seeds.** The separation is not plausibly noise, but the ladder is six rungs and this tested one of them. Coverage is carried into Phase 2 rather than claimed here — as is the fact that **every difficulty figure recorded during Phase 1 predates its last change to the generator**, which raised semantic content at tiers 2–3 by about two conflicts per world.

### The Phase 1 milestone plans, as the roadmap carried them

Kept for the same reason Phase 0's were: several of them record a decision whose reasoning is more useful than its outcome, and three record an exit clause that moved.

**Goal:** produce worlds instead of hand-authoring them — for the content that actually carries difficulty, and no other.

**Phase exit** (`docs/PHASES.md`): two independently generated worlds at the same declared tier produce matching gaps within tolerance, and a solution built for one performs comparably on the other.

---

#### P1M0 — Evidence before generation — **part B done, part A outstanding**

> *Part A was still outstanding when Phase 1 closed, and is now scheduled as **P2M4**, the last milestone of Phase 2 — see `KNOWN-ISSUES.md` #3. An item that needs a person does not get done by being listed for a whole phase.*

**A. External playtest.** Give the committed world to one or two engineers who have not seen the repository. Watch. Record where they stall, what they assume, how long before their first scoring run, and what they say about it afterwards. [`docs/PLAYTEST-KIT.md`](docs/PLAYTEST-KIT.md) is the runnable form; `KNOWN-ISSUES.md` #3 is the standing debt.

**B. Conflict-depth probe.** ✅ `npm run probe`, seed-averaged, with plausibility ceilings on every setting.

*This milestone justified itself.* Scoped as two cheap experiments, it invalidated a phase exit and cost four milestones to repair. Part A is still owed, and no instrument replaces it — a quest asks *can you find X, having been told X exists*; a playtest asks *can you work out that X exists at all*.

---

#### P1M1 — Projection generation — **delivered, exit met**

Per-operator manifests sampled from the §2.1 catalogue, parameterised by tier. The manifest shape already exists and is declarative, so this generates configuration rather than inventing a mechanism.

**Delivered:**

* ✅ **One catalogue, three consumers.** `src/schema/src/catalogue.ts` replaces the three drifted copies in `build.py`, `probe.ts` and the generator; emitted to `contract/catalogue.json`, CI drift-checked, read by `tools/worldbuild/catalogue.py`.
* ✅ **The generator.** `tools/worldbuild/generate.py`; `python -m worldbuild <path> --tier N`. Placement weighted by reach, values only from `generate`, the least-reaching operator left honest as a reference.
* ✅ **Two rules the first generated worlds forced.** A conflict may not be generated beside one it masks (`excludes`), and may not be placed on an operator that cannot express it (`REQUIRES`). Both were found by auditing generated worlds — `KNOWN-ISSUES.md` #29, #30.
* ✅ **`npm run realism`.** Composed published geometry against the plausibility ceiling, measured on the world, because per-setting ceilings cannot see a total.
* ✅ **`docs_url` served** (`KNOWN-ISSUES.md` #11), accurate only, generated from each operator's own manifest. The rule for what an operator documents is in `CORECONCEPT.md` §2.1 F: format and units yes, accuracy and freshness no.
* ✅ **Every tier audits clean.** Tiers 0–5 generate worlds whose defect audit reports no MISS, whose composed geometry is plausible, and whose identifiability audit passes.

* ✅ **`KNOWN-ISSUES.md` #19, resolved — the premise was wrong.** All four candidate Information formulas were implemented and measured; none could distinguish the declared world from an honest one, because the committed world's staleness settings sit *below* its own shortest announcement lead and conceal nothing. On a world where staleness is at the ceiling the *current* formula moves by 0.2173 at 8.1σ. The disruption policy moved into `@tns/schema` so the generator compares against one number rather than two copies.
* ✅ **Six defects fixed, with regression cover** — `KNOWN-ISSUES.md` #28–#33. Five were found by auditing generated worlds; the sixth (#33, the content hash omitting the `operators` table) turned up while chasing one of the others.

**Three decisions taken 2026-09-05, all recorded rather than implemented:**

* **The Information formula does not change**, and `SCORING.md`'s item keeps its OPEN label. The candidates differ by less than one σ; there is no evidence for a change, and the question of what the family should weigh is still undecided.
* **The `P0a` ambiguity floor holds at "publish it, subtract nothing"**, and is **reassigned to P1M2** — the scenario that motivated the warning is a property of the network, and P1M2 is what generates networks.
* ~~**`D-staleness`'s value range needs deriving from the world**~~ — `KNOWN-ISSUES.md` #34. **Done at P1M4.** The share a lag conceals is `(s − lo) / (hi − lo)` against `noticeLeadS`, which is an identity rather than a fit and *inverts*: choose the shares, solve for the setting. `generate` is now `[450, 600, 900]`, all three rungs doing something where two of the old three did nothing.

**What Phase 0 established that this must honour:**

* **Placement matters more than strength.** Moving the same fifteen conflicts onto the operator that carries the network doubled their cost, at identical settings. A generator must weight placement by carried traffic — Sudbahn expressed nothing at any strength because it reaches nine line-stops of fifty-eight.
* **Every setting has a plausibility ceiling** with a stated real-world cause, enforced by tests. A coordinate offset past ~150 m is a broken map rather than a disagreement, and no generated world may go there.
* **Cosmetic and semantic are labelled** (`CORECONCEPT.md` §2.1). A generator sampling the catalogue uniformly would spend most of its effort on texture.

Also serves each operator's `docs_url`, currently advertised and unserved (`KNOWN-ISSUES.md` #11). **Accurate documentation only** — defects wait for Phase 3 and for something able to measure them.

**Assigned here — two scoring corrections that generation would otherwise inherit:**

* **`KNOWN-ISSUES.md` #19 — the Information family registers realtime failures and does not score them.** Ten silent cancellations move the score by 0.001, because the timeliness term has a floor of 0.5 and recall is diluted by the events a conflict does not touch. Catalogue D cannot be validated in a generated world until this is fixed, and `SCORING.md` carries four candidate directions.
* ~~**`SCORING.md` — `P0a` has an ambiguity floor under it.**~~ **Reassigned to P1M2 on 2026-09-05.** Measured on generated worlds at every tier the floor is 1 %, *below* the hand-built world's 2 %, and does not grow with tier — the ambiguity comes from `A-granularity`, which the generator will not place on an operator with no station to collapse. The scenario the warning was about is a property of the *network*, so the decision waits for generated networks.

**Exit:** generated manifests produce worlds whose defect audit passes, whose identifiability audit and symptom check pass, and whose ablation profile falls within the band their declared tier targets; every operator serves documentation matching its own behaviour; and a realtime conflict moves the Information family.

**One exit clause was carried to P1M4 and has since been met there.** At the time, tiers 3 and 4 generated byte-identical manifests (`KNOWN-ISSUES.md` #32) — placement saturated and the density lever had nothing left to buy, so no tier *band* could separate worlds that were the same world. P1M4 fixed it without touching the tier ladder: deriving `D-staleness`'s range from the world's own announcement lead (`#34`) gave that setting three usable rungs where it had one, and every tier now differs. Whether they differ by the *right* amount is what `npm run profile` and `npm run calibrate:tier` answer.

---

#### P1M2 — Network generation — **delivered, exit met**

Routes, patterns, journeys and calendars over an existing city graph — efficient, inefficient, congested, poorly coordinated. Includes generating the demand table and the scored query set.

`npm run world:generate -- worlds/scratch/x.world.db --tier 3 --seed N` builds a whole city: sites, quays, lines, and a scored query set selected by the headroom criterion.

**Generated from the structural roles, not as an arbitrary graph.** `PHASES.md` says the generator's specification is whatever we found ourselves doing by hand, and the hand-built city turned out to be six roles each present for a measured reason — a hub with several quays, radials through it on alternating stands, and — **on a second operator, not the first** — the ring and the chords that connect the ends without passing through the centre, whose stops sit a short walk from the first operator's in **separate Sites**. Those undeclared interchanges are the headroom; remove them and it goes to zero. A low-reach regional third completes it. Giving the ring to the radial operator is what caused `KNOWN-ISSUES.md` #38.

**Results against the hand-built city**, six seeds each:

| | hand-built, 98 queries | generated, 200 queries |
|---|---|---|
| P0-P1 headroom | 7.66m, sd 10 % | **10.85m, sd 7 %** |
| P0-P2 | 4.99m, sd 15 % | 8.89m, sd 8 % |
| P1-P2 | 2.67m, sd 17 % | 1.96m, sd 11 % |
| conflict cost | 2.97m, sd 19 % | 2.07m, sd 23 % |
| journeys integration can improve | — | **140 of 200 (70 %)** |
| defect audit / realism / identifiability | pass | pass |

**Three defects found, all by generating a world nobody had authored:**

* `KNOWN-ISSUES.md` #35 — the lazy integrator read `epoch_ms` as epoch seconds and *collapsed*, giving up on 158 of 200 journeys and making `P1 − P2` negative. The catalogue had always offered that value; no hand-built world had ever selected it. `npm run fallback` exists because the aggregate could not say which conflict was responsible.
* Quays placed with independent random offsets drifted to **7.1 m** apart, which collapsed `naiveMatchThresholdM` to 6 m — at which point no operator's published position matched any other's. `NetworkSpec.min_quay_separation_m` now states the invariant and the generator checks it.
* Quays sat exactly on their Site centroids, so `A-coordinate-source: site` published what `quay` publishes and the audit reported MISS — the third form of #30, the one its "standing risk" paragraph predicted.

**The query set is not a by-product, and Phase 0 learned this expensively.** P0M9 generated 132 journeys by taking every Site pair 1500 m apart, and on 88 % of them the restricted and unrestricted transfer graphs gave the same answer — nothing for integration to win, and every extra leg a player took was exposure to a cancellation nobody had announced. The competent reference solution scored *below the naive one* for that reason alone, and it took two milestones to find out why (`KNOWN-ISSUES.md` #26).

* **A scored journey must be able to reward integration.** `npm run headroom` is the criterion, and it is deliberately structural — routing on the unrestricted transfer graph against the restricted one — because a criterion involving disruptions would make the scored set depend on which day was drawn.
* **Keep some straightforward journeys.** A set where every journey needs integration would not notice a solution that breaks the easy ones.
* **Do not fix a risk-heavy query set by removing the risk.** Lowering the cancellation rate or the planning lead would make such journeys survivable and delete the thing that makes realtime integration worth anything.

**`SCORING.md`, `P0a`'s ambiguity floor — measured, still not decided.** On the generated network it is **1 % of headroom across the scored population** (0.06m of 10.85m), the same as on generated worlds over the hand-built city and below its 2 %. The case the warning was about — Site granularity over larger stations — did not appear, because the generator will not place `A-granularity` on an operator with no station to collapse. **The decision stays open**: one generated city's shape is weaker evidence than it looks, and `NetworkSpec` can now build cities with larger interchanges, which is the case worth testing before subtracting anything. Re-measured at P1M4 on a **calibrated** world (`cal-a`, tier 3): unchanged at **1 % across the scored population**, 0.10m against a 7 % single-traveller worst case, from one ambiguous group of two hub quays 55 m apart.

**Three measurements now agree and none of them is the one that matters.** Every city measured so far has a small hub, so the floor has never been given the chance to be large. `NetworkSpec.hub_quays` is the lever, and the honest test is a deliberately built city with a large interchange published at Site granularity — not another draw from the same distribution. **Owned by whoever needs the decision**: it blocks nothing today, and the options in `SCORING.md` are unchanged.

**Original assignment, 2026-09-05 —** `capture` normalises against `P0a`, which routes on the canonical world and so knows which platform its train uses when no player can. Measured at 1 % on every generated world and 2 % on the hand-built one, and it does not grow with tier — but the case the warning was about is Site granularity over *larger stations*, and station size is a property of the network. Re-measure with `npm run identifiability` once generated networks exist, then choose between subtracting the floor and continuing to publish it beside capture. The warning that keeps it undecided still stands: subtracting means a player scores *better* on a world whose ambiguity is *worse*.

**Exit — met.** A generated network produces headroom comparable to the hand-authored one (10.85m against 7.66m); 70 % of scored journeys can be improved by integration and 30 % deliberately cannot; and the three gaps are stable across seeds within a stated tolerance.

**The tolerance, stated.** Each of the three gaps has a seed-to-seed standard deviation under 12 % of its mean, against 10-17 % for the hand-authored city — so a generated world is at least as stable as the one every Phase 0 result was measured on. That is the bar this milestone can honestly set, and it is deliberately expressed as a *comparison* rather than a round number: picking a threshold that the current measurement happens to clear is choosing the answer first.

**The bar that matters is P1M4's, and it is a different quantity.** What P1M4 needs is not that one world is stable but that *two* worlds can be told apart — or shown to match. With six seeds a gap's standard error is `sd/√6`, about 3 % of its mean here, so a 10 % difference between two worlds is a three-sigma result. **That is the number to ratify when P1M4 states how close "matching" has to be**, and it is a property of the seed count as much as of the city.

That last clause is a prerequisite for P1M4 rather than a nicety. Phase 0 measured the alternative: with only the disruptions changing, headroom had a standard deviation of 31 % of its mean. **A single calibration is a draw from a distribution, not a measurement of a city.**

---

#### P1M3 — Name generation — **delivered, exit met**

`tools/worldbuild/names.py` generates a city's names and the several forms each
place goes by; the world carries them in `place_names` and the projection looks
them up. Bundle schema version 2.

| | before | after |
|---|---|---|
| `A-naming` on a generated city | **1 of 33** names rewritten, MISS on one operator | **33/33 and 25/25**, no MISS |
| `A-naming` on the committed city | 5 of 29 | 28/31 and 7/7 |
| published names shared across operators | — | **17 of 42** |

**Exit — met.** Naming variants survive the defect audit on both the committed
and a generated world, and the tier ladder does not depend on them: `npm run
calibrate` on the committed world gives 8.37 / 5.17 / 3.20 m and 33 fallbacks,
identical before and after, because published names are carried by every solver
and used for matching by none.

**A generated world still passes all three gates**, re-run after the geometry
budget of `KNOWN-ISSUES.md` #41 — 1a solvable, 1b 0.383, 2 in the right order,
3 at **22 %** of headroom. That margin fell from 28 % and two points over the
bar is thin. `#41` records why: the three geometry settings share one 150 m
budget and are far more tightly coupled than their independent `generate` lists
suggest, so the ladder has less room there than it appears to. Deriving that
range the way `#34` derived staleness's needs the *measured* route rather than a
closed form, and is not done.

**What the milestone turned out to be.**

It was scoped as cosmetic and it was not. `#39` found `publishedName` deriving
the colloquial variant from a hard-coded lookup of the hand-authored city's five
best-known places; on a generated city that rewrote **one name in thirty-three**
and the defect audit reported MISS outright on an operator whose stops it did
not know. *A lookup of one city's names is that city's phrasebook.*

The requirement that followed is the one the delivery above satisfies: **a
generated city must carry its own names and its own variants of them.** An
abbreviation follows from the official name by rule; a transliteration does not,
so the variants are data in the bundle rather than a function in the projection.

**Reclassified at P0M10, and still true:** naming is *cosmetic*
(`CORECONCEPT.md` §2.1). It measured exactly zero on every operator at every
setting. It must exist — a world where every operator spells a place identically
is not recognisable as the real problem — and it must not be relied on to carry
difficulty.

The honest caveat recorded with that reclassification survived the milestone:
the measured zero is partly a property of the instrument, since every solver
carries published names and none matches on them. That is also why the committed
world calibrates identically before and after.

---

#### P1M4 — Difficulty calibration — **exit met on one calibrated pair; coverage outstanding**

The tier ladder becomes real: generate to a requested tier, and verify. This is the phase exit.

**Assigned here — the three questions about what a declared difficulty even means. All three are answered, and every exit clause is now measured on one calibrated tier-3 pair. What is outstanding is coverage — other tiers, more seeds — rather than method.**

* ✅ **`KNOWN-ISSUES.md` #24 — difficulty is a property of the (world, solver) pair** — *resolved 2026-09-06*. Declared as a **profile** over the reference solutions rather than a scalar, and `npm run profile` measures it. The case for the vector is visible on the committed world: `blind` and `naive` have identical capture and information scores 0.605 apart, which one number cannot express.
* ✅ **`KNOWN-ISSUES.md` #34 — a conflict's settings are chosen without reference to the world** — *resolved 2026-09-06*. `D-staleness` offered `[60, 300, 900]` and two of the three concealed nothing against a shortest announcement lead of 300 s. The rung is now stated in **effect space** and solved backwards, giving `[450, 600, 900]`; a test re-derives the list and fails if `noticeLeadS` moves without it. The *method* generalises; the closed form does not, and `C-coordinate-offset` will need the measured route instead.
* ✅ **`SCORING.md` — tier clearance thresholds** — *settled 2026-09-06*. `CLEARANCE_LADDER` states each rung as a position between named reference solutions; `npm run clearance` decides it, because a bar defined that way needs their scores on that world and `scoreRun` cannot know them. The comparison is strict, so an anchor never clears its own rung. On the committed world `competent` clears tiers 0–3 and not 4.

  *Why it needed fixing:* `CLEARANCE` was chosen while capture normalised against clairvoyant `P0`. The denominator moved to `P0a`, every score rescaled by about 2.6, and the table did not — so every tier quietly became far harder to clear than its number had been chosen to mean, and nothing noticed, because a decimal cannot state its intent.

**Exit:** two independently generated worlds at the same declared tier produce matching difficulty *profiles* within a stated tolerance, **and a solution built for one performs comparably on the other**; and every tier's clearance bar is expressed in terms that survive a change of scale.

**Status 2026-09-06 — all four clauses met, on one calibrated pair. Read the caveats below the table.**

* ✅ **Difficulty is a profile, not a scalar** (`#24`). `npm run profile` reports what each reference solution achieves, as a vector. The tolerance is the world's own seed-to-seed spread, measured from the same runs rather than assumed — a threshold nobody has measured is a guess.
* ✅ **The clearance bar survives a change of scale** (`SCORING.md`), as a position between named reference solutions rather than a decimal.
* ✅ **Two same-tier worlds match, once calibrated** (`#42`). `npm run calibrate:tier` draws several conflict sets over one fixed city and ships the one nearest the generator's median, so a tier's difficulty is the generator's central tendency rather than whichever seed came first. All four references agree within noise, and `naive` went from **0.119 apart to 0.022**.

  **Uncalibrated worlds still vary, and that is the finding rather than a side effect:** a tier spans 0.097 to 0.260 on one reference, so shipping "the world for seed S" ships a draw from that range. `npm run world:generate` alone does not calibrate.
* ✅ **Non-memorisable** (`PHASES.md` §284), *measured 2026-09-06*. `npm run transfer` runs two solutions that should behave in opposite ways across the same pair of worlds:

  ```
      solution      home     away     change
      competent     0.441    0.441   -0.001
      tuned         0.430   -0.665   -1.096
  ```

  A solution that reasons carries across intact; one that memorised cal-a's answer key does not merely lose its edge on cal-b, it goes **actively harmful**. `PHASES.md` §284 states the requirement as *"non-memorisable tasks of equal difficulty — and it is not satisfied by matching conflict lists alone"*, which the shorthand "a solution built for one performs comparably on the other" loses half of; this measures both halves.

  **Two worlds of a tier must not hold the same conflicts.** Variety is the point of the generator, and the transfer test is not a request to give it up — it is a question about *which kind of solution* transfers:

  | solution | should it transfer? | what it proves if it does |
  |---|---|---|
  | one that **generalises** — infers encodings, matches by consensus, discovers interchanges | **yes** | the worlds are equally hard |
  | one **tuned to world A** — hard-codes that world's operators, encodings and offsets | **no** | if it does, A's specifics never mattered and the world is memorisable |

  Only the first is written into the clause today, and on its own it is satisfiable by making the worlds too alike — which is the failure `PHASES.md` names when it says matching conflict lists is not enough. **Both halves need measuring, and the second needs a reference solution we do not have:** a deliberately overfitted one, written against a specific world, that *should* collapse on another.

The second clause of the first sentence is the one that matters and the harder of the two. Matching numbers say the worlds are equally hard *in aggregate*; a solution transferring says they are hard *in the same way*. Only the second supports the assessment use case — and it is now measured rather than assumed.

**What the transfer result does not say.**

* **Two seeds, one pair of worlds, one tier.** The separation is large enough that noise is not a plausible explanation — `tuned` moves 1.096 where `competent` moves 0.001 — but a single pair at tier 3 is not the ladder. Re-run on tier 1 and tier 5 pairs before the claim is general, and note that tier 1 could not have been tested at all until `#43` was fixed — it produced one world.
* **`competent` moving 0.001 is tighter than the world's own seed-to-seed noise**, which `#42` measured at roughly 0.02–0.065 on `naive`. That is the calibration search working as designed rather than a suspiciously good result, but it is a *mean over two seeds* and should not be quoted as a precision.
* **`tuned` scores 0.430 at home against `competent`'s 0.441.** An exact answer key should be at least as good as an inferred one; the eleven-thousandths gap is inside the noise, and the plausible cause is that baked geometry corrects every operator to the truth while inference corrects them to a *consensus frame* the rest of the model was built against. Worth knowing before reading anything into a `tuned` home score.
* **The fixture had to be made safe before it could be read.** `tuned`'s decoder returns `NaN` on a world it was not baked for, deliberately, and `NaN` fails the comparison that kept the planner's label set acyclic — the first transfer run hung for 21 minutes and produced nothing (`KNOWN-ISSUES.md` #45).


---

## P2M0 — The numbers, before the world starts moving

### `route` was never broken — the property it was accused of violating is not true of transit

`KNOWN-ISSUES.md` #40 stood open for the whole of Phase 1, holding that the router was not optimal and that *every number this project produces goes through it*. The evidence was a test: adding disruptions improved 28 of 200 journeys, which no optimal search can do, because *a disruption can only remove a journey or delay it*.

**The second half of that sentence does not follow from the first.** Delaying a service moves its departure later, and a later departure is one a slightly late traveller can catch. The violation, in full:

```
clean:      ... walk to q-w1, arriving 47266
            ride line-12-outbound-029, departing 47988  -> 24.4m
disrupted:  ... walk to q-w1, arriving 47266
            ride line-12-outbound-028, departing 47388  -> 14.4m

  line-12-outbound-028: scheduled 46800, delayed +300
```

`028` leaves q-w1 at 47088 on a clean day and the traveller arrives at 47266 — missed by three minutes. Five minutes late, it is still standing there. **The held connection that saves a real passenger, reproduced faithfully by a search accused of being broken because of it.**

Separating the kinds settles it. Cancellations alone improve **0 of 98** journeys on the committed world and **0 of 200** on a generated one, while making 7 and 21 of them worse — so removal-monotonicity holds exactly, and the check has something to detect. Delays alone improve 14 and 32.

### The same premise had been written into a bound

`information-set.ts` said it in as many words: *"Reality only ever adds delay and cancellation — it never makes a journey quicker than planned."* True of one journey, false of the set of itineraries a traveller can choose between. Compared against the optimum on the day that actually happened — a floor under anything anyone can realise — the bound sat **above an achievable outcome on 12 of 98 journeys on the committed world and 30 of 200 on a generated one**. Every one of them would have been flagged for luck by an audit whose own comment reads *"a bound that flags honest players is worse than no bound."*

The bound now takes **every delay** and only the cancellations the player could have known. Sound, and the fix is not free: a bound planning over a superset of the day's options is by construction weaker than the `P0` quarantine the scorecard already applies, so **the time comparison stopped being the leak detector**. The blind-hit statistic is — which the module's own note had already worked out, having found time comparisons "too permissive to catch anything". `cheat` is still caught, by *never once boarding a service it could not have known was cancelled where an optimal planner would have done so six times*, and the test now asserts that mechanism by name rather than the message the old bound used to produce.

### One real gap, and it was somewhere else entirely

The walk phase relaxed only from quays the ride phase had just improved, so a two-link transfer needed a ride between its halves — and `MAX_ROUNDS` is a budget of rides, not walks. Chaining walks to a fixpoint changes **2 of 596** query-policy pairs across both worlds and improves both, one by 3.1 minutes. Small, and it is the only demonstrated gap between this search and an optimal one, so it is closed rather than recorded.

### What it cost, and the shape of the mistake

An issue open across five milestones, a `todo` test standing as a monument to it, a warning in `CLAUDE.md`, a risk in the roadmap, and a sentence in every summary of the project's standing saying *headroom is understated*. All of it from one plausible sentence nobody measured.

This project's recurring failure has a name — *a right number compared against the wrong thing* — and #19 and #28 were its previous form: **tests that could not fail**. This is the opposite and it is worth naming separately: **a test that could not pass**, asserting a property the world does not have. The tell is the same in both directions: an assertion whose truth was argued rather than measured, in an area where the arguing is easy and the measuring is cheap.


---

## P1M5 — The ladder becomes data

**Six tables, one list.** `TIER_SECTIONS`, `TIER_QUOTA` and `TIER_COSMETIC_ONLY` in the schema, `CLEARANCE_LADDER` next door, `TIER_DENSITY` in Python, and four `range(6)` loops in the tests — each keyed by the literals 0-5, each edited by hand, and between them they decided what a tier *was*.

They are now views over `LADDER`, an ordered list of rungs, and the contract emits the list rather than the tables derived from it. The claim that this was worth doing is testable, so it is tested: a rung is inserted into a copy of the ladder and every view has to follow.

**The view most likely to be left behind is the one that reports indices rather than being keyed by them.** `cosmeticOnlyTiers` returns `[1]`, and an insertion *below* tier 1 must make it return `[2]`. A test that only ever inserts above the interesting rung would pass on a table that had been forgotten, so there is a second test that inserts below it.

### An id is what travels; a number is what moves

The numbering is expected to change — six rungs may become nine when intermediate ones are wanted — and a scorecard recorded against "tier 4" is uninterpretable afterwards if tier 4 has become tier 6. So every rung carries a stable id, and every bundle records `rung_id` and `ladder_version` beside the numeric tier.

Without it this would be `KNOWN-ISSUES.md` #20 in a third place. The project has already shipped two numbers that outlived the scale they were ratified against: the clearance table when `capture`'s denominator moved, and Gate 3's threshold when its metric changed. Both were found late, by someone noticing the number no longer meant anything.

### The proof a refactor owes

A change of form must not be a change of content, and "I only moved the tables" is exactly the claim that turns out to be false. So it was measured: every tier's generated operator manifests, at four seeds, dumped from this branch and from a clean `git worktree` of `HEAD`. **Byte-identical, 24 combinations.**

The committed world's content hash *did* change — `86bf3d8cb4e0a7a5` → `7753357f4980b584` — because two rows were added to the `manifest` table, which is hashed. That is the intended change and the only one; `--verify` passes on the rebuilt bundle.

**The rung ids name the worlds they intend**, not the conflicts they currently draw: `clean`, `small-town`, `metro-town`, `metro-city`, `towns-and-rail`, `region`. `P1M6` gives them those structures, so it fills the rungs in rather than renaming them — which would defeat the point of an id on its first outing.


---

## P1M8 — Re-measure, and what the measurements decided

**The milestone that was supposed to confirm the ladder found three things wrong with it**, which is what a re-measurement is for.

### The clearance ladder needed nothing

Every rung calibrated and profiled, then each bar computed from the references' own scores on its own world:

```
rung  bar      competent  clears?
1     0.079     0.573     yes
2     0.347     0.589     yes
3     0.331     0.443     yes
4     0.277     0.277     no     <- an anchor never clears its own rung
5     0.416     0.352     no     <- the top must sit above our answer key
```

**No re-derivation, no edit, nothing.** P1M4 stated the bars as positions between named reference solutions precisely so they would survive a change of scale, and they survived worlds that did not exist when they were written. It is the only part of this milestone that needed no work at all.

### The ladder was not ordered at the top

`competent` read 0.573, 0.589, 0.443, 0.277 and then **0.352** — the top rung 0.075 *easier* than the one below it, at about two and a half sigma, on two references independently.

The cause is that **the quota is per operator**. The old top rung had six operators against five and a lower reach cap, so the same quota spread further: each feed about as bad, no feed carrying as much, and a bigger network offering more ways round any of them. *Difficulty is roughly how bad a typical feed is, times how much of the network it carries* — and that rung raised the first while lowering the second.

The rungs merged. What the top one was *for* — a region of towns rather than one city — was never a step of difficulty; it was a **kind of place**, and it became a shape with three ways of joining the towns up.

### Gate 3 was measuring something else — and so was I

Four of six worlds failed a gate, and at the top the conflict cost came out **negative** — the conflicted world 11.8 minutes *better* for a lazy integrator than an honest one.

I wrote at the time: *that is real.* Honest data gives a lazy reader more rope, it matches stops, plans ambitious multi-operator journeys with tight transfers, and reality takes them apart; conflicted data forces fewer legs, and those survive. It is consistent with `#14` and `#26`, it explains the sign, and **it was an explanation of an artefact.**

The "honest values" world Gate 3 subtracted was not honest. `ablate` built it with `withNoConflicts`, which kept every conflict its stale copy of the catalogue did not recognise — on this rung, `B-dst-offset` on three of four dirty operators, every departure published an hour out (`KNOWN-ISSUES.md` #55). Corrected, the same world reads:

```
  lazy shortfall vs a matched optimum   54.02m       (unchanged)
  the same, conflicts off              ~65.8m -> 2.16m
  caused by conflicts                 -11.78m -> +51.86m
```

**The sign was never in the world.** What made the story easy to believe is that it was a good story: a surprising number, a mechanism that made it unsurprising, and no one asking the instrument what it had actually compared. The rule this project already had — *when you add a measurement, check both sides for matched information and a matched opportunity set* — was applied to the entity set and not to the thing being subtracted.

### The guard was written against the wrong number, twice over

Gate 3 prints two conflict costs. The whole-score one is positive at every rung; the journey-time one — the criterion ratified after P1M0 — went negative. The first version of the guard tested the whole-score figure and would never have fired, which I caught in review and recorded as `#20`'s mistake avoided.

**The correction was right and the diagnosis was not.** I recorded the two figures as *both true, and about different things*. They were one correct number and one wrong one: the whole-score figure is computed from `valueCleanWorld`, which is catalogue-derived and was sound throughout, and the journey-time figure from `withNoConflicts`, which was not. **The disagreement in sign was the symptom, and I read it as a finding.** Two instruments differing about the same world is a defect until proven otherwise.

### What the corrected numbers say instead

`towns-and-rail` passes all three gates and is unplayable: `competent` captures 0.099 against its own 0.277 clearance bar, the lazy integrator −5.672, and the conflicts cost 476 % of the headroom. Gate 3 asks for *at least* 20 % and asks for at most nothing, so a wall passes it — `#56`, open.

Every gate figure in this milestone was measured with the broken floor and is owed again on the merged ladder.

### What it cost to find out

Six calibrations, seventy-two profile runs and six gate sweeps, most of an afternoon of compute — and then most of them invalidated by a defect in an instrument they all shared. The compute was not the expensive part. **A measurement nobody can cross-check is worth what the story told about it is worth**, and this milestone spent a day on a mechanism for a number that was not there.

---

## P1M8, continued — what the corrected instruments then said

*Two defects, `#55` and `#56`, found by following the first one's consequences.*

### The catalogue had a fourth consumer

`CLAUDE.md` had carried the rule since P1M1 — *one source of truth for three consumers; add a setting there, never in the probe or the builder.* The ablation instruments were a fourth, holding a hand-written map of twelve conflicts against the catalogue's sixteen, and switching off a conflict it had never heard of was written `?? out`: **keep the world as it is.**

So "a clean world plus one conflict" meant "four conflicts plus one", every row of `npm run fallback` landed on one figure to two decimal places, and a **cosmetic** setting appeared to cost nine minutes. The tell was `A-naming` — established by measurement at P0M10 as costing exactly zero — reporting the same 9.22m as a realtime conflict on a different operator. **An evidence line whose value never changes**, which is the same tell as P1M1's two dead audit checks and is now the third time it has been the tell.

Corrected, the instrument answers in one word: **`B-dst-offset`**. Three rows carry the whole collapse, nothing else exceeds five fallbacks in two hundred, and **the sign of the offset decides how bad it is** — an hour early puts departures in the past and no plan exists; an hour late leaves a plannable itinerary that is merely wrong. Every cosmetic row reads exactly zero, which is the control group working.

Nothing caught it because **every committed bundle predates the four settings**. A test that read one would have passed on all of them; the tests written for it are driven from `CATALOGUE` instead.

### A wall passed every gate

With the floor corrected, `towns-and-rail` passes 1a, 1b, 2 and 3 — and a lazy integrator on it captures **−5.672**, losing more than five times the entire reachable headroom by attempting to integrate. Gate 3 asked the conflicts to cost *at least* 20 % of the headroom and asked for at most nothing; these cost 488 %.

**Gate 1b is now two-sided.** `P2rt` must capture at least −1: the point where `P2rt − P1` equals `P1 − P0a`, so *integrating lazily loses exactly as much as integrating perfectly would have won*. A position rather than a decimal, which is the form P1M4 argued for and the form that survives a change of scale.

Three places it deliberately did not go, and the reasons are the useful part:

* **Not a ceiling on Gate 3**, though numerically almost the same test. 488 % is a *correct* answer to the question Gate 3 asks. A gate reporting FAIL for both "the conflicts are decorative" and "the conflicts are a wall" carries two verdicts on one line, and `#53` is the record of what that costs.
* **Not the clearance ladder**, which was the first candidate and is the one that reads best in a sentence — *our own answer key cannot clear its own rung*. A rung's bar is `from + at × (to − from)` over **that world's own** references, so it rescales with them: a wall gets a proportionally lower bar and clears it. Scale-freedom is exactly what P1M4 built clearance for, and it is exactly why clearance cannot see this. **The first draft of `#56` offered a bar quoted from a different world's table as evidence** — `#20` in miniature, in the issue written to complain about a measurement.
* **Not `null`'s −1.000**, which the bar coincides with. That is a scorecard from an HTTP run; `lazyCapture` comes from the calibration, and on this world the two read −0.238 and −5.672 for the same lazy behaviour. P0M10 measured a solver seam of ×3.5 and `#20` is what comes of carrying a number across one. This seam is ×24.

### And a matched entity set is not a matched population

`calibrate` refuses to average in a rescue: a `P2rt` with no plan is charged `P1`'s outcome, right for scoring and ruinous for attribution, so the gap is taken over the journeys where it planned for itself. **That solves the problem inside one world and recreates it across two** — the conflicted world's survivors are not the honest world's, and `ablate` subtracted one mean from the other.

Both sides now average over the intersection, seed by seed, and the headroom divided by comes from that same population. It moved the top rung by twelve points (476 % → 488 %) and Phase 0's world by two (36 % → 38 %) — **larger where the populations diverge, negligible where they nearly coincide**, which is the behaviour the fix predicts and the reason to believe it rather than the reason to have made it.

**It was not the cause, and was worth fixing anyway.** The expectation going in was that it would explain the 476 %. A correctness defect that turns out not to be the culprit is still a correctness defect; leaving it in would have meant never learning which it was.

### What the corrected ladder now says

Every rung that carries semantic conflict fails the new end of 1b — `metro-city` −3.494, `towns-and-rail` −5.672, `region` −6.633 — against **+0.186** on Phase 0's hand-built world and **+0.393** on P1M4's generated tier-3. Those figures are properties of the declared world alone and so were never touched by `#55`.

They miss by three to seven rather than by a little, which is evidence about the ladder rather than about the bar. The mechanism is named and the gap it exposes is specific: **`excludes` stops one conflict masking another within a world, and nothing stops three operators drawing the same setting and compounding it.** Per-setting realism ceilings held correctly throughout — a wrong-zone offset is something real agencies publish — and per-*world* measurable consequence has no equivalent.
