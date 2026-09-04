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

**Closed at P0M10.** Two things finished it, and neither was strengthening a conflict.

*Placement.* Every declared conflict sat on operators reaching about a fifth of the network while the probe reported that all of them bite hardest on the one operator that had none. Moving them, at identical settings, took conflict cost from 1.30m to **2.53m — 76 % of headroom**, spread across five conflicts rather than resting on one.

*Classification.* `A-id-scheme` and `A-naming` were reclassified as **cosmetic** (`CORECONCEPT.md` §2.1). They measure exactly zero and always have; that is the expected result for texture, not evidence of a thin catalogue. §2.1's own definition of cosmetic variation already said "different ID formats", so the id-scheme entry had been mis-catalogued from the start. `A-id-collision` — two operators using `7` for *different places* — stays semantic, because an ambiguous identifier is not something an adapter settles.

`A-coordinate-precision` is no longer under the floor either: it costs 0.56m on Nordline.

---

## 3. Gate 1 has no external evidence — `resolved as a method change; the evidence is still owed`

The competent solution used to measure Gate 1 was written by someone who had already seen the world, the conflicts and the scoring. It establishes that the world is *solvable*. It says nothing about whether it is *discoverable*, how steep the first hour is, or whether solving it is interesting.

No internal work can close this. The gate output says so in its own text so the caveat travels with the number.

**Escalated at P0M10.** This was recorded as a gap in the evidence. It is a gap in the *method*: Gate 1 is measured by running a solution, and once worlds are generated, a fixed solver eventually fails on some world while a per-world solver makes the gate vacuous. `PHASES.md` now carries a proposal splitting Gate 1 into solvable (computable), not-trivial (computable) and discoverable (people, sampled) — and only the third is what this issue is about.

**Settled 2026-09-03.** Gate 1 splits into solvable (1a, computable), not-trivial (1b, computable) and discoverable (1c). **1c is removed from the MVP exit criteria** — nothing computable evaluates it, and a gate that cannot be evaluated should not sit in the exit pretending to be one. It returns in Phase 3 as generated verifier quests.

