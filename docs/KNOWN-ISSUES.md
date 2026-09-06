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

## 8. `node:sqlite` prints an experimental warning on every run — `fixed at P1M4`

Node 22 ships `node:sqlite` as experimental, so every command that opens a world bundle emits `ExperimentalWarning: SQLite is an experimental feature`. Harmless, and noisy enough that it is routinely filtered out of output — which is exactly the habit that hides a real warning later.

**Fix when convenient:** either `--disable-warning=ExperimentalWarning` on the scripts that load worlds, or `better-sqlite3` if the API stabilises differently. Not urgent, but worth doing before anyone outside the project runs it and wonders.

---

**Fixed** at P1M4 with `node --disable-warning=ExperimentalWarning`, added to all 23 scripts that invoke `node` directly. The flag is per-invocation rather than a `NODE_OPTIONS` environment variable, so it works identically on every platform and nothing has to be exported before running a command by hand.

Two lines of noise on every instrument's output is not merely cosmetic: it is two lines that a reader learns to skip, and this project has already had one defect hide in a line people had learned to skip (`#19`, where the defect audit printed `hides 0 disruption(s)` for months).

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

## 11. Operator API documentation is not generated — `fixed at P1M1`

`PLAYER-CONTRACT.md` §6.1 has every operator advertise a `docs_url`, and `DATA-MODEL.md` §5 specifies that operator documentation is generated from the same schema source as behaviour — so that divergence between them is deliberate rather than accidental (catalogue §2.1 F). The brief advertises the URL; nothing serves it.

A player currently has to discover each operator's schema by fetching and reading. That is *harder* than intended and hard in the wrong way — endpoint archaeology rather than reconciliation. It also teaches the opposite of what §2.1 F is for: a world whose documentation is absent trains players to ignore documentation.

**Fixed** at P1M1. `src/projections/src/docs.ts` generates an OpenAPI 3.1 document per operator from that operator's own manifest, and `GET /docs` serves it. Accurate only — defects wait for #12 and for something able to measure them.

**Generated at request time rather than baked into the bundle**, so behaviour and description have exactly one source and cannot drift by accident. Phase 3 will need somewhere to keep an intended-but-untrue version; until then there is nothing to keep.

**The line it draws, and why it is a decision rather than a detail.** What an operator documents changes how hard a world is, so the rule is stated in `docs.ts` and enforced by `src/projections/test/docs.test.ts`:

> **Format and units are documented. Accuracy, freshness and completeness are not.**

An operator can only document what it *intends*. A real agency states its time encoding, its identifier scheme and whether a position means a station or a boarding point — deliberate choices its own engineers had to make. None documents that its survey is 130 m out, that its feed lags five minutes, or that cancelled trips vanish: it does not know, or would not say. Applied to the catalogue:

| documented | not documented |
|---|---|
| `A-granularity`, `A-id-scheme`, `A-coordinate-source` | `A-naming`, `A-coordinate-precision` |
| `B-time-encoding` | `C-coordinate-offset`, `C-latlon-order` |
| `C-delay-unit`, `D-no-delays` | `D-staleness`, `D-silent-cancellation` |

Sections A and B become *readable* rather than archaeological; every conflict about whether the data is **true** stays discoverable only by measurement, which is where §2.1 says the difficulty lives.

**It changes no measurement taken so far**, and that is itself the limitation: none of the reference solutions reads documentation, so nothing in the instrument set can see whether documenting a conflict made it easier. That is #12.

`npm run docs [world] [operator]` prints what a player would read.

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

## 13. The recorded Gate 3 pass was measured with a blind instrument — `closed at P0M10`

`PHASES.md` recorded Gate 3 as passing at 61 %. P1M0 found that number was produced by a baseline handed the true disruption set, which never read a published feed and therefore could not perceive any conflict living in one. Re-measured with a feed-reading baseline, Gate 3 reads **4 % and fails**.

The correction is recorded in `PHASES.md`, `ROADMAP.md` and `README.md` with the original number left visible, because a result that is quietly rewritten cannot be challenged.

**What it does not mean.** It is not evidence that the world is undramatic. The probe shows six conflicts that bite at achievable strengths; the committed world sets most of them below threshold. It is evidence that Phase 0 exited on a number it had not earned.

**What it blocked, and how it was answered.** `PHASES.md` says *"do not begin Phase 1 on a failed Gate 3."* The project owner reopened Phase 0 rather than continuing, and P0M7 through P0M10 rebuilt the instrument, the world and the reference. Gate 3 now measures 78 % of headroom on journey time and passes on the ratified criterion.

The number that started this — 61 % — was never earned. The one that replaced it was measured four times with four different faults, each corrected. Closed because the instrument is now sound, not because the original verdict was recovered.

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

## 14. Switching every conflict off produces a *denser* world, not a floor — `closed: threshold fixed at P0M8, sample size at P0M9`

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

**Closed at P0M9**, which grew the world to 132 scored travellers. One traveller is now worth 0.001 of headline against the 0.2 the gate decides, and P0M10 added the paired-difference statistic that shrank the standard error from 0.081 to 0.029 on the same data. Gate 3 resolves at 3σ and above.

## 15. P0a is a strategy, not a bound — `practically resolved at P0M10`

Gate 3 divides by `P0a − P2rt`, described as the shortfall against "an optimum held to the same announcement horizon" (`REFERENCE-POLICY.md` §2.1). P0a is not an optimum. It plans once on what had been announced and replans only when its plan *breaks*, which is a well-informed strategy — and a strategy is not a bound.

Measurably so: on `q15` P0a arrives in 43.22 min while the *lazy* integrator arrives in 36.40. P0a had detoured around a delay that was announced and turned out not to matter. A genuine optimum over announcement-limited strategies would have taken the faster route, because that route was available under strictly less information.

P0a is already the better of its own plan and P1, for the same reason — P1 is achievable with no disruption knowledge at all, so any bound must dominate it. That patch closed the cases it could; `q15` shows it does not close them all.

**Why it is not trivially fixable.** The true object is the optimum over *strategies* under partial information, which is a planning problem over belief states rather than a shortest path. Computing it exactly is a different piece of work from routing.

`src/scoring/test/matched-reference.test.ts` pins the gap with a characterisation test that asserts a violation still exists, so the day P0a becomes a real bound the test fails and says so.

**Tightened at P0M10.** `P0a` is now taken as the best of its own plan-and-replan, P1's outcome, and P2rt's — every achievable strategy this codebase computes. **No lazy solver beats it on any of the 120 comparable queries**, where before it lost outright on `q15`.

That does not make it a proven bound: the true optimum over announcement-limited strategies is a planning problem over belief states, and computing it exactly is a different piece of work. What it means is that nothing we can construct outperforms the reference that is supposed to cap it, which is as far as this can be taken without building that. `matched-reference.test.ts` now asserts the *absence* of a violation and names what to do if one reappears — add the new baseline to the set, or look for a leak.

**This became load-bearing on 2026-09-04**, when `capture` began normalising against `P0a` (`SCORING.md` §2). Because P0a is a strategy rather than a bound, `capture > 1` is now a legitimate outcome and no longer signals a leak on its own — the invariant moved to `captureVsOracle`, measured against `P0`. Anything reading `capture > 1` as impossible is out of date.

**Owner:** P0M8, jointly with #14 — both are the same question: what is a fair reference for attributing conflict cost?

---

## 16. The world enforced a walking limit it never published — `fixed at P0M9`

`MAX_WALK_M` is 400 m. The simulator refuses any itinerary whose access walk exceeds it, charging the traveller as not having arrived. The brief never mentioned it, and the reference player searched 500 m for a boarding point.

At 22 travellers this cost three of them and looked like noise. At 132 it cost **49**, and declining every obligation outscored attempting them — `null` arrived 120/132 while `naive` arrived 83/132.

**A rule the world enforces but never states is not a conflict to be discovered.** Catalogue §2.1 is about operators disagreeing with each other; this was the simulator disagreeing with everyone in secret. The brief now publishes `limits.max_walk_m` and `limits.walk_speed_mps` alongside the `replan` obligation P0M7 added but never advertised, and the reference player uses them instead of guessing. Naive arrivals went from 83 to 112.

---

## 17. The competent solution does not survive a bigger city, or a moved conflict — `answered at P0M10; the cause is #26`

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

**The decisive experiment, run at last: `competent-deaf`.** It plans exactly as `competent` does — same model, same offset correction, same transfer floor — and never lets a realtime feed reach its routing. It still warns, so the Information family is unaffected.

**Result: byte-identical to `competent`.** 106 arrived, 12 forgone, 63 replans, the same failure profile. Reading the feeds costs it nothing. The leading hypothesis of two milestones is dead, and every candidate cause listed above is now eliminated.

**The actual cause was not in the solution at all.** Compare what the two solutions *attempt*:

| | forgone | arrived | slower than P1 |
|---|---|---|---|
| naive | **42** of 132 | 112 | 12, by 5.3m |
| competent | **12** of 132 | 106 | 26, by 11.6m |

