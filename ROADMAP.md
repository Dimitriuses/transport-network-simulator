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
| 1b — not trivial | PASS. A lazy integrator captures 0.200 of reachable headroom |
| 1c — discoverable | PASS **by decision** — scope, not evidence |
| 2 — discriminating | PASS. 0.934 of spread, four distinct scores |
| 3 — conflicts doing the work | PASS. 3.04m, **36 % of headroom**, bar 20 % |

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

### P1M1 — Projection generation — **in progress**

Per-operator manifests sampled from the §2.1 catalogue, parameterised by tier. The manifest shape already exists and is declarative, so this generates configuration rather than inventing a mechanism.

**Done so far:**

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
* **`D-staleness`'s value range needs deriving from the world rather than listing as constants** — `KNOWN-ISSUES.md` #34, owned by P1M4. Needs more study before anything is implemented.

**What Phase 0 established that this must honour:**

* **Placement matters more than strength.** Moving the same fifteen conflicts onto the operator that carries the network doubled their cost, at identical settings. A generator must weight placement by carried traffic — Sudbahn expressed nothing at any strength because it reaches nine line-stops of fifty-eight.
* **Every setting has a plausibility ceiling** with a stated real-world cause, enforced by tests. A coordinate offset past ~150 m is a broken map rather than a disagreement, and no generated world may go there.
* **Cosmetic and semantic are labelled** (`CORECONCEPT.md` §2.1). A generator sampling the catalogue uniformly would spend most of its effort on texture.

Also serves each operator's `docs_url`, currently advertised and unserved (`KNOWN-ISSUES.md` #11). **Accurate documentation only** — defects wait for Phase 3 and for something able to measure them.

**Assigned here — two scoring corrections that generation would otherwise inherit:**

* **`KNOWN-ISSUES.md` #19 — the Information family registers realtime failures and does not score them.** Ten silent cancellations move the score by 0.001, because the timeliness term has a floor of 0.5 and recall is diluted by the events a conflict does not touch. Catalogue D cannot be validated in a generated world until this is fixed, and `SCORING.md` carries four candidate directions.
* ~~**`SCORING.md` — `P0a` has an ambiguity floor under it.**~~ **Reassigned to P1M2 on 2026-09-05.** Measured on generated worlds at every tier the floor is 1 %, *below* the hand-built world's 2 %, and does not grow with tier — the ambiguity comes from `A-granularity`, which the generator will not place on an operator with no station to collapse. The scenario the warning was about is a property of the *network*, so the decision waits for generated networks.

**Exit:** generated manifests produce worlds whose defect audit passes, whose identifiability audit and symptom check pass, and whose ablation profile falls within the band their declared tier targets; every operator serves documentation matching its own behaviour; and a realtime conflict moves the Information family.

