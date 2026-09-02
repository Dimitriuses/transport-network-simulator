# Known issues

Defects and gaps we know about and have not fixed. Kept because an unrecorded known problem is indistinguishable from an unknown one, and because several of these are things a player would otherwise report as bugs.

**Statuses:** `open` — will be fixed, owner named. `deferred` — will be fixed, but not yet, and the milestone that owns it is named. `by design` — understood, not a defect, recorded so nobody re-discovers it. `wontfix` — decided against.

Design questions that have never been settled live as **OPEN** markers inside the specification that owns them, not here. This file is for things that are *wrong*, not things that are *undecided*.

---

## 1. `replan` is specified but never issued — `fixed at P0M7`

`PLAYER-CONTRACT.md` §5.5 defines a `replan` obligation in full: triggers, positions, response statuses. The harness never sends one. A traveller whose plan collapses mid-journey is simply not asked.

**Why it matters more than it looks.** It is why `blind` and `naive` score identically on Service (−0.023 each): realtime knowledge cannot affect a journey once it has begun, so polling can only ever improve the Information family. Half of what a live integration layer is *for* — noticing trouble and rerouting somebody around it — is currently unmeasurable.

**P1M0 promoted this from "half of what integration is for" to the binding constraint on Gate 3.** With a matched reference (`REFERENCE-POLICY.md` 2.1), conflict cost rises as the planning lead shortens:

| plan lead | conflict cost | P0a plans that did not survive the day |
|---|---|---|
| 1800 s (the harness) | 0.10m | 6/18 |
| 900 s | 0.22m | 5/18 |
| 300 s | 0.46m | 3/18 |
| 0 s | 0.46m | 1/18 |

Both columns move together, and the reason is one thing: **a planner that never replans is mostly blind, and a blind planner cannot be punished for reconciling badly.** At a 30-minute lead neither the optimum nor the lazy integrator knows much, so reconciliation quality barely matters and the conflicts have no room to bite. Reproduce with `npm run horizon`.

This makes `replan` a prerequisite for Gate 3 rather than a Phase 2 enrichment. It does not by itself close the gate - 0.46m is still only 15 % of headroom - but no amount of strengthening conflicts compensates for a player who only ever answers once.

**Fixed at P0M7.** The harness issues `/v1/replan` when a plan breaks in front of a traveller, the reference player answers it, and P1, P2rt and P0a all replan on the shared `MAX_REPLANS` budget. A traveller stranded with no usable advice resumes under the reference policy *from where they stand*, which is also now how a stuck baseline is charged.

**What it did not do is raise conflict cost**, which was the reason it was pulled forward. Wiring it into the baselines instead uncovered #14 and #15, and those have to be resolved before the effect can be measured at all.

---

## 2. The committed world sets its conflicts below the strength at which they bite — `largely a measurement artefact; corrected at P0M8`

Ablation at P0M6 attributed the entire conflict-caused shortfall to `C-coordinate-offset` and reported the other fourteen at nothing. P1M0's conflict-depth probe (`npm run probe`) re-measured that properly and split it into three separate problems.

**a. The instrument was blind.** P2rt was handed the world's true disruption set and never read a published feed, so all four catalogue D conflicts were unmeasurable by construction. Fixed at P1M0 by `believedDisruptions()`. This also withdraws the recorded Gate 3 pass — see #13.

**b. Six of twelve conflicts do bite; the world sets them too weak.** `C-coordinate-offset` costs nothing until 260 m and the world uses 130. `D-staleness` costs nothing until 900 s and the world uses 90 and 300. This is a much better problem than "the catalogue is one deep": the settings are wrong, not the design.

**Superseded at P0M8.** With the matcher threshold derived from the world instead of fixed at 120 m, **8 of 12 conflicts bite, at plausible settings.** `C-coordinate-offset` costs 0.55 min at **60 m** — it needed 260 m before — and `D-staleness` bites at the 300 s the world already publishes. Two catalogue A conflicts that had been inert everywhere now register. The catalogue was never one conflict deep; the instrument could not see past its own matcher. Four remain inert, and only two of those interestingly so — see below.

**c. Six are inert at every setting on every operator** — `A-granularity`, `A-id-scheme`, `A-naming`, `A-coordinate-source`, `A-coordinate-precision`, `D-silent-cancellation`. Nearly all of catalogue A, which `CORECONCEPT.md` presents as the heart of the challenge.

