# Roadmap

Work still to do. What has already been built, and what it taught us, is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

Milestones are numbered **`P<phase>M<milestone>`** — `P1M2` is the third milestone of Phase 1. Phases themselves are in [`docs/PHASES.md`](docs/PHASES.md); known defects are in [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md).

**No dates.** Milestones are dependency-ordered and sized relative to each other. Calendar estimates need a capacity figure that is not recorded anywhere.

---

## Where things stand

**Phase 0 is complete.** `npm run gates` reports all gates passing on a hand-built Tier-2 world of 38 sites, 50 quays, 10 lines and 98 scored journeys. The record of how it got there is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md); the result is in [`docs/PHASES.md`](docs/PHASES.md).

| Gate | Result |
|---|---|
| 1a — solvable | PASS. 6.20m reachable of 8.37m headroom; unresolvable ambiguity 2 % against a 25 % bar |
| 1b — not trivial | PASS. A lazy integrator captures 0.186 of reachable headroom |
| 1c — discoverable | PASS **by decision** — scope, not evidence |
| 2 — discriminating | PASS. Four distinct scores, in the order §8 wants |
| 3 — conflicts doing the work | PASS. 3.01m, **36 % of headroom**, bar 20 % |

**What Phase 0 leaves Phase 1**, and it is worth stating plainly because it shapes every milestone below:

* **The instruments exist and are trustworthy** — `gates`, `probe`, `stability`, `horizon`, `headroom`, `identifiability`, `symptoms`, `audit`, `calibrate`. Each was wrong at least once and each was corrected against a measurement rather than an argument.
* **They were wrong nine times first.** Every recorded Phase 0 result before 2026-09-04 was measured with at least one broken instrument. `KNOWN-ISSUES.md` #13–#27 is that record, and the habit it should leave behind is in `CLAUDE.md`: *when you add a measurement, check both sides of the comparison for matched information, and for a matched opportunity set.*
* **Four questions were deferred rather than answered.** They are assigned below.
* **One thing is owed and cannot be built.** Gate 1c is a decision, not a measurement. `docs/PLAYTEST-KIT.md` needs a person.

---

# Phase 1 — Generation

**Goal:** produce worlds instead of hand-authoring them — for the content that actually carries difficulty, and no other.

**Phase exit** (`docs/PHASES.md`): two independently generated worlds at the same declared tier produce matching gaps within tolerance, and a solution built for one performs comparably on the other.

---

### P1M0 — Evidence before generation — **part B done, part A outstanding**

**A. External playtest.** Give the committed world to one or two engineers who have not seen the repository. Watch. Record where they stall, what they assume, how long before their first scoring run, and what they say about it afterwards. [`docs/PLAYTEST-KIT.md`](docs/PLAYTEST-KIT.md) is the runnable form; `KNOWN-ISSUES.md` #3 is the standing debt.

**B. Conflict-depth probe.** ✅ `npm run probe`, seed-averaged, with plausibility ceilings on every setting.

*This milestone justified itself.* Scoped as two cheap experiments, it invalidated a phase exit and cost four milestones to repair. Part A is still owed, and no instrument replaces it — a quest asks *can you find X, having been told X exists*; a playtest asks *can you work out that X exists at all*.

---

### P1M1 — Projection generation — **delivered, exit met**

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

### P1M2 — Network generation — **delivered, exit met**

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

### P1M3 — Name generation — **delivered, exit met**

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

### P1M4 — Difficulty calibration — **exit met on one calibrated pair; coverage outstanding**

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