**One exit clause is now known to be unreachable in this milestone.** Tiers 3 and 4 generate byte-identical manifests (`KNOWN-ISSUES.md` #32): with A–D active at all three top tiers and twelve settings to draw from, placement saturates and the density lever has nothing left to buy. No tier *band* can separate worlds that are the same world. Defining those bands is P1M4's job and needs levers this milestone does not have — how many operators are dirty, where conflicts sit relative to the scored journeys, and catalogue sections E and F. **The clause is carried to P1M4 rather than declared met.**

---

### P1M2 — Network generation

Routes, patterns, journeys and calendars over an existing city graph — efficient, inefficient, congested, poorly coordinated. Includes generating the demand table and the scored query set.

**The query set is not a by-product, and Phase 0 learned this expensively.** P0M9 generated 132 journeys by taking every Site pair 1500 m apart, and on 88 % of them the restricted and unrestricted transfer graphs gave the same answer — nothing for integration to win, and every extra leg a player took was exposure to a cancellation nobody had announced. The competent reference solution scored *below the naive one* for that reason alone, and it took two milestones to find out why (`KNOWN-ISSUES.md` #26).

* **A scored journey must be able to reward integration.** `npm run headroom` is the criterion, and it is deliberately structural — routing on the unrestricted transfer graph against the restricted one — because a criterion involving disruptions would make the scored set depend on which day was drawn.
* **Keep some straightforward journeys.** A set where every journey needs integration would not notice a solution that breaks the easy ones.
* **Do not fix a risk-heavy query set by removing the risk.** Lowering the cancellation rate or the planning lead would make such journeys survivable and delete the thing that makes realtime integration worth anything.

**Assigned here on 2026-09-05 — `SCORING.md`, `P0a`'s ambiguity floor.** `capture` normalises against `P0a`, which routes on the canonical world and so knows which platform its train uses when no player can. Measured at 1 % on every generated world and 2 % on the hand-built one, and it does not grow with tier — but the case the warning was about is Site granularity over *larger stations*, and station size is a property of the network. Re-measure with `npm run identifiability` once generated networks exist, then choose between subtracting the floor and continuing to publish it beside capture. The warning that keeps it undecided still stands: subtracting means a player scores *better* on a world whose ambiguity is *worse*.

**Exit:** a generated network produces headroom comparable to the hand-authored one; at least 60 % of scored journeys can be improved by integration and some deliberately cannot; and the three gaps are stable across seeds within a stated tolerance.

That last clause is a prerequisite for P1M4 rather than a nicety. Phase 0 measured the alternative: with only the disruptions changing, headroom had a standard deviation of 31 % of its mean. **A single calibration is a draw from a distribution, not a measurement of a city.**

---

### P1M3 — Name generation

Names for cities, districts, streets, stops, stations, operators, routes and vehicles — and **multiple inconsistent names for the same object**.

**Reclassified at P0M10:** naming is *cosmetic* (`CORECONCEPT.md` §2.1). It measured exactly zero on every operator at every setting, and §2.1's own definition of cosmetic variation already covered it. It must exist — a world where every operator spells a place identically is not recognisable as the real problem — and it must not be relied on to carry difficulty.

The honest caveat is recorded with the reclassification: the measured zero is partly a property of the instrument, since the lazy baseline matches on geometry and never reads a name.

**Exit:** naming variants survive the defect audit, and the tier ladder does not depend on them for difficulty.

---

### P1M4 — Difficulty calibration

The tier ladder becomes real: generate to a requested tier, and verify. This is the phase exit.

**Assigned here — the two questions about what a declared difficulty even means:**

* **`KNOWN-ISSUES.md` #24 — difficulty is a property of the (world, solver) pair, not of the world.** `P2rt` loses 76 % of headroom to the declared conflicts; the naive reference player loses to two of them, and the conflict dominating Gate 3 costs it nothing. **P1M4 cannot make its central claim without resolving this**: under the current definition two worlds could match on one baseline and differ completely for every other solver, and nothing would notice. The proposal is to declare difficulty as a *profile* over the reference solutions rather than a scalar.
* **`KNOWN-ISSUES.md` #34 — a conflict's settings are chosen without reference to the world they act on.** `D-staleness` offers `[60, 300, 900]`; two of the three conceal nothing against a shortest announcement lead of 300 s, so the expressibility filter drops them and staleness becomes a switch rather than a ladder. The ranges should be *derived* from the world's parameters rather than listed as constants — which supplies a lever the two items below both need. Needs study before implementation, and explicitly not to be settled by picking numbers that make the ladder look reasonable.
* **`SCORING.md` — tier clearance thresholds predate the change of denominator.** `CLEARANCE` was chosen while capture normalised against clairvoyant `P0`; rescaling by 2.6 without touching it made every tier materially harder to clear than its number was chosen to mean. The proposed fix is a *method* rather than a number — express each bar as a position between named reference solutions, which survives a change of denominator, world size or penalty as a hard-coded decimal does not.

**Exit:** two independently generated worlds at the same declared tier produce matching difficulty *profiles* within a stated tolerance, **and a solution built for one performs comparably on the other**; and every tier's clearance bar is expressed in terms that survive a change of scale.

The second clause of the first sentence is the one that matters and the harder of the two. Matching numbers say the worlds are equally hard *in aggregate*; a solution transferring says they are hard *in the same way*. Only the second supports the assessment use case.

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

**Equal difficulty is a strong claim, and now a harder one.** P1M4's real bar is a solution transferring between worlds, and #24 says a single number cannot express what has to match. Watch for the temptation to declare victory on the aggregate half.

**A generator can reintroduce every Phase 0 failure at scale.** Each of these was found once, by hand, on one world: a query set that could not reward integration, a conflict placed where nothing expressed it, an ambiguity no solver could resolve, a conflict that cost points and showed nothing. **The instruments that caught them must run per generated world**, which is why P1M1 and P1M2's exits name them rather than assuming them.

**Specification drift.** Twelve documents cross-reference each other heavily and Phase 0 corrected most of them mid-build. **Each milestone ends by reconciling the specifications it touched** — part of the milestone, not cleanup afterwards.

**The playtest is still owed.** Nothing in Phase 1 produces evidence about discoverability, and the longer it goes unmeasured the more of the generator rests on an assumption nobody has tested.
