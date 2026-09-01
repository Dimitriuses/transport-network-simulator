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

**The floor is 2.26 min, and it is not conflict cost.** A world with *no conflicts at all* still costs a lazy integrator that much, because it plans thirty minutes out, is told about trouble afterwards, and is never asked to replan. That term is roughly twenty times the conflict term, and it swamps everything measured without subtracting it.

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

### Four things the probe forced

**Conflicts have thresholds, and the committed world sits below them.** `C-coordinate-offset` costs nothing at 30, 60 or 130 m and only bites from 260 m. The committed world uses **130 m**. `D-staleness` costs nothing at 60 or 300 s and bites from 900 s; the committed world uses 90 s and 300 s. The catalogue is not as shallow as P0M6 concluded — *the settings are too weak*, which is a much more tractable problem than a wrong catalogue.

**Which operator carries a defect matters more than the defect.** Every conflict scores highest on `nordline`, and **sudbahn scores 0.00 on all twelve at every strength** — it is not on enough critical paths for anything done to it to reach a traveller. A generator that scatters conflicts uniformly across operators will produce worlds whose declared difficulty is mostly decorative. *Conflict placement must be weighted by how much traffic an operator actually carries.*

**Being perceptible and being costly are different properties, and both must be checked.** The belief tests prove all four feed defects *do* change what a naive reader believes. The probe shows three of them barely change what it *chooses*. That is a real finding rather than another blind spot — but only because the two were measured separately. Had `belief.test.ts` not been written, "inert" would have been indistinguishable from "invisible", which is exactly the error being corrected.

**The identity conflicts are the inert ones, and that is the most uncomfortable result here.** `A-granularity`, `A-id-scheme`, `A-naming`, `A-coordinate-source` — the whole of catalogue A except precision — cost nothing anywhere. Identity reconciliation is what `CORECONCEPT.md` presents as the heart of the challenge. The probe says that in this world it is free, because the naive merger matches on geometry and never needs ids to agree. **A conflict only costs something if the solver's method depends on the thing being corrupted**, and difficulty is therefore a property of the pair, not of the world alone. That belongs in the specification, and it makes P2's merge strategy part of the measuring instrument rather than an implementation detail of a baseline.

### Exit

The milestone's exit is *"we can name which conflicts are worth generating and roughly how strong each must be, and we have at least one external data point on discoverability."*

**First clause: met.** Named above, with thresholds.

**Second clause: not met, and not meetable from here.** [`PLAYTEST-KIT.md`](PLAYTEST-KIT.md) makes it a session someone can run rather than an intention.

**And Gate 3 now fails, which `PHASES.md` says must be allowed to stop the project rather than be tuned away.** P1M1 was already scoped to strengthen conflicts; it is now the milestone that decides whether Gate 3 can honestly be made to pass. That is a decision about the project, not a task inside it.