* **Two seeds, one pair of worlds, one tier.** The separation is large enough that noise is not a plausible explanation — `tuned` moves 1.096 where `competent` moves 0.001 — but a single pair at tier 3 is not the ladder. Re-run on tier 1 and tier 5 pairs before the claim is general, and note that `#43` says tier 1 has no variety to transfer across in the first place.
* **`competent` moving 0.001 is tighter than the world's own seed-to-seed noise**, which `#42` measured at roughly 0.02–0.065 on `naive`. That is the calibration search working as designed rather than a suspiciously good result, but it is a *mean over two seeds* and should not be quoted as a precision.
* **`tuned` scores 0.430 at home against `competent`'s 0.441.** An exact answer key should be at least as good as an inferred one; the eleven-thousandths gap is inside the noise, and the plausible cause is that baked geometry corrects every operator to the truth while inference corrects them to a *consensus frame* the rest of the model was built against. Worth knowing before reading anything into a `tuned` home score.
* **The fixture had to be made safe before it could be read.** `tuned`'s decoder returns `NaN` on a world it was not baked for, deliberately, and `NaN` fails the comparison that kept the planner's label set acyclic — the first transfer run hung for 21 minutes and produced nothing (`KNOWN-ISSUES.md` #45).

---

## Deferred, with the milestone that owns them

| Item | Source | Owner |
|---|---|---|
| `latency: sim` and non-atomic pagination — must arrive together | `DATA-MODEL.md` §4 | Phase 3, or whichever milestone adds pagination |
| Ghost-rider capacity denial — needs a simulated background population | `REFERENCE-POLICY.md` §9 | Phase 2, with closed loop |
| Free-running ingestion between ticks in `realtime` | `TIME-MODEL.md` §6 | Phase 2 |
| Sub-second time resolution | `TIME-MODEL.md` §8 | Phase 2 |
| Trajectory in-bundle vs regenerated from seed | `DATA-MODEL.md` §6 | Phase 2 |
| Documentation *defects* and per-operator presentation | `CORECONCEPT.md` §2.1 F | Phase 3, gated on `KNOWN-ISSUES.md` #12 |
| Generated verifier quests — Gate 1c's return | `PHASES.md`, Gate 1c | Phase 3, with the documentation work |
| `verbatim` logging and trace disclosure levels | `OBSERVABILITY.md` §7, §8 | Phase 2 and Phase 4 |

---

## Risks

**Generated worlds are harder to keep honest than hand-built ones.** The defect audit exists because a world can silently be easier than it declares, and it caught exactly that on its first run against a world where somebody had thought about every setting. A generator will produce combinations nobody thought about, so the audit, the identifiability audit, the symptom check and the ablation must run against **every** generated world rather than as a release check.

**Equal difficulty is a strong claim, and both halves are now measured on one pair.** `#24` is resolved — difficulty is a profile over the reference solutions — two calibrated worlds match on all four, and `npm run transfer` shows a generalising solution carrying across while a memorised one collapses. **What remains is coverage, not method:** one pair, one tier, two seeds. The temptation to watch for has moved rather than gone — reading "it held on cal-a and cal-b" as "it holds for the ladder".

**A generator can reintroduce every Phase 0 failure at scale.** Each of these was found once, by hand, on one world: a query set that could not reward integration, a conflict placed where nothing expressed it, an ambiguity no solver could resolve, a conflict that cost points and showed nothing. **The instruments that caught them must run per generated world**, which is why P1M1 and P1M2's exits name them rather than assuming them.

**Specification drift.** Twelve documents cross-reference each other heavily and Phase 0 corrected most of them mid-build. **Each milestone ends by reconciling the specifications it touched** — part of the milestone, not cleanup afterwards.

**The router is not optimal, and every number goes through it** (`KNOWN-ISSUES.md` #40). Routing a scored journey on a disrupted index beats routing it on a clean one for 28 of 200 queries, which is impossible for an optimal search — a disruption can only remove a journey or delay it. No *comparison* is invalidated, because every baseline and every solution uses the same router and is handicapped identically, but **headroom is understated** and every absolute journey time is an upper bound. `src/router/test/monotone.test.ts` states the property and is marked `todo`.

**Calibration buys agreement at the cost of an hour.** `npm run calibrate:tier` is a search, so a calibrated world costs six candidate builds and their profiles rather than one build. `npm run world:generate` still produces an *uncalibrated* world in about a minute, and an uncalibrated world is a draw from a range spanning 0.097 to 0.260 on one reference. Whichever is used, the choice should be deliberate.

**The bottom of the ladder has no variety** (`KNOWN-ISSUES.md` #43). Tier 1's quota asks for two settings from a section holding exactly two, so every Tier 1 world is the same world. That is the price `#42`'s quota paid for fixing composition, and it is the same shape as `#32`: a tier that produces one world satisfies "two worlds of a tier are equally hard" vacuously.

**The playtest is still owed.** Nothing in Phase 1 produces evidence about discoverability, and the longer it goes unmeasured the more of the generator rests on an assumption nobody has tested.