**The reason (c) matters more than it looks.** They are inert because the lazy merger matches on *geometry* and never needs identifiers to agree, so corrupting identifiers costs it nothing. A conflict only costs something if the solver's method depends on the thing being corrupted — which makes difficulty a property of the (world, solver) pair rather than of the world. P2's merge strategy is therefore part of the measuring instrument, and that is not yet written down anywhere in the specification.

**Also found:** conflict placement matters more than conflict choice. `sudbahn` scores 0.00 on all twelve at every strength, because it is not on enough critical paths for anything done to it to reach a traveller.

**What is left of this issue** is `A-id-scheme` and `A-naming` at exactly zero, for the reason in the next paragraph, plus `A-coordinate-precision` and `D-silent-cancellation` under the noise floor.

**Owner:** P0M10, which owns the identity fork.

---

## 3. Gate 1 has no external evidence — `open`

The competent solution used to measure Gate 1 was written by someone who had already seen the world, the conflicts and the scoring. It establishes that the world is *solvable*. It says nothing about whether it is *discoverable*, how steep the first hour is, or whether solving it is interesting.

No internal work can close this. The gate output says so in its own text so the caveat travels with the number.

**Owner:** P1M0 part A, which is **not closed**. The kit for running it is [`PLAYTEST-KIT.md`](PLAYTEST-KIT.md); it needs an engineer who has not seen this repository, and nothing internal substitutes for that.

---

## 4. Gap estimates are noisy at this world size — `open, and now blocking`

22 scored queries means each is about 4.5 % of the score, and a single traveller changing outcome moves a gap noticeably. Fine for detecting the large effects Phase 0 was looking for; not fine for P1M4's claim that two generated worlds match "within tolerance".

**Promoted at P0M8 from a caveat to a blocker.** It is no longer only about P1M4's "within tolerance" claim. Gate 3's run-based measurement resolves ~0.1 of headline per traveller and is trying to measure ~0.1, so its answer is decided by a single journey; and the conflict-depth probe returns 0.90 / −0.44 / 0.01 for offsets of 30 / 60 / 130 m, which is scatter rather than a curve. Realistic-magnitude conflicts cannot be calibrated at this size.

**Owner:** P0M9, pulled ahead of Phase 1 for that reason.

---

## 5. The coordinate offset is not fully recoverable — `by design`

`estimateOffset` recovers ~223 m for a 130 m displacement. It is not a bug in the estimator, and a better estimator will not fix it: the displacement and the genuine ~80 m separation between neighbouring quays are the same order of magnitude, and proximity cannot decompose them.

This is a true property of the problem and arguably the most interesting single thing in the world. The engineering response — implemented in the competent solution — is to stop trusting the corrected geometry and put a floor under transfer times.

Recorded here because it looks exactly like a bug in the estimator until you work out why it is not.

---

## 6. Ablation reports a negative cost for `A-coordinate-precision` — `by design`

Leave-one-in ablation scores it at −0.34 min: adding coordinate truncation *on its own* helps a lazy integrator, because truncation partially cancels the systematic offset.

A real interaction, not a measurement error. It is also a useful warning that a difficulty model treating conflicts as independent and additive would be wrong here.

---

## 7. Leave-one-out ablation attributes nothing — `by design`

Removing any single conflict changes the lazy integrator's shortfall by roughly zero, because the defects are jointly sufficient and individually unnecessary: take away the coordinate offset and it still trips over colliding identifiers; take those away and it still misreads timestamps.

`ablate()` therefore uses leave-*one-in*. The shares over-sum, and that overlap is the redundancy itself — worth seeing rather than hiding.

---

## 8. `node:sqlite` prints an experimental warning on every run — `open`

Node 22 ships `node:sqlite` as experimental, so every command that opens a world bundle emits `ExperimentalWarning: SQLite is an experimental feature`. Harmless, and noisy enough that it is routinely filtered out of output — which is exactly the habit that hides a real warning later.

**Fix when convenient:** either `--disable-warning=ExperimentalWarning` on the scripts that load worlds, or `better-sqlite3` if the API stabilises differently. Not urgent, but worth doing before anyone outside the project runs it and wonders.

---

## 9. `verbatim` logging is specified but not implemented — `deferred`

`OBSERVABILITY.md` §7 defines four logging levels. The run log is written at `trace` in practice; `score`, `replay` and `verbatim` are not selectable, and the 250 MB cap decided at P0M6 has nothing to enforce.

**Owner:** Phase 2, alongside closed-loop replay, which is the first thing that genuinely needs `replay`.

---

## 10. Trace disclosure levels are decided but not implemented — `deferred`

`OBSERVABILITY.md` §8 settles on three levels — `full`, `attributed`, `outcome` — with `attributed` as the default. Nothing reads that setting; the scorecard currently reports full attribution to whoever runs it.