**What replaces it in Phase 0** are two *necessary* conditions, neither of which establishes discoverability but either of whose failure makes a world unfair rather than hard: information present (the identifiability audit, 1a) and **symptom present** (#22).

**Still owed:** the playtest itself. [`PLAYTEST-KIT.md`](PLAYTEST-KIT.md) needs an engineer who has not seen this repository, and quests will not substitute — they measure directed search, not undirected discovery.

---

## 4. Gap estimates are noisy at this world size — `fixed at P0M9`

22 scored queries means each is about 4.5 % of the score, and a single traveller changing outcome moves a gap noticeably. Fine for detecting the large effects Phase 0 was looking for; not fine for P1M4's claim that two generated worlds match "within tolerance".

**Promoted at P0M8 from a caveat to a blocker.** It is no longer only about P1M4's "within tolerance" claim. Gate 3's run-based measurement resolves ~0.1 of headline per traveller and is trying to measure ~0.1, so its answer is decided by a single journey; and the conflict-depth probe returns 0.90 / −0.44 / 0.01 for offsets of 30 / 60 / 130 m, which is scatter rather than a curve. Realistic-magnitude conflicts cannot be calibrated at this size.

**Fixed at P0M9.** The city grew from 27 sites, 34 quays and 7 lines to 38, 50 and 10, and the scored query set from 22 to 132 — the 22 hand-picked ones kept verbatim, plus 110 generated systematically from every Site pair at least 1500 m apart.

| | before | after |
|---|---|---|
| scored travellers | 22 | **132** |
| one traveller worth | 0.098 of headline | **0.001** |
| the question Gate 3 must decide | 0.2 of headline | 0.2 |

The instrument now resolves the effect it is measuring by a factor of two hundred rather than reading a 0.1 signal with a 0.1 ruler.

**Journey-time conflict cost rose with it**, from 0.59 min (19 % of headroom) to **1.41 min (42 %)** — above the ratified 20 % threshold. Bigger is not automatically harder; more origin-destination pairs simply give the declared conflicts more journeys on which they can matter.

**Cost:** every instrument is roughly six times slower. `npm run gates` is minutes rather than seconds and the conflict-depth probe is best run in the background.

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

---

## 16. The world enforced a walking limit it never published — `fixed at P0M9`

`MAX_WALK_M` is 400 m. The simulator refuses any itinerary whose access walk exceeds it, charging the traveller as not having arrived. The brief never mentioned it, and the reference player searched 500 m for a boarding point.

At 22 travellers this cost three of them and looked like noise. At 132 it cost **49**, and declining every obligation outscored attempting them — `null` arrived 120/132 while `naive` arrived 83/132.

**A rule the world enforces but never states is not a conflict to be discovered.** Catalogue §2.1 is about operators disagreeing with each other; this was the simulator disagreeing with everyone in secret. The brief now publishes `limits.max_walk_m` and `limits.walk_speed_mps` alongside the `replan` obligation P0M7 added but never advertised, and the reference player uses them instead of guessing. Naive arrivals went from 83 to 112.

---

## 17. The competent solution does not survive a bigger city, or a moved conflict — `open`

Written against a 34-quay world it captured **+0.292**. On the 50-quay, 132-query world of P0M9 it captures **−0.296** — worse than not integrating at all, and worse than the naive solution beside it.

**Worse after P0M10.** Moving the conflicts onto Nordline took it from −0.296 to **−0.602** capture, below the naive solution on every family but Information, and its headline to 0.005. Its offset correction and transfer floor were calibrated against a world where the displaced operator was a tram network reaching ten line-stops; the displaced operator now reaches thirty-nine.

Fourteen of its twenty-two failures are `replan_no_route`: stranded by a cancelled service, it declines to name an onward route and the traveller is abandoned. It refuses to board services it believes are cancelled, which is right, and then has nothing to offer instead, which is not. Its transfer floor and its offset correction were both calibrated against a network where Central was almost the only interchange.

**This is not a defect in the world, and it should not be fixed by making the world smaller.** It is the first direct evidence on the question `ROADMAP.md` P1M4 exists to ask — *does a solution built for one world perform comparably on another* — and the answer, for the only solution we have, is no. A solution that overfits its city is exactly what the assessment use case cannot tolerate.

It also means **Gate 1 currently measures the reference solution rather than the world.** The gate asks whether a competent solution can be built; what it reports is whether *this* one still works.

**One decisive bug found and fixed at P0M10.** The replan handler passed the traveller's position with a timestamp computed by `toSeconds`, which counts from the start of the month, where `planCompetently` indexes departures in seconds from the world epoch. The two differ by whole days, so the competent solution was asked to route from a point **seven days in the future** and answered `no_route` to **26 of 26** replans. It looked like a solution too conservative to reroute anybody. Fixed by a single shared `simSeconds`; replans now succeed 61 of 61.

**It did not fix the gate.** Arrivals went 106 to 103 and `abandoned_after_replans` rose to 17: the solution now reroutes and its reroutes keep breaking. The remaining fault is its geometry. `estimateOffset` recovers about 223 m for a 130 m displacement (#5), which was survivable while the displaced operator was a tram network reaching ten line-stops and is not now that it reaches thirty-nine. Eleven failures are `origin_unreachable` or `destination_unreachable` — it walks to boarding points that are not where it thinks.

**A second overfit assumption, found by measuring rather than reasoning.** `buildCompetentModel` chose its reference frame as *the operator with the most stops*, on the stated reasoning that any of them would do so long as the others were measured against one. That holds only while the biggest feed is not the displaced one. P0M10 put the coordinate offset on the operator running half the city, so the solution corrected everyone **towards a frame 130 m out of true**:

| operator | error before | after |
|---|---|---|
| ostline (no offset at all) | **62 m** | **0 m** |
| sudbahn | 156 m | 40 m |
| nordline (130 m offset) | 117 m | 79 m |

That an operator publishing perfect coordinates was placed 62 m from where it is, is the tell: the fault was the frame, not the estimator.

The frame is now chosen by **consensus rather than size** — each candidate scored by how much correcting it implies for everyone else, taking the least. A displaced feed disagrees with everyone; a good one disagrees only with the displaced. Nothing in the solution knows which feed is right, and it does not need to.

Unreachable-endpoint failures fell from 11 to 8 and arrivals rose from 103 to 106. **Gate 1 still fails.**

**What is left, and it is not diagnosed.** Twenty-six of its arrivals are ~11.6 min slower than the reference policy, and it issues 63 replans where the naive solution issues 31 — its plans break twice as often.

The sharpest clue is on the scoreboard: `blind`, which ignores realtime entirely, captures **−0.178**; `competent`, which uses it, captures **−0.597**. Reading the feeds is costing it four tenths of the headroom. `naive` and `blind` capture identically, because the naive solution uses realtime only to warn and never to plan — so the competent solution is the only one whose *routing* depends on what the feeds say, and it is the only one this far behind.

**Four candidate causes, eliminated by measurement rather than argument.** Recorded so nobody repeats them:

| hypothesis | why it is wrong |
|---|---|
| conservative transfer budgeting | `TRANSFER_FLOOR_S` is 60 s, far too small to cost 11.6 min |
| the vanished-trip heuristic misfires on completed trips | the feed republishes every trip on every poll; nothing vanishes but a genuine `silent_drop` |
| published trip ids drift over the day, so old keys look vanished | ids are stable: 484 Nordline trips at 06:00, the same 484 at 18:00, none missing |
| the minutes-vs-seconds delay heuristic misfires on a long delay | it requires every delay < 60; the world draws delays of 2–15 minutes and never approaches the boundary |

**The decisive experiment not yet run** is a `competent` variant that ignores realtime entirely. It isolates in one run whether the loss is in reading the feeds or in acting on them, and everything above only narrows where to look.

**Owner:** superseded by the Gate 1 proposal in `PHASES.md`, which demotes this solution from gate instrument to **regression detector**. Under that proposal its score is still reported and still worth keeping current, but it stops deciding anything — because a solution written by whoever built the world was never evidence about buildability, and P0M10 spent a milestone proving it.

---

## 18. Gate 3 compared an average against the scatter of single runs — `fixed at P0M10`

The run-based half of Gate 3 averages over seeds and then asked whether the effect exceeded the *standard deviation of individual runs*. That is the wrong statistic. The quantity on the table is a mean, the uncertainty of a mean is the standard error — `sd/sqrt(n)` — and it shrinks as seeds are added while the spread of single runs does not shrink at all.

**The gate could therefore never resolve anything, however many seeds it was given.** Adding seeds tightened the mean and left the bar it was tested against exactly where it was.

Corrected to the standard error of the difference of two means, with a two-sigma bar. The gate now also computes how many seeds the current effect size would need and prints the command:

```
conflicts cost 0.127 of the score (standard error 0.076, 1.7σ)
INCONCLUSIVE — the effect is under 2 standard errors.
At this effect size, roughly 8 seeds would settle it:
  TNS_GATE3_SEEDS=8 npm run gates
```

Recorded rather than quietly fixed because it belongs to this project's most persistent failure mode: **not a wrong number, but a right number compared against the wrong thing.** The 61 % Gate 3 pass, the clairvoyant reference, the conflict-free floor and this are all the same error wearing different clothes.

**A second, larger version of it, found immediately afterwards.** With the standard error corrected, going from 5 seeds to 12 moved it from 0.076 to *0.081* — it did not shrink at all. Twelve seeds had simply measured the run-to-run variance more honestly than five had.

The design was wasting its own information. Both worlds are run on **the same disruption draws**, so the difference can be taken run by run and the day cancels out of it. Differencing two independent means instead carries the full seed-to-seed variation into the answer, and no number of seeds removes a variance the design need never have had.

Gate 3 now takes the paired difference: `sd(clean_i − declared_i) / sqrt(n)`. Same estimate of the effect, a fraction of the uncertainty.

---

## 19. The Information family is insensitive to every declared conflict — `open`

Measured at P0M10, twelve seeds, paired: the naive solution scores **0.768** on this world and **0.767** with honest values. The declared conflicts move it by one thousandth.

This contradicts the reasoning that redefined Gate 3 at P0M8. That change was made on the argument that staleness's real damage is not journey time but that nobody gets warned, and that capture alone would miss it. The measurement says otherwise: the whole-score gate is a *diluted* capture gate, not a broader one, since `0.6 × 0.216 + 0.4 × 0.001 = 0.129`.

**The likely mechanism, which needs its own measurement rather than assertion:**

* 90 s and 300 s of staleness are negligible against warning deadlines set by the affected leg's scheduled departure, usually tens of minutes away. The timeliness term barely moves.
* `D-silent-cancellation` sits on Sudbahn, which reaches nine line-stops of fifty-eight. Few scored travellers depend on a train whose cancellation is hidden.

**Why it matters beyond Gate 3.** `CORECONCEPT.md` treats realtime truthfulness (catalogue D) as a first-class source of difficulty, and `SCORING.md` gives the Information family 40 % of the balanced profile. If no declared conflict can move it, then either the family is not measuring what it was meant to, or catalogue D is not load-bearing — and those call for opposite responses, exactly as the identity fork does.

**Owner:** open, and sharpened rather than resolved by the Gate 3 proposal in `PHASES.md`. Returning the criterion to journey time removes the *dependency* on this family without answering the question it raises: whether the Information family **should** be movable by a realtime conflict, and what is wrong with either the family or catalogue D if it is not.

---

## 20. Gate 3's threshold is applied to a metric it was not ratified against — `open`

The 20 % criterion was ratified after P1M0 **against journey-time headroom**. P0M8 redefined Gate 3 to attribute across the whole headline score and carried the same 20 % over without re-deriving it.

Conflicts move only the Service component, which carries weight 0.6 in the balanced profile, so **a 20 % bar on the headline is an effective 33 % bar on capture** — a stricter test than the one agreed to, arrived at silently.

Both measurements are sound and they disagree:

| measured on | conflict cost | verdict |
|---|---|---|
| journey-time headroom, as ratified | **76 %** | passes comfortably |
| whole headline score, as redefined | **12.9 %** (4.4σ) | fails |

**Settled 2026-09-03:** the criterion returns to journey-time headroom on `P2rt`. Not because it passes — because the two numbers differ mostly by *which solver they measure*, and only `P2rt` is specified in a document rather than written by us. The whole-score figure is reported and decides nothing. See `PHASES.md`, Gate 3.

The original framing follows.

**Proposal on the table** (`PHASES.md`, Gate 3): return the criterion to the metric that was ratified. The reason is not that it passes — it is that the two numbers differ mostly by *which solver they measure*, and only one of those solvers is specified rather than written by us.

Capture is already a fraction of headroom, so the naive player's capture drop of 0.216 means the conflicts cost **it** 0.72m, against `P2rt`'s 2.53m. That factor of 3.5 is the choice of instrument; the remaining ×0.6 is the Information family failing to move (#19). `P2rt` is defined in `REFERENCE-POLICY.md` §2; the naive player is an HTTP service that could change next week and take the gate with it.

**Owner:** the project owner. Nothing about Gate 3 should be recorded as passed or failed until it is settled.

---

## 21. Gate 2 measured separation with a statistic that assumed the answer — `fixed at P0M10`

Gate 2 asks whether solutions of different quality separate visibly. It computed the spread as `competent − null`, which measures separation **only if the competent solution is the best one**.

At P0M10 it was not: #17's replan bug had it answering `no_route` to every replan, so it scored 0.005 while the naive solution scored 0.192. Gate 2 reported a spread of **0.005** for a set of solutions actually spanning **0.299** — comfortably over its own 0.2 bar — and failed.

**A gate that fails for the wrong reason is worse than one that fails**, because it sends you looking at the world when the fault is in the solution. Two milestones' worth of "the world broke the players" reasoning rested partly on this.

Now `max − min` for separation, with the ordering checked separately and reported as a note pointing at Gate 1, where a mis-ordered set of solutions actually belongs.

---

## 22. Nothing checks that a conflict a player is charged for is one they could notice — `open`

Gate 1a will establish that the *information* needed to reconcile a world is present. Nothing establishes that a player who fails to reconcile it is given anything to work with.

**A conflict that silently subtracts capture with no observable consequence is not difficult, it is arbitrary.** The player loses and has no thread to pull, and no amount of skill converts into a better score. That is the failure mode `PLAYTEST-KIT.md` §5 calls *"the gate fails, informatively"* — they reach a scored run and cannot tell why it went the way it did — and it is the one discoverability problem that can be caught without a person in the room.

**Proposed check.** For each declared conflict, run the leave-one-in comparison the ablation already performs, but ask it of the **player-visible output** rather than of the score: does the scorecard, the attribution list or the trace differ between the world with that conflict and the world without it? A conflict that moves the score and moves nothing a player can see fails.

**It must produce a symptom, not a diagnosis.** `OBSERVABILITY.md` §8 defaults to the `attributed` disclosure level precisely because naming a cause hands over the answer key.

* *"Three travellers missed a connection you budgeted at 60 s that took 210 s"* — a thread to pull.
* *"`C-coordinate-offset:nordline` cost you 0.54 min"* — the solution.

The check is that the first exists, not that the second does.

**Why it is not sufficient**, and must not be described as measuring discoverability: a symptom existing in the output does not mean a person under time pressure will notice it, read it correctly, or know what to do about it. Only a playtest answers that (#3).

**Owner:** Phase 0, alongside the identifiability audit. Both are cheap, both are per-world, and both catch unfairness that would otherwise only surface when a real person hits it.
