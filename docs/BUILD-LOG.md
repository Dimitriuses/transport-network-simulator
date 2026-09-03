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