Harmless while the only players are ours. It becomes real the first time a world is used for assessment, because full attribution is close to an answer key.

**Owner:** Phase 4, with assessment mode. Pull earlier if anyone uses a world to evaluate a person.

---

## 11. Operator API documentation is not generated — `open`

`PLAYER-CONTRACT.md` §6.1 has every operator advertise a `docs_url`, and `DATA-MODEL.md` §5 specifies that operator documentation is generated from the same schema source as behaviour — so that divergence between them is deliberate rather than accidental (catalogue §2.1 F). The brief advertises the URL; nothing serves it.

A player currently has to discover each operator's schema by fetching and reading. That is *harder* than intended and hard in the wrong way — endpoint archaeology rather than reconciliation. It also teaches the opposite of what §2.1 F is for: a world whose documentation is absent trains players to ignore documentation.

**Owner:** P1M1, which is where generated projections and their documentation should arrive together. **Accurate documentation first**; defects only once #12 is resolved.

---

## 12. No instrument can see a documentation defect — `open`

Difficulty is measured through P2, the lazy baseline. P2 never reads documentation, so ablation reports every catalogue F conflict at exactly zero — not because they do not matter, but because nothing we measure with can perceive them.

This is the same trap as #2 with one important difference: those fourteen conflicts *could* be measured and were found wanting. These cannot be measured at all, so anything built on them rests on faith rather than evidence.

**Why it is not trivially fixable.** A baseline that reads prose documentation would need to understand it, which is a different project. The plausible routes are all indirect:

* watch a real person meet the APIs and record where documentation helped or misled (P1M0);
* for the agent-benchmark case specifically, an agent *does* read documentation, so an agent's score is a genuine measurement — expensive, and not part of the automated instrument;
* make documentation defects have an observable consequence in the data, so an existing instrument catches them — which mostly means the defect was really a data conflict wearing documentation as a costume.

**Owner:** P1M0 for the first data point. Blocks generating documentation *defects*, not generating accurate documentation.

---

## 13. The recorded Gate 3 pass was measured with a blind instrument — `open`

`PHASES.md` recorded Gate 3 as passing at 61 %. P1M0 found that number was produced by a baseline handed the true disruption set, which never read a published feed and therefore could not perceive any conflict living in one. Re-measured with a feed-reading baseline, Gate 3 reads **4 % and fails**.

The correction is recorded in `PHASES.md`, `ROADMAP.md` and `README.md` with the original number left visible, because a result that is quietly rewritten cannot be challenged.

**What it does not mean.** It is not evidence that the world is undramatic. The probe shows six conflicts that bite at achievable strengths; the committed world sets most of them below threshold. It is evidence that Phase 0 exited on a number it had not earned.

**What it blocks.** `PHASES.md`: *"Do not begin Phase 1 on a failed Gate 3."* Phase 1 has begun, and P1M0 — the milestone whose stated purpose is to test what Phase 0 concluded — is what found it. Whether that counts as the process working or as grounds to stop is a judgement for the project owner, not something to settle by continuing.

**Corrected instrument, P1M0.** Gate 3 now divides by `P0a - P2rt` (`REFERENCE-POLICY.md` 2.1) - an optimum held to the same announcement horizon - so P0's foresight is excluded rather than counted as difficulty. With that:

| | old (vs clairvoyant P0) | new (vs matched P0a) |
|---|---|---|
| lazy integrator's shortfall | 2.37m | 0.10m |
| the same, conflicts off | 2.26m | **0.00m** |
| conflict-caused share | 4 % | 100 % |
| conflict cost vs 3.14m headroom | - | **3 %** |

**The gate still fails, and the share is no longer the reason.** Against a matched reference the share is 100 % by construction - remove the conflicts and a lazy integrator becomes optimal, so everything left is conflict-caused whatever the conflicts do. The informative number is the last row: the conflicts cost **3 % of the headroom a player competes for**.

**The criterion is now 20 % of headroom, ratified.** `gates.ts` requires conflict cost > 20 % of `P0−P1`. Chosen at P1M0 because the gate needed *some* materiality criterion once share went degenerate, and ratified by the project owner; recorded in `PHASES.md` under Gate 3. The world currently reads 3 %.

**Phase 0 is reopened.** `PHASES.md` says not to begin Phase 1 on a failed Gate 3, so P0M7 (`replan`) and P0M8 (conflict potency) now sit ahead of it, and Phase 1's generation milestones are blocked behind their joint exit.

**Owner:** P0M8, blocking. Nothing downstream of conflict generation should be built until it resolves.