The naive solution declines a third of its obligations. A declined traveller falls back to the reference policy — and **that was free**. `REFERENCE-POLICY.md` §8 requires a fixed forgone-obligation penalty and was never implemented (#25), so the naive solution was collecting P1's outcomes at no cost on 42 travellers while the competent solution answered them and was charged for every answer worse than P1.

**Two things were confounded, and only one of them is now removed.**

*The missing penalty flattered the naive solution.* It collected P1's outcomes free on 42 travellers, so the comparison that made the competent solution look bad was partly measuring a hole in the scorer.

*The competent solution is also genuinely bad, and the penalty does not rescue it.* Measured with both corrections in place — the §8 penalty and the `P0a` denominator — it captures **−1.656** against `null`'s −1.000 and `naive`'s −0.784. It is the worst of the four, and worse than declining every obligation. A capture of −1.656 means its travellers arrive roughly two minutes *worse per head* than a city with no integration layer at all.

**An arithmetic warning attached to this issue, because it was made here.** An earlier estimate concluded the penalty would restore the ordering. It compared a competent figure normalised against `P0` with a naive figure normalised against `P0a` — the two scales differ by a factor of 2.6, and the conclusion was an artefact of mixing them. The measured ordering is above.

**Answered.** *Because on 88 % of this world's scored journeys there is nothing to win, and it plays them anyway.* See #26. Six hypotheses were eliminated by measurement first, each cheap and each wrong:

| hypothesis | how it died |
|---|---|
| it mishandles realtime | `competent-deaf` — plans identically, never lets a feed reach routing — is **byte-identical** to `competent` |
| its transfer budget is too tight, so it misses connections | sweeping `TRANSFER_FLOOR_S` over 60/120/180/240 s moves the loss not at all: 2.3m per traveller at every setting |
| its decoded departure times are off | the competent model's departures match the truth to **0 s** on all three operators, over 1102 trips |
| its reference frame is displaced | true, and fixed — Ostline went 62 m to 0 m of error — and it was not enough |
| the vanished-trip heuristic misfires | the feed republishes every trip; ids stable across the day |
| the minutes-vs-seconds heuristic misfires | needs a delay ≥ 60 min; the world draws 2–15 |

The measurement that ended it: **24 arrivals slower than the reference policy, and the amounts lost are 30.0, 25.0, 20.0, 20.0, 20.0, 20.0, 18.0, 18.0, 18.0, 15.0 minutes** — round numbers, and they are the line headways from `city.py`. It misses a vehicle and waits exactly one headway for the next. Fifty of its sixty-three replans are `vehicle_cancelled`, against the naive solution's twenty-six.

**A methodological note worth keeping.** The first run of `competent-deaf` returned results identical to `naive`, which looked like a finding. It was not: `serve.ts` whitelisted player modes and **silently fell back to `naive`** for anything unrecognised, so the diagnostic ran as the wrong player. It now exits with an error. A silent default is indistinguishable from a working experiment.

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

## 19. The Information family is insensitive to every declared conflict — `fixed at P1M2; the premise was wrong`

> **Status, because this entry was mislabelled between P1M1 and P1M2 and misled a reader.** P1M1 refuted the diagnosis, fixed the instruments and added the generator rule, and the header said `resolved` — but **the committed world itself was never changed**, so on the world every Phase 0 result was measured on, catalogue D still did nothing. The entry claimed resolution while one of its own bullets said the opposite. Both are now true and the world is fixed; the trail below is kept in order.

Measured at P0M10, twelve seeds, paired: the naive solution scores **0.768** on this world and **0.767** with honest values. The declared conflicts move it by one thousandth.

This contradicts the reasoning that redefined Gate 3 at P0M8. That change was made on the argument that staleness's real damage is not journey time but that nobody gets warned, and that capture alone would miss it. The measurement says otherwise: the whole-score gate is a *diluted* capture gate, not a broader one, since `0.6 × 0.216 + 0.4 × 0.001 = 0.129`.

**Sharpened at P0M10 by the symptom check, and the answer is not what this issue assumed.** The Information family's *events* do move: switching `D-silent-cancellation:sudbahn` on produces **10 silent events** where the honest world has none, and `D-staleness:sudbahn` produces late ones. The world is not failing to generate observable realtime failures.

What does not move is the **score**. `F1(recall, precision) × (0.5 + 0.5 × timeliness)` washes ten silent events down to a thousandth of a point. So the insensitivity is in the *scoring formula*, not in the world and not in the instrument — which is a considerably more tractable problem than either, and a different one from the mechanism guessed below.

**The original guesses, kept because they were wrong in an instructive way:**

* 90 s and 300 s of staleness are negligible against warning deadlines set by the affected leg's scheduled departure, usually tens of minutes away. The timeliness term barely moves.
* `D-silent-cancellation` sits on Sudbahn, which reaches nine line-stops of fifty-eight. Few scored travellers depend on a train whose cancellation is hidden.

**Why it matters beyond Gate 3.** `CORECONCEPT.md` treats realtime truthfulness (catalogue D) as a first-class source of difficulty, and `SCORING.md` gives the Information family 40 % of the balanced profile. If no declared conflict can move it, then either the family is not measuring what it was meant to, or catalogue D is not load-bearing — and those call for opposite responses, exactly as the identity fork does.

**Owner: P1M1**, assigned 2026-09-04. Catalogue D cannot be validated in a generated world until a realtime conflict can move this family, and P1M1's exit now names it. Sharpened rather than resolved by the Gate 3 change in `PHASES.md`: Returning the criterion to journey time removes the *dependency* on this family without answering the question it raises: whether the Information family **should** be movable by a realtime conflict, and what is wrong with either the family or catalogue D if it is not.

---

### The diagnosis above is wrong, and P1M1 measured what is actually happening

**It is not the formula.** `npm run information` implements all four of `SCORING.md`'s candidate directions as pure functions of the same run and scores them side by side, declared world against honest-values world, paired by seed. Twelve seeds on the committed world:

| formula | declared | honest | effect | se | noise |
|---|---|---|---|---|---|
| current — `F1 x (0.5 + 0.5 x timeliness)` | 0.7044 | 0.7023 | −0.0020 | 0.0145 | 0.0546 |
| no floor — `F1 x timeliness` | 0.6577 | 0.6600 | +0.0023 | 0.0163 | 0.0486 |
| per event | 0.5274 | 0.5315 | +0.0041 | 0.0186 | 0.0673 |
| cost weighted | 0.4924 | 0.4712 | −0.0212 | 0.0201 | 0.1102 |

Every effect is inside its own standard error and an order of magnitude below the seed-to-seed noise. **Two of these formulas were built to be far more sensitive than the current one and they detect nothing either** — which is not what a formula problem looks like. And the world is not short of material: 30.5 material events per run, 9.4 of them silent, 2.6 late.

**`D-staleness` on this world cannot hide anything, and the reason is arithmetic.** `npm run lead` measures the gap between the instant the world announces a disruption and the instant the affected service was due to leave, against each staleness setting:

```
    minimum       5.1m        staleness   hides   share
    10th %        7.4m              60s       0     0%
    median       16.8m             300s       0     0%
    90th %       26.5m             900s     118    41%   <- the ceiling
    maximum      30.0m
```

`DEFAULT_POLICY.noticeLeadS` is `[300, 1800]`. The committed world declares staleness of **90 s and 300 s**. A feed can only conceal a disruption whose announcement lead is shorter than its own lag, and **no disruption in this world has a lead shorter than 300 s** — so both settings hide exactly zero, by construction. The defect audit had been printing this for months: *"feed is stamped τ−300s, and hides 0 disruption(s) that are already true."*

**This is the project's signature failure in a new place: two numbers, each fine alone, chosen in different files by people who never compared them.** `noticeLeadS` lives in `src/core/src/disruptions.ts` and was picked so that short leads "punish a slow polling cadence"; the staleness settings live in the catalogue and were picked for plausibility. Their *relationship* decides whether the conflict exists at all, and nothing owned it.

**What follows, and what does not:**

* The four candidate formulas are **not discriminated by this evidence**. Choosing between them on these numbers would be choosing noise. The `SCORING.md` OPEN item stays open, and its options are unchanged — but "the formula is why catalogue D does not score" is struck.
* **The fix is on the world side, and does not require cranking anything past realism.** 900 s is already the plausibility ceiling, already carries its stated cause ("a 5-minute rebuild behind a cache"), and hides 41 % of disruptions. The generator's `generate` list offers it; the committed world simply never drew it.
* **A third generator rule follows**, and it is the numeric cousin of #30: *a setting must be capable of expressing itself given the rest of the world's parameters.* Staleness below the minimum announcement lead is plausible, declared, audited present — and inert. `REQUIRES` handles capabilities; this needs a threshold comparison against `noticeLeadS`.
* **`D-silent-cancellation` is a separate question** and is not answered here. On the committed world it sits on Sudbahn, which reaches nine line-stops of fifty-eight, and produces six events.

### That measurement, taken

The same comparison on the generated Tier-5 world — staleness at the 900 s ceiling, realtime conflicts on nordline, which reaches 39 line-stops of 58 — twelve paired seeds:

| formula | declared | honest | effect | se | σ |
|---|---|---|---|---|---|
| **current** | 0.4553 | 0.6726 | **+0.2173** | 0.0267 | **8.1** |
| no floor | 0.4274 | 0.6297 | +0.2023 | 0.0262 | 7.7 |
| per event | 0.2812 | 0.4943 | +0.2132 | 0.0269 | 7.9 |
| cost weighted | 0.2133 | 0.4421 | +0.2288 | 0.0385 | 5.9 |

Silent events rose from 9.4 per run to 13.9; in-time warnings fell from 18.5 to 9.4; late ones rose from 2.6 to 6.2.

**The current formula moves by 0.217 — more than a fifth of the family's range — at 8.1σ.** It is not insensitive. The title of this issue is wrong and the diagnosis under it was wrong twice: once in the original guesses, once in the P0M10 correction that replaced them.

**Two things changed between the two worlds**, so the 0.217 is an upper bound on either alone: staleness rose 300 s → 900 s, *and* the realtime conflicts moved from Sudbahn (9 line-stops) to Nordline (39). Placement was already known to dominate (P0M10). But the strength half is settled by arithmetic rather than statistics and needs no further run: **at 90 s or 300 s, zero disruptions are concealed on any operator**, because no disruption in this world has an announcement lead below 300 s. No placement rescues a setting that hides nothing.

**And no candidate formula is better.** The four effects span 0.202–0.229 against a standard error of ~0.027 — differences well inside one σ, on a measurement designed to separate them. There is no evidence for changing the formula, and changing it would make every recorded score incomparable in exchange for nothing measured.

### What this leaves

* **`SCORING.md`'s OPEN item is answerable now, and the answer is none of its four options.** Its premise — that the formula is why catalogue D does not score — is refuted. **Ratified 2026-09-05: the formula does not change and the item keeps its OPEN label** — the four candidates differ by less than one σ, so there is no evidence for a change, while the question of what the family *should* weigh is still undecided.
* **The real defect was a generator rule that did not exist**, and it now does: *a setting must be capable of expressing itself given the rest of the world's parameters.* `REQUIRES` (#30) handles capabilities — can this operator express this conflict at all. Staleness needed the numeric cousin, and `generate._expressible` supplies it. **The two numbers now come from one place**: `DEFAULT_DISRUPTION_POLICY` moved from `src/core` to `@tns/schema` and ships in `contract/catalogue.json`, so the generator compares staleness against the same `noticeLeadS` the simulator draws from, rather than against a second copy of it.
* **The committed world understates its own tier**, and by a lot. Its two staleness settings are both inert, so Tier 2's realtime component is decorative. That is not a scoring bug; it is `#32`'s problem in another form — the tier ladder needs levers, and this is one nobody knew was disconnected. **This was the part left undone at P1M1, and it is the fix below.**
* **The defect audit's staleness evidence was weak, and is now fixed.** It passed on `knownNow.length > knownStale.length || feed.as_of !== probe`, and the right-hand side is true whenever staleness is non-zero — so the check could not fail, and its evidence line reported the number of disruptions concealed at one arbitrary instant. It printed `hides 0 disruption(s)` on a world where staleness was inert *and* on one where it hid a third of them. **A line that says the same thing in both cases carries no information at all**, and it was the one place this defect was visible for months.

  It now measures what matters — how many of this operator's disruptions the lag withholds *past the moment a warning could still help* — and the two worlds finally read differently:

  ```
  INRT  D-staleness:nordline   feed is stamped τ−90s,  withholds  0/127 disruption(s)…
  ok    D-staleness:nordline   feed is stamped τ−900s, withholds 54/127 disruption(s)…
  ```

  43 % against `npm run lead`'s independent prediction of 41 %, from a different calculation.

* **`INRT` is a third verdict, deliberately not `MISS`.** Absent and inert are different problems needing different fixes: the first is a projection that did not do what it was told, the second is two of the world's parameters that do not fit together. Conflating them would hide which one you have. An inert conflict is listed loudly and **does not fail the audit** — the committed world reports two of them and still passes gate 4, which is the honest reading: its projections are correct and its Tier-2 realtime component is decorative.

---

## 20. Gate 3's threshold is applied to a metric it was not ratified against — `settled 2026-09-03`

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

## 22. Nothing checks that a conflict a player is charged for is one they could notice — `built at P0M10`

Gate 1a will establish that the *information* needed to reconcile a world is present. Nothing establishes that a player who fails to reconcile it is given anything to work with.

**A conflict that silently subtracts capture with no observable consequence is not difficult, it is arbitrary.** The player loses and has no thread to pull, and no amount of skill converts into a better score. That is the failure mode `PLAYTEST-KIT.md` §5 calls *"the gate fails, informatively"* — they reach a scored run and cannot tell why it went the way it did — and it is the one discoverability problem that can be caught without a person in the room.

**Proposed check.** For each declared conflict, run the leave-one-in comparison the ablation already performs, but ask it of the **player-visible output** rather than of the score: does the scorecard, the attribution list or the trace differ between the world with that conflict and the world without it? A conflict that moves the score and moves nothing a player can see fails.

**It must produce a symptom, not a diagnosis.** `OBSERVABILITY.md` §8 defaults to the `attributed` disclosure level precisely because naming a cause hands over the answer key.

* *"Three travellers missed a connection you budgeted at 60 s that took 210 s"* — a thread to pull.
* *"`C-coordinate-offset:nordline` cost you 0.54 min"* — the solution.

The check is that the first exists, not that the second does.

**Why it is not sufficient**, and must not be described as measuring discoverability: a symptom existing in the output does not mean a person under time pressure will notice it, read it correctly, or know what to do about it. Only a playtest answers that (#3).

**Built:** `npm run symptoms`. It shares `conflictVariants()` with the ablation so the two instruments cannot drift apart, and its symptom vector — attribution causes, traveller failure reasons, Information event counts — **excludes the score**, since a conflict that moves the number and nothing else is the case being tested for.

**Silent is not automatically a failure.** A cosmetic conflict costing nothing *should* be invisible. Silent **and** costly is what makes a world arbitrary, so the output is read beside `npm run probe`.

**Known limitation:** one seed per run. A conflict whose symptom depends on which services happen to be disrupted can be missed, and the output says so.

---

## 23. Sudbahn's three platforms at Central are indistinguishable — `resolved at P0M10; the instrument was overstating`

Found by `npm run identifiability` the first time it ran.

Sudbahn publishes at Site granularity, so `r-central-1`, `r-central-2` and `r-central-3` all appear as a single stop:

```
sudbahn|1|Tsentralna|50.450200|30.514200
```

No other operator publishes those quays. **Nothing in the published data distinguishes them**, and they are spread over 98 m — so a traveller sent to "Tsentralna" faces up to **1.27 min** of walking that no solver can predict, against 3.35 min of headroom. That is **38 %**, over the provisional 25 % bar the audit ships with.

This is the declared `A-granularity:sudbahn` conflict working exactly as specified, which is what makes it worth recording rather than simply fixing: **a conflict can be correctly declared, correctly audited as present, and still ask a question nobody can answer.** The defect audit confirms it exists; only the identifiability audit says what it costs a player who cannot possibly resolve it.

**It got worse at P0M9 and nobody noticed.** That milestone added a third platform at Central to deepen the granularity conflict. It also widened the spread, and no instrument then existed to report the consequence.

**The connected problem, which is larger.** `P0a` routes on the canonical world, so it knows which platform. No player can. **The ceiling `capture` now normalises against is therefore unreachable by roughly this amount as well** — `SCORING.md` §2 fixed one unreachable ceiling on 2026-09-04 and this is a second, smaller one underneath it. `PHASES.md` Gate 1a anticipated exactly this: *solvable* should mean "the achievable optimum, **less the ambiguity floor**, is still meaningfully better than P1". The floor is now measurable and is not yet subtracted anywhere.

### The 38 % was a maximum measured against an average

The audit compared **the worst walk one traveller cannot predict** against **mean headroom across the whole population**. Those are not comparable quantities, and the mistake is this project's most familiar one wearing yet another hat.

Charging each ambiguity only to the travellers who could actually meet it:

| | |
|---|---|
| worst walk one traveller cannot predict | 1.27m — **38 %** of headroom |
| reachable by | **20 of 132** scored queries |
| worst cost across the scored population | 0.19m — **6 %** of headroom |

**Gate 1a passes at 6 %.** The instrument now thresholds the aggregate and reports both, and the second figure is still an over-estimate — every traveller who *could* meet the ambiguity is charged once, though not all are routed through it.

The world is fine. The instrument was wrong on its first outing, which is the fourth time an instrument in this project has needed correcting before its subject could be judged, and the reason the finding is left recorded rather than deleted.

**Options, if the aggregate ever does breach the bar:**

* Move a platform, or let Sudbahn publish two stops at Central rather than one — reduces the conflict, and the conflict is deliberate.
* Accept it and subtract the floor from `P0a` when normalising capture, so the ceiling matches what a player can actually reach.
* Ratify a higher threshold on the grounds that 98 m inside one station is realistic — large interchanges genuinely are this size.

**Owner:** no longer urgent for this world. The provisional 25 % threshold still wants ratifying, and the warning stands for generation: a generator producing Site-granularity operators over larger stations, or a query set that routes more travellers through them, would push the aggregate up with nothing to stop it. The audit is the thing that would notice.

---

## 24. Which conflicts bite is a property of the solver, not of the world — `answered at P1M4; difficulty is a profile`

P0M10 measured the same fifteen conflicts against two lazy solvers and got two different catalogues.

| conflict | costs `P2rt` (journey time) | costs the naive player (capture) | visible to the player? |
|---|---|---|---|
| `B-time-encoding:sudbahn` | **0.72m — the largest single contributor** | **0.000** | no |
| `C-coordinate-offset:nordline` | 0.54m | **0.514** | yes |
| `A-coordinate-precision:nordline` | 0.56m | 0.080 | yes |
| `C-delay-unit:nordline` | 0.21m | 0.000 | no |
| `D-staleness:nordline` | 0.04m | 0.000 | no |

`P2rt` loses 76 % of headroom across five conflicts. The naive reference player loses to **two**, and the conflict that dominates Gate 3's number costs it nothing at all — it parses `local_naive` timestamps correctly using the offset the brief states, so a conflict that defeats `P2rt`'s decoder is free to it.

**Difficulty is not a scalar property of a world.** It is a property of the (world, solver) pair, which P1M0 recorded as an aside and this makes concrete and quantified. Gate 3 measures `P2rt` because `P2rt` is *specified*; a real player may face an entirely different subset of the catalogue.

**This nearly produced a false finding.** The symptom check's first version read costs from `npm run probe` (`P2rt`) and symptoms from its own runs (the naive player), and was about to report `B-time-encoding:sudbahn` as **silent and costly** — arbitrary, the exact failure mode #22 exists to catch. It is neither: on the solver that cannot see it, it also does not pay for it. The check now measures cost and symptom in the same run on the same solver, and the eighth instance of this project's recurring error was avoided only because the rule had been written down after the seventh.

**What it means for the catalogue.** A conflict inert against one solver and severe against another is not thereby decorative. But "this world is hard" is not a statement that can be made without naming who it is hard for, and nothing in `CORECONCEPT.md` §7's tier ladder currently does.

**Proposed direction, not implemented.** Stop treating difficulty as a scalar and declare it as a **profile over the reference solutions** — what this world costs `null`, `blind`, `naive`, `P2rt` and `competent`. Those already exist, already run, and already disagree; the disagreement is the information.

Three things follow, and each is an improvement on the current position:

* **Gate 3 names its solver**, which it now does in prose and would then do in its output.
* **A tier becomes a shape rather than a number** — see the clearance-threshold proposal in `SCORING.md`, which needs exactly the same reference set for exactly the same reason.
* **P1M4's "two worlds are equally hard" becomes checkable.** Two worlds match if the *whole profile* matches, not if one baseline happens to agree. Under the current definition two worlds could match on `P2rt` and differ completely for everyone else, and nothing would notice.

The cost is that a world's declared difficulty stops being one number, which is worse for a leaderboard and better for every other purpose this project has.

**Owner: P1M4**, assigned 2026-09-04, and it cannot make its central claim without this. Two worlds could match on one baseline and differ completely for every other solver, and nothing would notice — so the exit now requires matching difficulty *profiles* rather than matching numbers.

---

## 25. The forgone-obligation penalty was specified as mandatory and never implemented — `fixed at P0M10`

`REFERENCE-POLICY.md` §8 named this hazard before any of it was built:

> If P1 produces tolerable outcomes and `declined` is scored gently, **the optimal strategy for a weak player is to decline everything** and let the simulator route its travellers for it. […] a half-built solution that answers badly could plausibly score worse than one that answers not at all.

Its structural fix — *"a fixed forgone-obligation penalty, independent of how the traveller subsequently fared"* — is called out as **"a requirement rather than a preference"**, and `SCORING.md` records adopting it. The code counted forgone obligations, attributed them in the scorecard, and never charged for them. A declined traveller received P1's outcome and contributed exactly zero to capture.

**The predicted exploit was live for ten milestones and was measured at P0M10**: the naive solution declines 42 of 132 obligations and outscores the competent solution, which declines 12. That is #17's entire explanation, and it was mistaken for a defect in the competent solution across two milestones.

**Implemented** as a share of the headroom each declined traveller represented, so it scales with the world rather than being an absolute number of seconds that means different things in different cities. `capture` now carries `capture − FORGONE_PENALTY_SHARE × (forgone / travellers)`, and the scorecard reports the deduction separately so its effect is visible rather than baked into one figure.

**The magnitude is PROVISIONAL.** §8 asks for "strictly worse than a competent answer and roughly comparable to a poor one" and fixes no number. The default of 1.0 forfeits the whole of what integration was worth to that traveller, which satisfies §8's other clause directly — *"one that declines everything loses everything"* — and the null solution now scores −1.0 where it used to score exactly 0.0.

It is worth ratifying deliberately, because the magnitude decides an ordering rather than a decimal place: at 0.5 the naive solution still outscores the competent one; at 1.0 it does not.

**Owner:** the project owner, for the magnitude only. The mechanism is required by a specification that calls it non-optional.

---

## 26. On 88 % of scored journeys there was no reachable headroom — `fixed at P0M10`

Measured at P0M10 while answering #17.

| | |
|---|---|
| scored queries with **any** headroom against clairvoyant `P0` | **36 of 120** |
| queries where `P0a` equals `P1` — **no reachable headroom at all** | **105 of 120 (88 %)** |
| mean reachable headroom where any exists | 9.97m |

On 88 % of this world's journeys, **the best anything could do knowing only what had been announced is precisely what a traveller does with no integration layer at all.** There is nothing for a player to win.

**And there is plenty to lose.** Cancellations are announced after a plan is made — the harness plans 30 minutes ahead — so any itinerary is exposed to them. A route with three transit legs is exposed three times; the reference policy's restricted transfer graph produces simpler routes and is exposed less. When a leg is cancelled the traveller stands on the platform until the scheduled departure and then waits for the next vehicle: **one full headway, 15 to 30 minutes.**

So a solution that reconciles the operators well, finds the cross-operator hops and uses the whole network takes more legs, more exposure and more headway losses — for headroom that, on seven journeys in eight, does not exist. **The competent solution is not bad at this world. It is playing a game that is 88 % downside.**

That is the whole of #17, and it explains the naive solution's flattering score twice over: it declines a third of its obligations, and the plans it does make are simpler and therefore less exposed.

**Where this came from.** P0M9 grew the query set from 22 hand-picked journeys to 132 by generating every Site pair at least 1500 m apart. The hand-picked ones were *chosen* to need integration — a tram chord that beats going via Central, an undeclared cross-operator hop. The generated ones are mostly radial journeys through Central with one obvious route, where integration has nothing to offer. Growing the world fixed the resolution problem P0M9 existed for and diluted the interesting journeys to about one in eight.

**Proposed fix, and it is a generator requirement rather than a patch:** *a scored query set must be sampled for reachable headroom.* A journey where `P0a == P1` tests nothing about integration and contributes only variance and downside risk. The selection criterion is computable before any solution exists — `P1 − P0a` above a threshold — and belongs with query-set generation in P1M2.

**Do not fix it by removing the risk.** Lowering the cancellation rate or the planning lead would make the existing journeys survivable, and would also delete the thing that makes realtime integration worth anything. The problem is not that risk exists; it is that 88 % of the journeys carry risk without carrying reward.

**What it means for the gates.** Gate 1's failure is now explained and is not a fact about the world's *solvability* — it is a fact about the query set. Gate 3 is unaffected: it attributes conflict cost by comparing two baselines over the same queries, and a query with no headroom contributes nothing to either side.

### Fixed by re-selecting the scored set

The criterion implemented is deliberately **not** the `P1 − P0a` this issue was measured with. That difference mixes the transfer graph with knowledge of the day, and disruptions are seeded — so a journey would drift in and out of the scored set depending on which services happened to be cancelled, and the set would stop being a property of the city.

Removing the day leaves the structural question, which is the one that matters: **does the unrestricted transfer graph beat the restricted one the reference policy is held to?** Where they differ, integration has something to offer. Where they agree, no amount of skill changes the answer.

`npm run headroom` measures it. On the 922-candidate pool, 79 journeys qualify at a two-minute threshold — an 8.6 % hit rate, which is why filtering alone was not enough and the candidate pool had to grow from 110 to 900.

| | before | after |
|---|---|---|
| scored journeys | 132 | **98** |
| of which integration can improve | **13** | **79** |
| of which deliberately straightforward | 119 | 19 |

The nineteen that remain straightforward are the hand-picked seeds, and they are kept on purpose: a set where *every* journey needs integration would not notice a solution that breaks the easy ones.

**Regenerating it is a two-step build**, documented in `city.py`, and deliberately so — the criterion needs the router, the router needs a built world, and duplicating the router in Python to break that cycle would guarantee the two drift apart:

```
TNS_QUERY_SELECTION=all npm run world:build   # every candidate
npm run headroom                              # prints the list
npm run world:build                           # the scored set
```

The chosen ids are checked into `city.py`, which means the list rots silently if the city changes. `src/scoring/test/headroom.test.ts` asserts the *property* the list was selected for rather than the list itself, and names the regeneration command in its failure message.

**The warning stands and is now recorded in code:** do not resolve this kind of problem by lowering the cancellation rate or the planning lead. That would make these journeys survivable and delete the thing that makes realtime integration worth anything. The problem was never that risk exists — it was that most journeys carried risk without reward.

**Owner:** P1M2 still owns the *generator* rule. This fixes the committed world.

---

## 27. The walking-skeleton test raced its own player on cold CI runners — `fixed at P0M10`

Intermittent in CI, never locally: `player at http://127.0.0.1:8220 never became ready`.

Both sides of the handshake waited **100 attempts at 50 ms — five seconds each**. The simulator waited that long for the player's `/v1/health`; the player waited that long for the control API to start answering, because the test spawns it *before* the API exists and it is expected to retry.

Five seconds is ample on a warm developer machine. On a cold runner, starting a runtime and parsing the source can consume most of it, and whichever side ran out first produced a failure that pointed at the other. The failing run took 5.7 s.

**Fixed** by making both waits deadline-based rather than attempt-counted, at 60 s for the simulator and 90 s for the player. The player's budget deliberately exceeds the simulator's: if it gave up first, the simulator would report "never became ready" for a process that was still trying. Waiting longer costs nothing when the player is quick, since both loops exit on first success.

**And the failure is now diagnosable.** The tests spawned players with stderr discarded, so a player that crashed on startup was indistinguishable from one that was merely slow — the CI log said only "never became ready", which sends you looking at the simulator. Stderr is inherited now, and both timeout messages say what they last saw.

**A note on the class of bug.** This is not a determinism failure and could not have been one: `PLAYER_BOOT_BUDGET_MS` is real time, at the boundary, and never enters the model. But it is the same shape as the rest of this milestone — *a number that was fine for the case it was written for and silently wrong for another*.

---

## 28. The offset audit compared each published stop with an unrelated quay — `fixed at P1M1`

`C-coordinate-offset`'s evidence line paired `timetable.stops[i]` with `quays[i]` positionally:

```ts
const quays = world.quays.filter((q) => own.has(q.id));
const drifts = timetable.stops.map((s, i) => Math.abs(s.lat - quays[i].lat) * 111_320);
```

Under `granularity: quay` those two lists happen to correspond. Under `granularity: site` they are different lists of different lengths — published *sites* against canonical *quays* — so the drift was a distance between two arbitrary points in the city. On the generated Tier-2 world it reported **668 m for a 130 m setting**; the true figure is 111 m.

It only ever produced a false *pass*, because the check is `drift > offset_m * 0.5` and the noise is large. That is the worse direction: a world whose offset conflict had silently vanished would still have audited `ok`.

**Fixed** by measuring displacement against *the same operator's own output with the conflict off*, keyed by stop id — `displacements()` in `src/projections/src/audit.ts`. That definition needs no correspondence between published and canonical entities, so it survives any granularity, and it isolates the setting under test from every other thing the operator does to geometry.

**Eighth instance of the recurring pattern**, and the first found by a generator rather than by reading: *a right number compared against the wrong thing.*

---

## 29. Realism was enforced per setting, and a generated world left the realistic band anyway — `fixed at P1M1`

Every catalogue setting carries a plausibility ceiling with a stated real-world cause, and `src/scoring/test/realism.test.ts` enforces them. The first generated Tier-2 world satisfied all of them and published stops **2,200 km from their quays**.

`nordline` had drawn three geometry settings at once — `C-latlon-order: lon_lat`, `C-coordinate-offset: 130`, `A-coordinate-precision: 3`. A lat/lon swap at 50.45 N, 30.51 E relocates a stop to Kazakhstan. The offset and the truncation were still declared, still audited, and completely unobservable underneath it: **the world declared three geometry conflicts and contained one.**

Two things were wrong, and both are now fixed:

* **Realism is a property of the combination.** A per-setting ceiling cannot see a total. `npm run realism` measures the composed displacement — every geometry setting an operator applies, against the quay each stop actually is — and holds *that* to the same 150 m ceiling. It runs on a world, so it catches combinations nobody anticipated, which is the specific risk `ROADMAP.md` names for generated worlds.
* **A conflict that masks another teaches one lesson instead of two.** The catalogue gained an `excludes` relation, and the generator honours it symmetrically. `C-latlon-order` excludes the three settings that merely nudge geometry; `D-no-delays` excludes `C-delay-unit`, because an operator that never publishes a delay has no delay unit to get wrong — which the generated Tier-3 world had also declared and not contained.

**The user constraint this serves**, ratified at P0M8 and now covering combinations as well as settings: *two operators can disagree about where a stop is; at 500 m apart that is a broken map, not a disagreement, and it teaches something other than integration.*

---

## 30. A conflict placed where the operator cannot express it — `fixed at P1M1`

The generated Tier-2 world declared `A-granularity:ostline` and the defect audit reported it MISS: "every published stop maps to exactly one quay". Publishing at Site granularity means one stop where there are several quays, and `ostline` serves a single quay at every station it calls at — so Site and Quay granularity publish exactly the same thing.

This is Phase 0's Sudbahn finding in a new form. Then it was a conflict placed where it *cost* nothing; here it is one that *exists* nowhere. The effect is the same and slightly worse: **a world quietly easier than its declared tier.**

**Fixed** by giving the generator enough about the network to know what an operator can express. `OperatorSpec` gained `collapsible_sites` — stations where the operator serves more than one of *its own* quays — and `generate.REQUIRES` maps a conflict to the capability it needs.

The first attempt at that count was wrong in an instructive way: it counted stations that *have* several quays, which gave `ostline` 1 and would have kept the bug. The projection groups only the quays that operator serves, so what matters is whether it serves several of them. Corrected, the counts are nordline 2, ostline 0, sudbahn 1 — matching the audit exactly.

**Standing risk:** `REQUIRES` covers `A-granularity` because that is the case the audit caught. Others may exist, and one is already visible in a weaker form: on the generated Tier-3 world `A-coordinate-source:ostline` displaces **1 of 10** published positions, because a site centroid and a quay position coincide wherever a station has one quay. The audit passes it — its bar is "more than zero" — and it is *present*, merely thin.

That is a different failure from this one and needs a different instrument: **present but negligible** is what `npm run symptoms` and the ablation are for, not the audit. Recorded here so the two are not confused. Tightening the audit's bar instead would be the wrong fix, since it would start rejecting conflicts that are genuinely present.

---

## 31. `python -m worldbuild --out path` silently built a world called `--out` — `fixed at P1M1`

The CLI takes a positional output path. Passing `--out ../worlds/gen-t2.world.db` made `--out` the path and discarded the rest, so two `--tier` builds reported plausible content hashes while writing to a junk file in `tools/` — and the audit that followed read a **stale bundle** and was believed.

Unknown options and surplus arguments now exit 2 with usage. The same silent default cost a whole measurement in Phase 0, when `refplayer/scripts/serve.ts` treated an unrecognised mode as `naive` (`#17`).

---

## 32. Tiers 3 and 4 generate the same world — `fixed at P1M4, by fixing #34`

With the generator wired up, the manifests for seed 481516 are:

| Tier | Declared conflicts | Manifests |
|---|---|---|
| 0 | 0 | clean |
| 1 | 2 | cosmetic only |
| 2 | 8 | |
| 3 | 13 | |
| 4 | 13 | **byte-identical to tier 3** |
| 5 | 13 | same settings, stronger values (staleness 300→900 s) |

Tiers 3–5 activate the same catalogue sections (A–D), so the only levers between them are `TIER_DENSITY` and the strength bias. 0.6 → 0.7 is a small step, and with twelve settings, one clean reference operator and the new exclusions, the placement is close to saturated by tier 3 — so the density lever has nothing left to buy.

**This matters to P1M1's exit and blocks P1M4's.** The exit asks that a generated world's ablation profile fall within the band its declared tier targets; if two tiers produce the same world, no band can separate them, and "two worlds at the same declared tier are equally hard" is trivially true for the wrong reason.

Levers that exist and are not yet used:

* **How many operators are dirty.** Every tier here leaves exactly one honest operator, because the rule is "the least-reaching one". A higher tier could leave a *smaller* honest operator, or none above some tier — though `#15` and the competent solution's consensus frame argue for keeping one.
* **Where the conflicts sit relative to the scored journeys.** P0M10 measured this as the dominant factor and the generator only approximates it by reach.
* **Catalogue sections E and F**, which arrive in Phase 3 and are the honest way to extend the top of the ladder.

**Owner:** P1M4, with `#24` — both are about what a declared difficulty means. Recording it here because the generator now makes it concrete rather than hypothetical.

### Fixed 2026-09-06, and not by touching the tier ladder at all

`#34` gave `D-staleness` three usable rungs where it had one. That was enough:

```
tier 0:  0 conflicts  differs
tier 1:  2 conflicts  differs
tier 2:  9 conflicts  differs
tier 3: 12 conflicts  differs
tier 4: 12 conflicts  differs      <- was IDENTICAL to tier 3
tier 5: 14 conflicts  differs
```

Tiers 3 and 4 still declare the same *number* of conflicts and are now different worlds — tier 3 draws staleness 450 and 900, tier 4 draws 600 and 900. **The lever the density parameter could not supply came from a setting's range**, which is exactly what this issue predicted when it said the fix needed "levers the conflict catalogue cannot supply" and `#34` answered that the catalogue could supply them after all.

**What is fixed is that the worlds differ. Whether they differ by the right amount is `#24`'s question**, and `npm run profile` is what answers it: two worlds are equally hard when every reference solution scores the same on both, and a tier ladder is real when consecutive tiers do not.

### Made narrower, not wider, by fixing #19

Filtering settings that cannot express themselves (`#19`) leaves `D-staleness` with **one** usable value out of three: 60 s and 300 s both sit at or below the minimum announcement lead and conceal nothing, so only 900 s survives. Staleness is now on or off with nothing in between.

That is the right trade — a declared conflict that exists beats three settings of which two are decorative — but it removes a rung the ladder appeared to have. After the filter, tiers 3 and 4 remain identical and tier 5 differs from them in a single setting (nordline's time encoding).

**The catalogue's `generate` list for `D-staleness` should be re-derived against `noticeLeadS` rather than left as `[60, 300, 900]`,** which was chosen when nobody was comparing the two. That is now `#34`, kept separate because it is a design question rather than a defect.

---

## 33. The content hash did not cover the operator manifests — `fixed at P1M1`

`content_hash.py` lists the tables it hashes, with a comment above the list:

> Adding a table means adding it here, deliberately — a table that is not hashed is a table whose reproducibility nobody is checking.

The `operators` table was added later and never added to the list. It holds every operator's manifest — **every conflict the world declares, and therefore the whole of what makes it hard.**

**Found by accident.** The generated Tier-3 and Tier-5 worlds reported the same content hash, `1888c5797d7d74d4`, while their manifests plainly differed: nordline published `epoch_ms` in one and `local_naive` in the other. Two worlds of different declared difficulty, indistinguishable to the hash that exists to name a world unambiguously.

**What it meant:**

* `python -m worldbuild --verify` — what CI runs — could not detect a change to the conflict configuration. The reproducibility check had a blind spot precisely where P1M1's generator writes.
* `DATA-MODEL.md` §6 says the hash is "a SHA-256 over a canonical serialisation of **every** table". It covered ten of eleven. Spec and code disagreed and the code was wrong.
* A world could be silently re-tiered with no artefact recording that anything changed.

**Fixed** by adding `("operators", "id")` to `TABLES`.

**The committed world's hash changed, and the world did not.** Hashing the current bundle under the old table list reproduces `54737165504f34b4` exactly; under the new one it is `f6028eedd79e3cb5`. Recorded scores are still comparable — what changed is what the identifier covers, not the city. Every score addressed by the old hash refers to the same world.


---

## 34. A conflict's settings are chosen without reference to the world they act on — `fixed at P1M4 for D-staleness; the method generalises`

Raised 2026-09-05, from `#19`. `D-staleness` is the case that exposed it, and it is unlikely to be the only one.

The catalogue offers `[60, 300, 900]` seconds. Two of the three conceal nothing on any world whose shortest announcement lead is 300 s, so the expressibility filter drops them and **staleness becomes a switch: off, or at the plausibility ceiling.** That is more honest than generating a conflict that does nothing, and it is a narrower ladder than the catalogue appears to offer — it costs `#32` a rung it needed.

**The generalisation, which is the actual issue.** A setting's *values* were chosen for plausibility alone — "what could a real operator do?" — and plausibility is necessary but not sufficient. Whether a value does anything depends on parameters chosen elsewhere: staleness against `noticeLeadS`, coordinate offset against the walking threshold and the density of alternative boarding points, delay units against the size of the delays. **Each of those pairs currently lives in two files and is compared in neither.** The expressibility filter compares one of them.

**Direction, from the ratification of 2026-09-05:** the ranges should be *derived* from the world's own parameters rather than listed as constants — defined in advance from the complexity of the world being generated, so that a tier's settings span a range that is both plausible and capable. Needs more study before anything is implemented.

Questions it has to answer, none of them settled:

* **What is a rung?** Equal spacing in the setting is not equal spacing in effect: staleness of 600 s conceals ~20 % of disruptions and 900 s ~41 %, so the *effect* is roughly linear in the setting here — but only because leads are drawn uniformly. Nothing guarantees that for another conflict.
* **Derived from what, exactly?** For staleness the answer is clean — some fraction of the announcement-lead range above its minimum. For `C-coordinate-offset` the equivalent parameter is not obvious, which is a reason to be careful about generalising from one worked example.
* **What happens at the top?** A range derived from the world can exceed the plausibility ceiling. The ceiling wins; the realism constraint is not negotiable, and a tier that would need an implausible setting is a tier the catalogue cannot currently reach (`#32`).

**Explicitly not done by picking numbers that make the tier ladder look reasonable** — that is choosing the answer first, the same reasoning that keeps the clearance thresholds unadjusted in `SCORING.md`.

**Owner:** P1M4, with `#32` and `#24`. All three are about what a declared difficulty means, and this one supplies a lever the other two need.

### Fixed for `D-staleness`, 2026-09-06 — state the ladder in effect space and invert

The question was whether to derive the range from parameters or estimate it by testing. **It derives**, and the derivation is an identity rather than a fit.

A stale feed conceals a disruption exactly when its lag outlasts that disruption's announcement lead, and leads are drawn uniformly from `noticeLeadS`. So the share of disruptions a lag of `s` conceals is

```
share(s) = clamp((s - lo) / (hi - lo), 0, 1)
```

which is exact, not approximate — `npm run lead` measures 41 % where this predicts 40 % at `s = 900`. **It inverts.** Choosing the *shares* and solving for `s` gives rungs evenly spaced in what they do rather than in what they are:

| target share | derived staleness | inside the 900 s ceiling? |
|---|---|---|
| 10 % | 450 s | yes |
| 20 % | 600 s | yes |
| 40 % | 900 s | exactly at it |

`generate` for `D-staleness` is now `[450, 600, 900]` instead of `[60, 300, 900]`, and **all three rungs do something** where two of the old three did nothing. The catalogue carries the rule in a `derived` field, and `src/schema/test/catalogue.test.ts` re-derives the list and fails if the two disagree — so changing `noticeLeadS` cannot silently leave the catalogue behind, which is how they drifted apart in the first place.

**A target past the plausibility ceiling is clamped, not dropped**, and a test then fails on the repeated rung. That is the honest way to say the ceiling has been reached: the ladder cannot be lengthened without leaving what two real operators would do, and the realism constraint outranks the ladder.

### What generalises, and what does not

**The method does:** state a rung by the effect it should have, solve for the setting against the world's own parameters, clamp at the ceiling, and test that the list still matches the rule.

**The identity does not.** `D-staleness` inverts cleanly because the effect is a share of a uniform draw. `C-coordinate-offset` has no such closed form — its effect depends on the network's stop spacing, on the walking threshold, and on the composed geometry budget of `#41`. For settings like that the second option in the original question — **estimate by testing** — is the right instrument, and `npm run probe` already sweeps a setting and measures its cost. Applying it is not done here.
---

## 35. Three separate consumers read milliseconds as seconds — `fixed at P1M2`

`naiveDecodeTime` in `src/scoring/src/baselines.ts` treated **any** published number as epoch seconds. `B-time-encoding: epoch_ms` publishes milliseconds, so nordline's departures landed 125 days out, `P2` could never board one, and it produced no workable plan on **158 of 200** journeys.

The consequence reached the calibration as a result nothing else explained:

```
    P0-P1    10.87m  headroom available to any player
    P0-P2    11.33m  what the conflicts cost a lazy integrator
    P1-P2    -0.45m  whether integrating lazily beats not integrating
  ! P1-P2 is negative: a lazy integration is *worse* than not integrating.
```

**The function contradicted its own docstring**, which is what makes this a bug rather than a design choice:

> It handles the *shapes* competently — a number is epoch seconds, a string with an offset is RFC 3339 — because failing to parse at all would make P2 collapse rather than degrade, and a collapsed baseline measures nothing.
>
> What it gets wrong is the thing that looks like it needs no decision: a timestamp with **no offset**.

Reading milliseconds as seconds *is* failing to parse a shape, and it produced exactly the collapse the comment forbids. The intended defect is the missing offset, and it still is.

**Fixed** by telling the two apart on magnitude, which is what "competent at shapes" requires and what every real integrator does: a timetable spans days, so a value that would be a month out read as seconds is milliseconds. The two encodings differ by a factor of a thousand, so nothing real sits in the gap.

**Why nothing found it for the whole of Phase 0.** The hand-built world uses `epoch_s` and `local_naive`; it never uses `epoch_ms`. The catalogue offered the value, no world had ever selected it, and the first generated world did. This is the risk `ROADMAP.md` names in as many words — *a generator will produce combinations nobody thought about* — landing on the reference solutions rather than on the world.

**The committed world is unaffected**, which was checked rather than assumed: `npm run calibrate` on `m1` gives 33 fallbacks and gaps of 8.37 / 5.17 / 3.20 m before and after, identical. Every Phase 0 result remains comparable.

**`npm run fallback` exists because of this**, and is the instrument that found it. It switches each declared conflict on alone over an otherwise clean world and counts the journeys where `P2` gives up. The aggregate could not say which conflict was responsible, and the manifest could only have supported a guess:

```
    conflict                          fell back    over clean    P1-P2
    no conflicts                         38/200                   7.47m
    B-time-encoding:nordline            158/200         +120     -0.89m
    A-coordinate-source:nordline         66/200          +28      5.99m
    ...
```

One row at +120 against a field of +16 to +28 is not a conflict doing its job. **A conflict that removes most of the query set has stopped being a conflict and become a wall.**


### The world, fixed at P1M2

`city.py` raised both staleness settings to **900 s** — nordline from 90, sudbahn from 300. That is the plausibility ceiling, it carries its own stated cause (a five-minute rebuild behind a cache with its own TTL), and it is the only value in the catalogue's `generate` list that survives the expressibility filter, so it is what a generated world of this tier now produces.

**The Information family now registers a realtime conflict**, which is the thing this issue exists to ask about. Twelve paired seeds, same player, declared world against one with honest values:

| staleness | declared | honest | effect | se | σ |
|---|---|---|---|---|---|
| 90 s / 300 s — before | 0.7044 | 0.7023 | −0.0020 | 0.0145 | **0.1** |
| 900 s / 900 s — after | 0.5545 | 0.7023 | **+0.1479** | 0.0259 | **5.7** |

The counts say it is the right mechanism rather than a coincidence: in-time warnings fell from 18.5 per run to 12.9 and late ones rose from 2.6 to 8.2, while silent stayed at 9.4 — a stale feed converts *warnings that arrive in time* into *warnings that arrive late*, which is precisely what staleness is. The honest-world column is unchanged, as it must be: a world with honest values has staleness 0 either way.

**The journey-time calibration is untouched** — 8.37 / 5.17 / 3.20 m and 33 fallbacks, identical before and after. That is not a surprise and is worth stating: `P0`, `P1` and `P2` all plan on the published timetable and none of them reads the realtime feed, so staleness cannot reach them. It reaches `P2rt`, the Information family, and a player.

**The committed world's content hash moved** from `f6028eedd79e3cb5` to `ce3925325dbd8b0a`. Unlike `#33`, this is a genuine change of world rather than of what the hash covers: **scores recorded against the old hash are not comparable on catalogue D**, though the journey-time gaps happen to be identical.

### And it was in three places, not one

Found while auditing what P1M1 and P1M2 had left open. The fix above corrected the *lazy integration baseline*; the same statement — "a number is epoch seconds" — appeared independently in two more consumers of the same feed, each with a docstring claiming to handle the shapes competently:

| where | what it does | how it failed |
|---|---|---|
| `scoring/baselines.ts` | `P2`, the lazy integrator | departures 125 days out; no workable plan on 158/200 journeys |
| `refplayer/player.ts` | the **naive reference player** | takes the result `% 86400`, and `10800000 % 86400` is **exactly 0** |
| `refplayer/competent.ts` | the **competent reference player** | same statement again |

**The second is the dangerous one.** Modulo a day, a millisecond value does not land somewhere obviously absurd — it lands at midnight, a perfectly plausible time. It would not have produced a crash or an empty plan; it would have produced a player that quietly planned around wrong departure times, on any world using `epoch_ms`. Gate 1 and Gate 2 are measured with these two players.

**Nothing had run them against such a world.** The committed world publishes `epoch_s` and `local_naive`; only generated worlds reach `epoch_ms`, and P1M2's generated worlds were measured with `calibrate`, `audit`, `realism`, `headroom` and `identifiability` — none of which runs the reference players. The gap was between two sets of instruments, and neither was wrong.

**Fixed** by moving the rule into `@tns/schema` as `publishedEpochSeconds`, which all three now call. `src/schema/test/published-time.test.ts` checks the rule *and* checks that none of the three restates it — the failure was never one wrong function, it was **three independent copies of one rule, which will eventually disagree, and did.**

> The generalisation, and it is the same one `#19` reached about `noticeLeadS` from the other direction: **when two or more places must apply the same rule, the rule needs one home.** #19 was two numbers that were never compared; this was one rule written out three times. Both produce a system that is locally reasonable everywhere and wrong overall.
---

## 36. A generated world declared whatever tier the hand-built one is — `fixed at P1M2`

`build.py` wrote `("tier", "2")` into every bundle's manifest, unconditionally. So `python -m worldbuild out.db --tier 5` produced a world whose conflicts were sampled for Tier 5, whose brief announced **Tier 2**, and whose scorecard was graded against Tier 2's clearance bar of 0.25 instead of Tier 5's 0.45.

Two numbers that had to agree, written in different places, compared by nothing — the same shape as `#19`'s staleness against `noticeLeadS`, and as `#35`'s three copies of one rule.

**Found by reading a progress line**, not by a test: `npm run gates` on a world built with `--tier 3` printed `world seed 481516 · tier 2 · 3 operators · 13 conflicts`. Thirteen conflicts is a Tier-3 count; the tier beside it was not.

**Fixed** — the manifest records the tier that was asked for, and the hand-authored city keeps Tier 2 because that is what it is. `CLEARANCE` already covers 0-5, so nothing else needed changing.

**It matters to P1M4 more than to now.** Tier clearance and difficulty profiles are both keyed on the declared tier, and until this was fixed every generated world claimed the same one — which would have made "two worlds at the same declared tier" trivially true for the wrong reason, alongside `#32`.

---

## 37. Two instruments could not be pointed at a generated world — `fixed at P1M2`

`npm run horizon` and `npm run failures` loaded `worlds/m1.world.db` as a **relative** path with no argument. They therefore worked only from the repository root, and only on the committed world.

`CLAUDE.md` now says every per-world instrument must run against every generated world, and P1M1 and P1M2 fixed `symptoms`, `gates`, `stability` and `information` for the same reason, one at a time as each was needed. These two were simply never needed until the sweep that produced this entry.

**Fixed**, and the whole set was swept rather than these two spot-checked: all fifteen scripts under `src/*/scripts/` now take a world path and resolve it against the repository rather than the shell's working directory.

---

## 38. Reach-weighted placement concentrates conflicts until the network's own operator is unusable — `fixed at P1M2`

The first time `npm run gates` was pointed at a generated world — possible only after `#35`, `#36` and `#37` — it **failed**.

```
mode        capture   information   headline   arrived
null         -1.000         0.000     -0.600   183/200
blind        -1.252         0.000     -0.751   180/200
naive        -1.252         0.213     -0.666   180/200
competent    -0.044         0.533      0.187   172/200

1a PASS   1b PASS   1c PASS by decision   2 PASS
3 FAIL — conflicts cost 2.23m, 20% of 11.35m headroom, bar is above 20%
```

Two things are wrong, and the second is the serious one.

**Gate 3 fails by a hair** — 2.23m against a bar of more than 20 % of 11.35m. On its own that would be a marginal world, not a defect.

**`null` outscores `naive` and `blind`.** Declining every obligation beats attempting them, which is the pathology `#26` named at P0M9: *every extra leg a player takes is exposure without reward*. Gate 2 still passes, because it measures separation rather than order, and `gates.ts` reports the inversion under "regression detector — not a gate".

### It is the placement, not the network and not the player

Same naive player, three worlds:

| world | forgone | faster than P1 | player_error |
|---|---|---|---|
| `m1`, Tier 2, conflicts split 7 / 7 | 27/98 (28 %) | 25 | 0 |
| generated, **Tier 0 — no conflicts at all** | 84/200 (42 %) | 47 | 0 |
| generated, Tier 3 | **190/200 (95 %)** | 1 | 5 |

A conflict-free generated network is fine: the player plans most journeys and beats the reference policy on 47. Add Tier-3 conflicts and it declines 95 % of obligations. **The network is not too hard; the conflicts are not distributed like a world.**

| | conflicts on the dominant operator | that operator's share of the network |
|---|---|---|
| `m1`, hand-authored | nordline **7 of 15 (46 %)**, sudbahn 7 | 39 of 58 line-stops |
| generated | nordline **10 of 13 (76 %)**, ostline 3 | 44 of 66 line-stops |

`generate.py` weights placement by reach, on P0M10's finding that moving conflicts onto the operator carrying the network doubled their cost. **Unbounded, that finding becomes a wall.** The operator carrying two thirds of the line-stops collects three quarters of the conflicts, its feed stops being usable, and a player who ignores it entirely does better than one who tries — which is the `npm run fallback` distinction, one level up: *a conflict that removes most of the query set has become a wall.*

The hand-authored world does not do this. It splits conflicts between the **biggest** operator and the **smallest**, and leaves the middle one clean. P0M10's lesson was "do not put them all on the smallest", and it was implemented as "put them in proportion to reach", which is a stronger claim than the measurement supports.

### The fork, not yet decided

* **Cap the share any one operator may carry.** The world known to pass every gate sits at 46 %. Grounding a bound in that is evidence rather than tuning — but it is still a difficulty decision.
* **Choose the clean reference by usefulness rather than by smallness.** The generator keeps the *least*-reaching operator honest, so the clean feed is nine line-stops of sixty-six — enough to be a coordinate reference, not enough to route on. `m1` keeps a middle operator clean.
* **Neither, and accept that Tier 3 is this hard.** Hard to justify while `null` beats `naive`: that is not difficulty, it is a world that punishes participation.

**Not fixed on the spot deliberately.** `PHASES.md`: *a failed gate is a legitimate outcome and must be allowed to stop the project rather than be tuned away.* Choosing a placement bound changes what every generated tier means, so it was put to the project owner rather than picked.

### Fixed, 2026-09-06 — the cap, and the reason it was needed

The bound was chosen, with a domain argument that turned out to name a second defect:

> Companies don't try to cover all stops with a single route; they cover their own region. One company runs star-shaped routes from the centre to the outskirts, while another connects the ends in a loop, travelling between regions without passing through the centre. **A single operator cannot cover most of the stops.**

That is a statement about **reach**, not about conflicts, and it identified something the analysis above had treated as given. The generator was assigning the radials *and* the ring to the same operator — so of course it reached two thirds of the network. The role description had always put the ring on the other operator: connecting the ends without going through the centre is precisely the journey a star-shaped operator serves badly.

Two changes, in that order:

**The ring changed hands**, and `chords` rose from 2 to 4 so the ring operator is a network rather than a garnish. `NetworkSpec.max_reach_share` now states the rule and `generate_network` checks it.

| | before | after |
|---|---|---|
| nordline — radials | 44 of 66 (**67 %**) | 36 of 76 (**47 %**) |
| ostline — ring and chords | 13 (19 %) | 31 (40 %) |
| sudbahn — regional | 9 (13 %) | 9 (11 %) |

**Then the cap**, `generate.MAX_CONFLICT_SHARE = 0.5`. A conflict over the bound is **moved** to another operator that can express it, not deleted — the tier's density is a separate claim and should not quietly fall because placement was rebalanced. The move obeys the same three rules placement does: capability (`REQUIRES`), exclusion, and expressibility. Conflicts now land 46 / 53 rather than 76 / 23.

**The result, same player, same 200 journeys:**

| | before | after |
|---|---|---|
| obligations forgone | 190/200 (**95 %**) | 37/200 (**19 %**) |
| journeys beaten against `P1` | 1 | **46** |
| replans | 9 ok, 5 player_error, 1 no_route | **93 ok, none failed** |

For comparison the hand-authored world forgoes 27 of 98 (28 %). The generated world is now *less* punishing than the one every Phase 0 result was measured on, while carrying more headroom.

**What the shuffle exposed:** two conflicts that could not express themselves on a generated city at all — `KNOWN-ISSUES.md` #39. Neither was caused by the rebalance; it only moved them somewhere their silence was visible.

### A generated world now passes every gate

```
mode        capture   information   headline   arrived
null         -1.000         0.000     -0.600   172/200
blind         0.014         0.000      0.008   172/200
naive         0.014         0.424      0.178   172/200
competent     0.394         0.565      0.462   169/200

1a  PASS   8.89m reachable of 10.95m; ambiguity 1 % against a 25 % bar
1b  PASS   a lazy integrator captures 0.441 of reachable headroom
1c  PASS by decision
2   PASS   four distinct scores, in the order REFERENCE-POLICY.md §8 wants
3   PASS   conflicts cost 3.04m, 28 % of 10.95m headroom, bar 20 %
```

The ordering is the part worth reading twice. Before: `null` −0.600 beat `naive` −0.666 and `blind` −0.751 — declining every obligation outscored attempting them. After: `null` −0.600 < `blind` 0.008 < `naive` 0.178 < `competent` 0.462, which is what §8 asks for and what the hand-authored world produces.

Gate 3 went from **20 %** (a marginal fail against a bar of *more than* 20 %) to **28 %**, and the conflicts cost 3.04m — almost exactly the committed world's 3.01m, on a world with more headroom.

**One diagnostic is not clean:** the audit column reports `LEAK` for every solution that plans, which is `KNOWN-ISSUES.md` #40 and not a gate.

### Also learned

`npm run gates` on a 200-journey world takes **~40 minutes** — 28 for the four solutions, 12 for the ablation. P1M4 has to compare worlds pairwise across seeds, so this is a real constraint on that milestone rather than an inconvenience. `network.SCORED_TARGET` is the lever, and 200 buys only a little resolution over 98: seed-to-seed scatter fell from 10 % to 7 %.

---

## 39. Two conflicts that could not express themselves on a generated city — `fixed at P1M2`

Both surfaced the moment `#38`'s rebalance moved conflicts onto an operator that had not held them before. Neither is about the rebalance; it only shuffled the deck enough for them to show.

### `C-coordinate-offset: 60` under `A-coordinate-precision: 3`

The audit reported `published positions sit a median 0 m from where this operator would put them unoffset (manifest declares 60 m)`.

Three decimal places is a **~111 m grid**. A 60 m offset moves a point less than half a cell, so it usually rounds back to where it started and vanishes. Declared, audited, and absent.

This is `#29`'s masking relation one level down. `excludes` handles the categorical case — a lat/lon swap destroys geometry, so nothing subtler beneath it is visible. **This is the numeric case, and it needs arithmetic rather than a list:** an offset must exceed the grid its own published precision rounds onto. `generate._masked` checks it in both directions, since either setting may be placed first.

### `A-naming: colloquial` on a city nobody wrote a phrasebook for

`publishedName` implemented the colloquial variant as a **hard-coded lookup of the hand-authored city's place names** — five entries, "Central Square" to "Tsentralna" and four termini. A generated city's places are not in it, so the function returned the official name unchanged and the conflict did nothing: **one name rewritten in thirty-three**, and MISS outright on an operator whose stops happened to include none of the five.

A lookup of one city's names is not a naming defect; it is that city's phrasebook.

**Fixed** by keeping the table for the names it knows — so the committed world's published names are unchanged where it hits — and falling back to the rule locals actually follow: keep the distinctive part, drop the descriptive tail. "Linden Park tram stop" is "Linden"; "Foundry Gate" is "Foundry". Two places differing only in that tail collapse onto one published name, which is the reconciliation problem `A-naming` exists to pose.

**The committed world's published names do change** for places outside the table — `A-naming:nordline` goes from a near-no-op to 14 of 31 names rewritten. **No score moves**, and that was checked rather than assumed: `npm run calibrate` on `m1` gives 8.37 / 5.17 / 3.20 m and 33 fallbacks before and after. Published names are carried by every solver and used for matching by none, which is exactly the caveat `CORECONCEPT.md` §2.1 attaches to `A-naming`'s measured zero — *the lazy baseline matches on geometry and never consults a name.*

**This is P1M3's job, arriving early.** Name generation has to produce names *and* their variants; a generated world cannot borrow another city's phrasebook. The fallback rule is enough to make the conflict expressible, and no more than that.

---

## 40. `route` is not optimal, and not even monotone — `open, and larger than it first looked`

> **Retitled at P1M4.** This began as "the information-set audit's bound is beaten by a traveller that never replanned". The bound was sound; the router underneath it is not. The investigation is kept below because the elimination is what identified the cause.

`npm run gates` against a generated world reports `LEAK` in its audit column for every solution that actually plans. The committed world reports `clean` for all four.

That column is **`auditInformationSets`, not the P0 quarantine** — two different checks that are easy to confuse, and the scorecard's own verdict on the same run is `scored`, with **zero** travellers arriving sooner than perfect information allows. So nothing beat the oracle. What was beaten is the audit's own, stronger bound.

```
  scorecard verdict          scored
  travellers beating P0      0
  plan obligations checked   200
  beat their own information 1

    g020  by 5.7m  (23.6m against a bound of 29.3m)  0 replan(s)
```

### Why one finding in two hundred is still a problem

The bound's soundness argument is explicit in `information-set.ts`:

> Take the optimal plan available under what had actually been served, and its predicted arrival. Reality only ever adds delay and cancellation — it never makes a journey quicker than planned — so any player restricted to that information realises a time no better than this prediction, even if it picks a different plan.

That chains to `realised ≥ predicted_player ≥ predicted_optimal = boundS`. A traveller realising **23.6 m against a bound of 29.3 m** breaks the chain, so one of its links is wrong.

**The obvious explanation is excluded.** A replan is answered later, with information that did not exist at plan time, so a journey that replanned could legitimately beat a plan-time bound. `LeakFinding.replans` was added to test exactly that, and this traveller replanned **zero** times. The generated world's 93 replans against the committed world's 20 made replanning the natural hypothesis, and it is wrong.

By elimination the remaining candidate is that **`route` is not returning the optimum** on the bound's index — the same search the oracle uses. `MAX_ROUNDS = 4` was the first guess and is also excluded: raising it to 6 changed P0's mean journey time on this world by nothing at all.

### What it does and does not affect

* **It is not a gate.** The audit column is diagnostic; the verdict comes from Gates 1a, 1b, 2 and 3.
* **It does not quarantine anything.** The scorecard's own check — beating P0 — is clean.
* **It does undermine a bound the project relies on for forensics.** `OBSERVABILITY.md` §5 makes this audit the procedure for a suspicious score, and a bound that honest players beat is the failure its own comment warns about: *"A bound that flags honest players is worse than no bound."*

### The cause, found at P1M4

`npm run leak` gained one more column — the same query routed on a day where **nothing goes wrong**, which is the most optimistic prediction anything can make:

```
g020  by 5.7m  (23.6m against a bound of 29.3m)  0 replan(s)  perfect-day optimum 29.3m
```

The perfect-day optimum *equals the bound* and the player beat both. A journey achieved on a day that had disruptions cannot beat the best journey on a day that had none — unless the thing computing "best" is wrong.

**Confirmed directly, and it is worse than one query.** Routing every scored journey twice, once on a clean index and once with disruptions applied:

| world | queries where disruptions made the route *better* | worst |
|---|---|---|
| generated | **28 of 200** | 18.1m |
| committed `m1` | at least 1 | 10.0m |

`buildIndex` drops cancelled journeys and adds a positive `delayS` to the rest. **A disruption can only remove a journey or delay it**, so a disrupted index offers a subset of the clean one's options, each no earlier. Routing on it cannot produce a better answer. That it does means `route` is not returning the optimum, and the search is not even monotone in its own input.

**Every number this project produces goes through it** — `P0`, `P0a`, `P1`, `P2`, `npm run headroom`, the ablation, and the bound that started this. It has been there for the whole of Phase 0: the committed world violates it too.

### What was tried and excluded

* **Replanning.** A replan is answered with later information and could legitimately beat a plan-time bound. The flagged traveller replanned **zero** times.
* **`MAX_ROUNDS = 4`.** Raising it to 6 changed the mean journey time by nothing — and then, more carefully, changed *this query* by nothing either.
* **Mismatched access sets.** The audit, the oracle and the harness all read the same `world.queryAccess`.
* **The ride phase reading a map it mutates.** `best` is written during the same round it is read from, in alphabetical order, so one round chained several rides for some quays and one for others — which makes `MAX_ROUNDS` not a transfer bound and the result order-dependent. Reading a start-of-round snapshot instead is defensible on its own, **and changes nothing**: 28 violations before, 28 after, worst 18.1m in both. The change was reverted rather than kept, because a correct-looking edit that perturbs every score and fixes nothing measurable is exactly what this project has learned not to ship.

### The target

`src/router/test/monotone.test.ts` asserts the property on both worlds and is marked `todo`, so CI stays green while the target stays visible. **Monotonicity is a usable specification for a search whose optimum nobody has an independent way to compute**: it is cheap to state, cheap to check, and needs no knowledge of the right answer.

Not fixed here. It is a correctness bug in the router's core search, it invalidates no *comparison* made so far — every baseline and every solution goes through the same `route`, so they have all been handicapped identically — but it does mean **headroom is understated** and every absolute journey time is an upper bound rather than an optimum.

### Also fixed at P1M2, and the reason this took so long to look at

`auditInformationSets` had no entry point. A quarantined scorecard says *"run the information-set audit before trusting this score"* and there was no way to run it. `npm run leak [world] [mode]` is that command.

---

## 41. The 150 m ceiling is for the *composed* displacement, and only the offset was held to it — `fixed at P1M3`

`npm run realism` on a generated world:

```
    operator      median     max    verdict
    nordline       125 m   207 m    plausible
    ostline        151 m   204 m    BROKEN MAP
```

Over by a metre, with `source: site`, `offset_m: 130` and `precision: 3` all on one operator. Every setting inside its own bound; the total outside.

`C-coordinate-offset`'s plausibility ceiling is 150 m and its stated cause is **"a station centroid published for a specific quay at a large interchange"** — that is a description of the *total* displacement a published position may carry. But the catalogue's `generate` list is the offset **alone**, and an operator publishing site centroids has already spent part of the budget before its offset is applied. Nothing compared the two.

This is `#29` a third time, and the pattern is now unmistakable: **a ceiling on a part, applied as though it were a ceiling on the whole.** First a lat/lon swap made subtler geometry invisible; then a coarse precision rounded a small offset away (`#39`); now a site centroid and an offset spend one budget twice.

**Fixed** by `generate._geometry_over_budget`: when an operator publishes site centroids, its offset is capped at the ceiling less what the centroid already costs.

**The budget is a budget, not a prediction.** The displacements are vectors in different directions and partly cancel — 35 m of centroid plus 130 m of offset measured 125 m, not 165 m — so a rule that assumed the sum would reject combinations that measure fine. The constant is the *median* centroid displacement of a generated city, measured rather than assumed.

**It costs geometry strength**, and that is the honest trade: composed displacement across three seeds fell from 125–151 m to 42–129 m, because `offset_m: 130` is no longer placeable beside `source: site`. A weaker conflict that exists beats a stronger one that describes a broken map — and the realism constraint is the one line this project has never allowed a failing gate to push it across.

**It also cost Gate 3 six points**, and the gates were re-run rather than assumed:

| | before the budget | after |
|---|---|---|
| Gate 3 — conflicts as a share of headroom | 3.04m, **28 %** | 2.39m, **22 %** |
| Gate 1b — lazy integrator captures | 0.441 | 0.383 |
| ordering | null < blind < naive < competent | unchanged |

All three gates still pass, and the margin over the 20 % bar is now **two points** rather than eight. That is thin enough to matter: a generated Tier-3 world is close to failing Gate 3 for want of geometry strength it may not take without describing a broken map.

**Which is a finding about the catalogue, not about this world.** `C-coordinate-offset`'s `generate` list is `[30, 60, 130]`, and once a budget is shared with `A-coordinate-source` the usable values are 30 and 60 — both of which `#39`'s masking rule then requires a precision of 4 or better to survive. The three geometry settings are more tightly coupled than the catalogue's independent lists suggest, and the ladder has less room than it appears to. **Owned by `#34`**, which is exactly the question of deriving a setting's range from the world it acts on rather than listing constants.


---

## 24 (continued). The answer: a profile, and a tolerance that is measured rather than chosen

Ratified 2026-09-06. **A world's difficulty is the vector of what each reference solution achieves on it**, not a scalar. `npm run profile <world> [other] [seeds]` reports it:

```
  DIFFICULTY PROFILE — worlds/m1.world.db
  declared tier 2, 98 journeys

    reference    headline    capture   information   arrived
    null         -0.600 ±0.000  -1.000    0.000      94%
    blind        -0.163 ±0.033  -0.271    0.000      83%
    naive         0.079 ±0.005  -0.271    0.605      83%
    competent     0.239 ±0.024  -0.008    0.610      84%
```

Four solutions, four columns each. The row that makes the case for a vector is `blind` against `naive`: **identical capture, and an information score 0.605 apart.** A scalar difficulty reports one number for that pair; two worlds could agree on it and disagree completely about whether realtime truthfulness matters, and nothing would notice.

### The tolerance

Given a second world it reports the paired difference per reference, against **the spread of one world measured twice** — taken from the same runs, so there is no separate calibration and no assumed bar. *A difference smaller than a world's own disruption draw moves it is not a difference.*

That is the "stated tolerance" `ROADMAP.md` P1M4 asks for, and it is stated as a *comparison* rather than a number for the same reason the clearance ladder is: a threshold nobody has measured is a guess, and this project has lost milestones to guesses of exactly that shape.

### What it still does not say

Matching profiles say two worlds are equally hard **in aggregate**. They do not say the worlds are hard **in the same way** — only a solution built for one and run on the other says that. That is the second half of P1M4's exit and the harder one, and it is not done.
---

## 42. Two worlds at the same declared tier are not equally hard — `fixed at P1M4 by a calibration search`

The first thing `npm run profile` was pointed at was P1M4's exit criterion. It fails.

Two independently generated worlds, both declared Tier 3, seeds 481516 and 20260906, three seeds each:

```
    reference     world A    world B   difference    noise   verdict
    null         -0.600   -0.600     0.000    0.000   within noise
    blind         0.025    0.057     0.031    0.045   within noise
    naive         0.153    0.288     0.135    0.069   2.0x noise
    competent     0.355    0.496     0.141    0.085   1.6x noise
```

World B is materially easier for anything that integrates. `null` and `blind` agree — neither reconciles anything, so neither notices — and **the two references that do the work disagree by twice the noise.**

That shape is itself the argument for `#24`'s profile. A scalar difficulty taken from `blind` would have called these worlds identical; taken from `competent` it would have called them far apart. Only the vector says *which solvers* the worlds differ for, and the answer here is "exactly the ones that matter".

### What it is not

**Not the tolerance being too tight.** The bar is the world's own seed-to-seed spread, measured from the same runs. A difference twice that is not a measurement artefact.

**Not obviously the conflict count.** Both worlds declare Tier 3 and the generator's density lever is the same; what differs is which conflicts landed on which operator, at which strength, against a different network draw. That is `#32`'s residue: tiers now *differ from each other*, and nothing yet makes two worlds of the *same* tier agree.

### What would need to change

* **The tier would have to be declared in terms of measured effect rather than sampled settings.** A generator that samples a catalogue at a declared density produces a distribution of difficulties, not a difficulty. A **calibration search** — generate, profile, adjust, regenerate — is the obvious answer and is a substantially larger mechanism than anything P1M1-P1M3 built.

> **Not to be confused with "closed loop"**, which in this project means passengers bound to the player's endpoint so that a player's advice changes the world (`CORECONCEPT.md` §370) — a Phase 2 runtime mode, explicitly outside the MVP. A calibration search happens at *build* time, changes nothing about how a run is scored, and leaves the MVP open loop. The reference solutions appear in it as measuring instruments, not as players.
* **Or the tier's claim would have to weaken**, from "these two worlds are equally hard" to "these two worlds are drawn from the same difficulty distribution, whose spread is *this*". That is honest, cheap, and probably not enough for the assessment use case `ROADMAP.md` names.

**Three seeds is few**, and the noise column is a standard deviation from three samples. More seeds would tighten it — and would move the verdict *against* the generator, not for it, since a better noise estimate is a smaller one.

**Blocks P1M4's exit**, which is the phase exit. Recorded rather than worked around: `PHASES.md` says a failed gate must be allowed to stop the project rather than be tuned away, and a failed exit is the same thing one level up.

---

## 43. A tier whose quota exhausts its section has no variety — `open, and narrow`

Surfaced by the determinism test the moment `#42`'s quota sampler landed: two different seeds produced the **same** Tier 1 world.

Tier 1's quota asks for two settings from section A, and the catalogue holds exactly two cosmetic ones — `A-id-scheme` and `A-naming`. Every Tier 1 world therefore draws both, and the only freedom left is which naming variant. There is nothing for the seed to choose.

**That is a true statement about the ladder rather than a defect in the sampler**, and it is the cost of fixing `#42`: a quota buys composition at the price of variety, and a rung whose quota equals its section's size pays the whole price. Tier 1 is the narrowest rung and pays it entirely; tiers 2–5 have room and still vary.

**It matters more than "Tier 1 is dull" suggests.** `PHASES.md` wants two worlds of a tier to be different worlds of comparable difficulty, and a tier that produces one world satisfies the second half by satisfying the first vacuously — the same shape as `#32`, where equal difficulty was trivially true because the worlds were identical.

**Options, none chosen:**

* **More cosmetic settings.** `CORECONCEPT.md` §2.1 lists candidates already catalogued as texture — ID instability, ID reuse — that would give section A room at the cosmetic end. This is the honest fix and it is content work.
* **Quota below section size**, so a rung always leaves a choice. Cheap, and it makes Tier 1 thinner than the ladder intends.
* **Accept it and say so** — Tier 1 exists to be recognisable rather than varied, and one Tier 1 world may be all anybody needs.

`tools/tests/test_generate.py` asserts reproducibility for every tier and variety only for the tiers that have room, naming this issue where it stops asking.

---

## 44. The naive player hung on a generated world — `fixed at P1M4`

Found while re-testing `#42`. A generated world **hung the naive reference player outright**. `null` and `competent` finished on the same world; nothing timed out, because the player was busy rather than stuck on I/O, and no budget covers a spin.

The cause is the walk back through the predecessors:

```ts
let cursor: string | null = chosen;
while (cursor !== null) {
  const label = best.get(cursor);
  if (!label || !label.leg) break;
  legs.push(label.leg);
  cursor = label.prev;          // no guard
}
```

Labels are relaxed as better arrivals are found and `prev` is overwritten in place, so the chain can contain `A -> B -> A`. There was nothing to stop it.

**The hang is fixed.** A cycle now makes the player decline: a reconstruction that cannot produce the itinerary the search claims to have found is not a plan, and truncating the chain would hand the simulator an itinerary that does not start where the traveller does — a wrong answer dressed as a right one.

### The cycle itself is not fixed, and it is common

With the guard in place, `naive` on that world scores **−0.584** where it scored 0.153 before. It is declining most obligations, so **cycles are frequent rather than exceptional**.

That should not be possible under strictly-improving relaxation. If `A -> B` improved `B`, then `arrive(B) > arrive(A)`; returning to `A` from `B` costs at least the minimum transfer, so it cannot improve `A`. A cycle therefore implies the improvement test is not doing what it appears to — the same shape as `#40`, where a search that looked like Dijkstra was not monotone in its own input, and quite possibly the same root cause in a different implementation.

**The committed world is unaffected**: `m1` scores 0.076 for `naive`, identical before and after, and the whole suite is green. The bug needs world A's particular geometry to surface — which is exactly why it survived Phase 0.

**Consequence for `#42`:** the quota sampler landed, and the profile comparison that would judge it cannot be run until this is fixed, because one of the four references is not producing plans on the world under test.


---

## 42 (continued). The cause, and what was done about it

**The conflict draw is the entire source of the difference. The network draw contributes nothing measurable.** Separating the two seeds and holding one fixed at a time, on `naive`:

| held fixed | varied | difference | verdict |
|---|---|---|---|
| conflicts | **network** | 0.002 | within noise |
| network | **conflicts** | 0.127 | **5.2x noise** |

That 0.127 is essentially the whole 0.135 the two worlds differed by. `build` now takes a `--conflict-seed` separately from `--seed`, which is what made the diagnosis possible and is also the lever a calibration search would need: the scored query set is selected on the network alone, so re-drawing the conflicts leaves it valid.

**Why the conflict draw varied so much.** Each setting was drawn independently with probability `density x share`, so a tier controlled how *many* conflicts landed and not *which*. Comparing the two Tier-3 draws:

* seed 481516 — `epoch_ms` on two operators, `offset 130` and `precision 3` on ostline;
* seed 20260906 — **no coordinate offset anywhere**, and nordline on clean `iso_offset`.

`C-coordinate-offset` is the most expensive conflict in the ablation, at 0.83–1.16m. One world had it and the other did not.

**`TIER_QUOTA` replaces the density.** A tier now fixes its *composition* — this many identity conflicts, this many about time, this many about truthfulness — and the seed chooses which setting within a section, which operator carries it, and at what strength. Reach still decides who carries more, so P0M10's finding survives. Every seed now draws an offset, a time conflict and a cancellation setting where before the draw was a lottery.

**The verdict is not in.** Running the profile comparison on the rebuilt worlds hit `#44`: the naive reference player cycles in its path reconstruction on the new world and now declines most obligations. **Three of the four anchors work; the comparison needs all four.** `#42` cannot be called fixed or unfixed until that is.

---

## 44 (continued). The cause: one decode written twice, and a unit error inside it

The cycle was real and the guard was right, but neither was the disease. The naive player converted a published time to seconds-into-the-day in **two** places:

```ts
// alighting
arriveAt: (v) => typeof v === "number" ? toSeconds(v + offsetS) % 86400 : ...
// boarding
const departS = typeof st.depart === "number" ? (st.depart + offsetS) % 86400 : ...
```

The second never calls `toSeconds`, so it never reaches `publishedEpochSeconds`. **`KNOWN-ISSUES.md` #35 unified three copies of that rule and this was a fourth** — invisible to the fix and to its test, because the test asked whether each file *mentions* the shared helper and this file does, in the other expression.

While every numeric feed published `epoch_s` the two agreed and nothing noticed. On an `epoch_ms` operator they disagree by three orders of magnitude: the same value reads **10800 as a departure and 10811 as an arrival**. Arrivals then land before the departures that produced them — a **negative edge** — and a label relaxation with negative edges does not terminate. It builds a `prev` chain containing a cycle, and the reconstruction walks it forever.

**And unifying them exposed a second bug underneath.** The surviving expression was `toSeconds(v + offsetS)`, which adds a count of *seconds* to a count of *milliseconds* before deciding which unit it is looking at. With both paths using it, the player stopped hanging and started scoring **−11.4** with a capture of −19.2. The offset is a wall-clock quantity and belongs on the wall clock, once the unit is known: `toSeconds(v) + offsetS`.

| | `naive` on the generated world |
|---|---|
| before | **hangs** |
| cycle guard only | −0.584 — declining most obligations |
| one decode, offset applied first | −11.423 |
| one decode, unit converted first | **0.157** |

`m1` reads 0.076 at every step, because `epoch_s` values sit below the millisecond cutoff and the reordering is a no-op there. That is exactly why this survived the whole of Phase 0.

**The cycle guard stays.** It is no longer reachable by this route, and a reconstruction that cannot produce the itinerary its own search claims to have found should decline rather than spin, whatever put the cycle there.

`wallClockSeconds` is now a module-level export with `src/refplayer/test/wall-clock.test.ts` against it: seconds and milliseconds of one instant decode alike, a trip's stops stay in order after decoding, and a naive local time is still read in the wrong frame — the intended defect, which had to survive the fix.

> The lesson is the one already written into `CLAUDE.md` and evidently not yet learned: **a rule in more than one place will drift.** #35 found three copies and unified them; the fourth was written differently enough that a text search for the shared helper found the file and missed the bug. The test that would have caught it is behavioural — *decode the same instant two ways and require the same answer* — and it exists now.

---

## 42 (continued). The verdict, once `#44` unblocked it

The quota landed and the comparison ran. **It did not fix the exit.**

| reference | before the quota | after |
|---|---|---|
| `null` | within noise | within noise |
| `blind` | within noise | 1.2x noise |
| `naive` | 2.0x noise | **5.9x noise** |
| `competent` | 1.6x noise | **within noise** |

**It moved the right thing for one solver and the wrong thing for another.** `competent` — the solution that actually reconciles — now sees the two worlds as equally hard, which is what fixing the composition was supposed to buy. `naive` sees them as further apart than before.

**The absolute gap barely moved**: 0.135 before, 0.119 after. What changed is the *noise*, which fell from 0.069 to 0.020 — the quota made each world more self-consistent across seeds, so the same absolute difference is now many more multiples of it. **A tighter instrument reporting a worse verdict is the instrument working**, and it is worth saying plainly rather than reading the ratio as a regression.

### What that leaves

The quota fixed *composition* — every world of a tier now draws an offset, a time conflict and a cancellation setting. It did not fix **strength and placement**: within a section the seed still chooses which setting, which operator carries it, and at what rung. `naive` is far more sensitive to those than `competent` is, which is `#24`'s thesis restated as a measurement — *difficulty is a property of the (world, solver) pair*, and a generator that fixes composition alone equalises the worlds only for the solvers that composition dominates.

**The remaining options are the ones already named**, now with evidence for choosing:

* **A calibration search** — generate, profile, adjust, regenerate, until the profile lands on target. The only approach that can target a *profile* rather than a proxy, and the profile is what the exit is written against. It preserves variety, because it selects among candidates rather than narrowing what may be drawn. Expensive: see the cost note below.
* **Extend the quota to strength.** Cheaper, and it treats `naive`'s sensitivity as a symptom of free choice within a rung rather than of the loop being open. It would also narrow variety further, which `#43` says is already thin at the bottom of the ladder.
* **Weaken the claim** to "drawn from the same difficulty distribution, whose spread is *this*" — honest, cheap, and probably not enough for the assessment use case.

**Still blocks P1M4's exit.**

---

## 42 (continued). Fixed — select the world, do not narrow the generator

`npm run calibrate:tier <out> --tier N --seed S` draws several conflict sets over **one fixed city**, screens them on the sensitive reference, and ships the draw nearest the median.

**A build-time search, and not the "closed loop" this project already has a meaning for** — passengers bound to the player's endpoint (`CORECONCEPT.md` §370, Phase 2, outside the MVP). Scoring is untouched, the MVP stays open loop, and the reference solutions appear as measuring instruments rather than as players.

### Why selection rather than a narrower generator

Both close the gap; only one keeps the variety the project asked to keep. Extending `TIER_QUOTA` to strength would buy agreement by removing choices, and `#43` already records that variety is thin at the bottom of the ladder. A search leaves every conflict available at every strength and rejects only draws that land far from the middle — so two shipped worlds may be composed quite differently and still ask the same of a solver.

### What one tier actually looks like

Six draws over a single city, screened on `naive`:

```
city seed 481516                    city seed 20260906
    497354   0.097                      20260906   0.024
    481516   0.144                      20284663   0.160
    489435   0.177                      20276744   0.168
    513192   0.190  <- median           20292582   0.207  <- median
    521111   0.232                      20268825   0.211
    505273   0.238                      20300501   0.260
```

**A tier spans 0.097 to 0.260 on one reference.** That range is the issue, stated as a measurement: shipping "the world for seed S" ships a draw from it, and nothing said which. Note city B's own seed — 20260906 — scored **0.024**, the worst of its six. The original failing comparison was an unlucky draw against a middling one.

### The verdict

| reference | before | after |
|---|---|---|
| `null` | within noise | within noise |
| `blind` | 1.2x noise | within noise |
| `naive` | **5.9x noise** | **within noise** |
| `competent` | within noise | within noise |

**The absolute gap is the solid part**, because it does not depend on how the noise was estimated: `naive` went from **0.119 apart to 0.022**, and `competent` from 0.033 to 0.018.

### Caveats, stated rather than buried

* **Three seeds is few.** The noise column is a standard deviation from three samples and moved from 0.020 to 0.065 between runs of the same shape. The *ratio* verdict is therefore soft; the fivefold fall in the absolute difference is not. Re-run with more seeds before leaning on it.
* **The screen is one reference.** `--verify` profiles the winner against all four, and it should be used for any world that will be shipped. A world selected only for `naive` is calibrated for `naive`, which is `#24`'s trap in a new place.
* **Cost.** Six candidates at two seeds is about ten minutes per city, plus the comparison. That is a calibration step rather than a build step, and `npm run world:generate` still produces an uncalibrated world in about a minute.
* **The search can fail**, and must be allowed to. If no draw lands near the median that is a finding about the catalogue's reach, not a reason to widen the tolerance.

**The second half of P1M4's exit is untouched:** matching profiles say the worlds are equally hard *in aggregate*, not that they are hard *in the same way*. Only a solution built for one and run on the other says that.