---

## 14. Switching every conflict off produces a *denser* world, not a floor — `partly fixed at P0M8`

Ablation, the conflict-depth probe and Gate 3 all attribute conflict cost by subtraction: measure the declared world, measure the same world with every conflict off, take the difference. That assumes the conflict-free world is a floor. It is not, and there turned out to be two separate reasons.

### The matcher's fixed threshold — **fixed**

The lazy baseline fused stops within a hard-coded 120 m. This city has **19 pairs of genuinely distinct quays closer than that**, the nearest 31 m apart, so the matcher collapsed 34 canonical quays into 19 stops before any conflict was applied.

Worse, that threshold silently decided which conflicts were visible at all. A matcher that cannot separate quays 31 m apart cannot notice a 60 m coordinate offset, so the offset had to be pushed past **260 m** to cost anything — past the point where it stops describing two operators disagreeing and starts describing a broken map. *"How strong must this conflict be"* was really *"how far past 120 m"*.

`naiveMatchThresholdM()` now derives the threshold from the world's own geometry: the largest value that never fuses two distinct quays. The conflict-free world reconstructs exactly, the floor falls from 1.13 min to 0.23 (the five-minute poll cadence), and conflict cost on journey time becomes **positive and monotonic** — 0.59 min at the harness's planning lead, 0.95 at short leads, **19 % of headroom against a 20 % threshold.**

### Density, and what it turned out to be — **resolved as a diagnosis; the gate is now sample-limited**

Gate 3 measures across the whole score from real runs (P0M8), and it reports the naive player scoring **0.316** on this world and **0.218** with honest values.

The first suspicion was density. Switching conflicts off puts more stops within the player's 200 m transfer radius — 21 pairs against 11 — and a player that treats any such pair as an interchange has more chances to be wrong. Holding the entity set fixed (`valueCleanWorld`, granularity left as declared) was expected to remove that. **It changed nothing: 0.218 either way.**

Because the inversion is not a density effect. Comparing failure modes across the two runs:

| | arrived | replans | failure modes |
|---|---|---|---|
| declared | 15/22 | 6 | identical but for one traveller |
| honest values | 14/22 | 6 | one extra forgone-and-abandoned |

**One traveller.** The entire 0.098 headline swing is a single journey changing outcome. Arrival is binary and there are 22 of them, so the instrument's resolution is ~0.1 headline per traveller and the effect it is trying to measure is ~0.1. The sign of the answer is decided by one journey.

So the run-based gate is not wrong and is not measuring a confound. **It cannot resolve its own question at this world size**, which is `KNOWN-ISSUES.md` #4 arriving somewhere it actually blocks. `npm run gates` now computes and prints this resolution and returns **INCONCLUSIVE** rather than a verdict — a number smaller than the instrument's own resolution must not be recorded as a finding, which this project has already done once.

Journey-time attribution is unaffected: it averages a continuous quantity rather than counting binary arrivals, and reads a stable **+0.59 min, 19 % of headroom**.

**What remains open** is therefore only the sample size, and that is P0M9's whole job. The density observation stands as a real property of the naive player (it is bad at transfers, and accurate data offers it more transfers to be bad at) but it is not what inverted the gate.

**Owner:** P0M9 — a world big enough for a binary measurement to mean something. Nothing further can be decided about Gate 3 until then.

## 15. P0a is a strategy, not a bound — `open`

Gate 3 divides by `P0a − P2rt`, described as the shortfall against "an optimum held to the same announcement horizon" (`REFERENCE-POLICY.md` §2.1). P0a is not an optimum. It plans once on what had been announced and replans only when its plan *breaks*, which is a well-informed strategy — and a strategy is not a bound.

Measurably so: on `q15` P0a arrives in 43.22 min while the *lazy* integrator arrives in 36.40. P0a had detoured around a delay that was announced and turned out not to matter. A genuine optimum over announcement-limited strategies would have taken the faster route, because that route was available under strictly less information.

P0a is already the better of its own plan and P1, for the same reason — P1 is achievable with no disruption knowledge at all, so any bound must dominate it. That patch closed the cases it could; `q15` shows it does not close them all.

**Why it is not trivially fixable.** The true object is the optimum over *strategies* under partial information, which is a planning problem over belief states rather than a shortest path. Computing it exactly is a different piece of work from routing.

`src/scoring/test/matched-reference.test.ts` pins the gap with a characterisation test that asserts a violation still exists, so the day P0a becomes a real bound the test fails and says so.

**Owner:** P0M8, jointly with #14 — both are the same question: what is a fair reference for attributing conflict cost?
