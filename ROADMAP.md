# Roadmap

Work still to do. What has already been built, and what it taught us, is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

Milestones are numbered **`P<phase>M<milestone>`** — `P2M2` is the third milestone of Phase 2. Phases themselves are in [`docs/PHASES.md`](docs/PHASES.md); known defects are in [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md).

**No dates.** Milestones are dependency-ordered and sized relative to each other. Calendar estimates need a capacity figure that is not recorded anywhere.

---

## Where things stand

**Phase 0 is complete**, on a hand-built Tier-2 world of 38 sites, 50 quays, 10 lines and 98 scored journeys.

| Gate | Result |
|---|---|
| 1a — solvable | PASS. 6.19m reachable of 8.48m headroom; unresolvable ambiguity 2 % against a 25 % bar |
| 1b — not trivial | PASS. A lazy integrator captures 0.186 of reachable headroom |
| 1c — discoverable | PASS **by decision** — scope, not evidence |
| 2 — discriminating | PASS. Four distinct scores, in the order §8 wants |
| 3 — conflicts doing the work | PASS. 2.98m, **35 % of headroom**, bar 20 % |

*Re-measured at P2M0 after `KNOWN-ISSUES.md` #40 let walk transfers chain. Headroom rose from 8.37m to 8.48m — the oracle got slightly better at two journeys — so the conflicts' share of it fell a point without the conflicts changing at all. The Phase 0 figures are kept in `docs/PHASES.md`.*

**Phase 1 is complete as of 2026-09-07.** Worlds are generated rather than authored — city, network, conflicts, names and the scored query set — and the phase exit is met: two calibrated worlds of one tier produce matching difficulty profiles, a solution that reasons carries between them, and one that memorised either collapses on the other. The record is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) under *Phase 1 — closed*, including the milestone plans this file used to carry.

| On a generated Tier-3 world | Result |
|---|---|
| Gates 1a / 1b / 2 / 3 | PASS. 10.53m reachable of 12.12m; lazy integrator 0.393; **31 % of headroom** |
| Defect audit, realism, identifiability | pass, per generated world — 15 declared conflicts, all present |
| Two calibrated worlds, four references | agree within noise; `naive` 0.119 apart → 0.022 |
| Transfer, `competent` / `tuned` | 0.441 → 0.441 / 0.430 → **−0.665** |

**Phase 1 was reopened on 2026-09-08**, before Phase 2's second milestone, and the reason is `KNOWN-ISSUES.md` #48: *a tier is a claim about a world's conflicts and about nothing else.* Every generated world ever built — tier 0 through 5, every seed — is the same city:

| | tier 3 | tier 5 |
|---|---|---|
| sites / quays / lines | 59 / 60 / 13 | 59 / 60 / 13 |
| operators | 3, named `nordline`, `ostline`, `sudbahn` | the same 3, the same names |
| position of `site-e1` | 50.45020, 30.52403 | 50.45020, 30.52403 |

The seed jitters quay positions within a Site by a few metres and draws the conflicts. It does not change the shape, and neither does the tier: `NetworkSpec()` is constructed with its defaults everywhere outside the tests.

**That is the root of three issues, not one.** `#43` (the bottom rung had no variety), `#47` (two sections exhaust their quota) and `#48` (the top rung is memorisable) are all the same complaint: *a catalogue of a dozen settings on one fixed city cannot supply variety at both ends of a six-rung ladder.* The project has deliberately closed "make the conflict bigger" — every setting has a realism ceiling — which leaves exactly two levers on difficulty, and only one of them has ever been used.

**Phase 2 pauses behind it**, as Phase 0 paused behind P1M0's finding in 2026-09-02. `P2M0` keeps its two delivered clauses; its third — *the transfer verdict holds at a second tier* — moves to `P1M7`, which is where it can now be met.

**What Phase 1 leaves Phase 2**, stated plainly because it shapes the milestones below:

* **The generator is trustworthy and the numbers are not current.** The last change of Phase 1 stopped a tier's quota being spent on texture, which raised semantic content at tiers 2–3 by about two conflicts per world. Every difficulty figure recorded before it — including the transfer figures above — was measured on the older generator.
* **The exit was met on one pair, at one tier, over two seeds.** That is evidence, not coverage.
* **The router underneath every number is not optimal** (`KNOWN-ISSUES.md` #40). No comparison is invalidated, because everything is handicapped identically, but headroom is understated and Phase 2 builds a live world on top of it.
* **Gate 1c is still a decision rather than a measurement.** The playtest has been owed since P1M0 and is scheduled at the end of this phase.

---

# Phase 1 (reopened) — The structural ladder

**Goal:** make a tier a claim about the *world* — its size, its operators and their modes — and not only about the conflicts drawn over it. **Difficulty by structure is the one axis realism does not cap**, and it is untouched.

**The ladder becomes two-dimensional**, which is the design decision this phase rests on:

* **Scale is the ordered axis, and it is the tier.** A small town with two bus companies; a medium town with three and a metro; a large city with four and a metro; and above that, several towns joined by rail. More network, more operators, more modes — monotone, and monotone by measurement rather than by assertion.
* **Shape is a declared axis and is not ordered.** Single-centre and polycentric are different problems, not different amounts of one problem. Calling "five towns and a railway" twenty per cent harder than "a large city" would invent a number, and the clearance ladder would inherit it.

**A world therefore declares `(tier, shape)`.** Two worlds of the same tier and different shapes should be comparably hard — that is what makes shape an axis rather than a hidden difficulty lever, and `P1M7` states it as a measured exit rather than a hope.

---

### P1M5 — The ladder becomes data — **delivered**

**A rung is an entry in an ordered list, not a number in six tables.** Today `TIER_SECTIONS`, `TIER_QUOTA`, `TIER_COSMETIC_ONLY`, `TIER_DENSITY` and `CLEARANCE_LADDER` are each keyed by the literals 0–5, and seventeen places in the Python side iterate `range(6)`. Adding a rung means editing all of them and hoping nothing was missed.

* **One ordered list of rung definitions**, each carrying its structural parameters, its section quota and its clearance bar. The tier number becomes the *index*, and the five tables become views over one list.
* **Every rung carries a stable id** — `small-town`, `metro-city` — that does not move when the numbering does. **A world bundle records the rung id and the ladder version beside the numeric tier**, so a result measured on a six-rung ladder is still interpretable after the ladder becomes nine. Without that, renumbering silently invalidates every recorded score, which is `KNOWN-ISSUES.md` #20 in a new place: *a number ratified against one scale, reused after the scale moved.*
* **Interpolation is the point of the shape.** Inserting an intermediate rung should be one entry in one list — not a decision about what five other tables should say at 2.5.

**Why first:** it is cheap, it is the mechanism the rest of the phase edits, and doing it afterwards means rewriting the structural tables twice.

**Exit — met.** `src/schema/src/ladder.ts` holds six rungs; `TIER_SECTIONS`, `TIER_QUOTA`, `TIER_COSMETIC_ONLY`, `CLEARANCE_LADDER` and the density table are views over it, and the Python half derives the same views from `contract/catalogue.json`, which now emits the ladder rather than four tables built from it.

* **Inserting a rung is one entry**, asserted rather than claimed: `src/schema/test/ladder.test.ts` inserts one into a copy and requires every view to follow — including `cosmeticOnlyTiers`, which reports indices rather than being keyed by them and is therefore the one a renumbering leaves behind.
* **A rung's id outlives its number.** Every bundle records `rung_id` and `ladder_version` beside the numeric tier, and `tierOfRung("metro-city")` moves from 3 to 4 under an insertion while the id still resolves.
* **Behaviour is unchanged, and that was measured rather than assumed.** The generated operator manifests for every tier at four seeds were dumped from this branch and from a clean `git worktree` of `HEAD`: **byte-identical, 24 combinations**. What did change is the committed world's content hash — `86bf3d8cb4e0a7a5` → `7753357f4980b584` — because two rows were added to a hashed table, and `--verify` passes on the rebuilt bundle.
* The four `range(6)` loops in the Python tests read the ladder's length instead.

---

### P1M6 — Scale: operators, modes and size become tier parameters — **delivered**

The generator's three operators are hard-coded — the ids `nordline`, `ostline` and `sudbahn` are string literals, and the roles are radials / ring-and-chords / regional. That fixed shape is also why a memorised answer key always resolves: **the operator it was baked against is present, under the same name, in every world that exists.**

* **`NetworkSpec` levers move into the rung definition**: arms, sites per arm, hub quays, chords, and the operator roster.
* **Operators are generated** — count, roles, ids and names — so two worlds need not share a single operator identity.
* **Modes arrive as operator kinds.** A metro is not a bus with a different name: higher frequency, its own right of way, fewer and larger stations, and therefore a genuine `A-granularity` habit rather than a drawn conflict.
* **The invariants generalise to N operators**: `max_reach_share`, the reach-weighted conflict placement, and #38's division of labour all assume exactly three roles today.

**Exit, stated in numbers because the instrument exists:** every rung passes all three gates; the reference profile is **monotone across rungs by measurement**, not by assertion; and pairwise similarity within a rung falls below what it is today at the rung that is worst for it (Tier 5, 67 % of conflicts shared, 47 % with strengths).

> **Measured on a six-rung ladder.** `P1M8` merged the top two into one
> (`KNOWN-ISSUES.md` #51), so the `region` row below is the rung that no longer
> exists and `towns-and-rail` now carries its quota. The numbers are kept as
> recorded, because the merge was *decided by* them.

**Delivered.** The rungs carry their cities, the operators are generated, and the metro is an operator *kind*:

| rung | arms | sites | quays | lines | operators | roles | conflicts | biggest reach / cap |
|---|---|---|---|---|---|---|---|---|
| `clean` | 6 | 32 | 33 | 7 | 2 | radial, ring | 0 | 55 % / 62 % |
| `small-town` | 6 | 32 | 33 | 7 | 2 | radial, ring | 2 | 55 % / 62 % |
| `metro-town` | 8 | 51 | 61 | 11 | 3 | + metro | 11 | 44 % / 55 % |
| `metro-city` | 8 | 72 | 86 | 15 | 4 | + regional | 21 | 40 % / 50 % |
| `towns-and-rail` | 12 | 105 | 126 | 20 | 5 | 2 radials | 33 | 36 % / 45 % |
| `region` | 12 | 120 | 141 | 22 | 6 | 2 radials, 2 rings | 39 | 23 % / 40 % |

Every rung generates, audits clean — no MISS and no INRT at any of them — and passes the realism check. `max_reach_share` is a rung parameter because it has to be: two operators cannot both be under a half, and a cap nobody can satisfy is a generator that always throws.

**A metro is not a bus company with a different name.** Its own alignment, its own stations at 90 m from the kerb in their own Sites — undeclared interchanges, the same construction that makes the ring operator's stops worth finding — **two platforms per station**, and a train every four minutes. The platforms are what give `A-granularity` something real to collapse: a station and the platform a train leaves from are different things, and an operator publishing at Site granularity says they are not.

**The operator ids are generated from the world's seed**, so two worlds of a rung share **0 of 4** operator identities at `metro-city`. An answer key baked against `akademichnaline` resolves nothing in a world run by `sobornaline`, and `tuned` now drops a feed it has no entry for rather than falling back to inference — which would have quietly turned it into `competent`.

**The operator ids are generated from the world's seed**, so two worlds of a rung share **0 of 3** operator identities at `metro-city`. That is `#48`'s memorisation half addressed at its root: an answer key baked against `akademichnaline` resolves nothing in a world run by `sobornaline`, and `tuned` now drops a feed it has no entry for rather than falling back to inference, which would have quietly turned it into `competent`.

**Conflict composition moved less than identity did, and that is the honest half.** Role-keyed similarity — the only comparison that means anything now, since an id-keyed one reports 0 % for free:

| rung | same conflicts | same conflicts+strengths |
|---|---|---|
| `small-town` | 35 % | 17 % |
| `metro-town` | 56 % | 34 % |
| `metro-city` | **46 %** | **27 %** |
| `towns-and-rail` | 63 % | 36 % |
| `region` | **68 %** | **44 %** |

`metro-city` improved (47 % → 46 %, 28 % → 27 % against the pre-P1M6 numbers) and `region` did not (67 % → 68 %, 47 % → 44 %). **Structure fixed identity; composition is still governed by the quota against the catalogue's size**, which is `#47`'s section D and not something a bigger city changes.

### The profile across rungs, and what it says

Two seeds per rung, one uncalibrated draw each:

| rung | `null` | `blind` | `naive` | `competent` |
|---|---|---|---|---|
| `small-town` | −0.600 | 0.072 | 0.380 | **0.582** |
| `metro-town` | −0.600 | 0.121 | 0.420 | **0.606** |
| `metro-city` | −0.600 | −2.660 | −2.550 | **0.214** |
| `towns-and-rail` | −0.600 | −0.193 | −0.051 | **0.212** |
| `region` | −0.600 | −1.420 | −1.290 | **0.236** |

**`competent` orders the ladder as far as `metro-city` and then flattens**: 0.606 → 0.214 → 0.212 → 0.236, the last three inside each other's noise. So the scale is monotone across the bottom half and undifferentiated across the top — which is a finding about the rungs rather than about the generator, and the levers to fix it (quota, density, size) are all in one list now.

**And `blind`/`naive` swing between −0.05 and −2.66 across adjacent rungs.** That is `#42` at a new scale: an uncalibrated world is a draw from a distribution, and these are single draws. `npm run calibrate:tier` per rung is what the monotonicity claim actually needs, which makes it **P1M8's** measurement rather than this milestone's.

**Both measurement clauses moved to `P1M8`** — the per-rung gate runs and the monotone-by-measurement profile. Both want *calibrated* worlds, and measuring either on single draws would be quoting one calibration as a difficulty, which this project has a rule against. What P1M6 owed and delivered is the generator: the rungs build their own cities, and the operators are their own.

---

### P1M7 — Shape: the second axis, and the transfer verdict at the top — **in progress**

* **`polycentric`** — several towns joined by rail, against today's single centre. Inter-town lines are infrequent, so a missed connection is expensive, which is exactly the headroom the scoring rewards; the query set must span centres, and `npm run headroom`'s criterion needs re-checking against journeys of that shape rather than assumed to carry over.
* **`P2M0`'s third clause lands here.** With operator identities and counts differing across worlds of a rung, a memorised key has nothing to resolve against — which is `#48`'s root rather than another widening of the catalogue.

**Exit:** two worlds of the same tier and *different shapes* have difficulty profiles that agree within noise — **the claim that makes shape an axis rather than a difficulty lever in disguise**; the transfer verdict holds at the top rung and at one other; and a polycentric world's scored set still rewards integration on the same criterion, measured rather than assumed.

**Delivered.** `--shape polycentric-rail` builds a region: three towns, each generated by the same code and then namespaced, **each with its own bus company and its own tram**, joined by a railway. A tier-4 region is 88 sites, 101 quays, 23 lines and **8 operators**, of which the largest serves 18 % of the network.

* **The shape is not a rung field**, deliberately — `src/schema/src/shape.ts` says why, and the bundle records `shape` beside `tier` and `rung_id`. A world is a `(tier, shape)` pair.
* **The railway is the conflict.** Forty minutes between trains, so a missed connection is forty minutes lost; the rail station sits in its own Site beside each town's hub, which is an undeclared interchange on the critical path rather than beside it.
* **A metro belongs to a city**, so at most one town of a region has one — and the roles a town runs are its own two, not the whole roster of the city on that rung. Applying the rung's roster per town produced thirteen operators for one world.
* **`max_reach_share` is about the world, not a part of it.** Checking it while each town was still being built refused every region: a town of two operators has one serving 58 % *of that town*, and 19 % of the region.
* **The scored set still rewards integration**, measured rather than assumed: **109 of 200** journeys can be improved by 120 s or more, against 140 of 200 for a single-centre world.

**And the exit clause does not hold yet**, on one uncalibrated pair at tier 4, three seeds:

| reference | single-centre | polycentric | difference | noise |
|---|---|---|---|---|
| `null` | −0.600 | −0.600 | 0.000 | — |
| `blind` | −0.206 | −0.232 | 0.025 | within noise |
| `naive` | −0.065 | −0.109 | 0.044 | within noise |
| `competent` | 0.201 | **0.364** | 0.163 | **1.9x noise** |

Three references of four agree. **`competent` finds the region easier**, which is the reading that matters: a rail spine between small towns is a fast, reliable backbone, and once a solver has found the interchange the long journeys are straightforward. So on this evidence shape is *not yet* neutral, and the honest options are to make the region harder — sparser rail, longer headways, more towns — or to stop calling it an axis.

**Two things before that decision is worth making**: these worlds are uncalibrated single draws, and `npm run calibrate:tier` is what says where a rung's middle is. The calibrated comparison and the transfer verdict at the top rung are **P1M8's** measurements.

---

### P1M8 — Re-measure, and re-establish the exit — **in progress**

Everything recorded against the old ladder describes a generator that no longer exists — the same debt `P2M0` paid off, at a larger scale.

* Calibrate each rung, profile it, and re-derive every clearance bar from the references' scores on the new worlds.
* **Gates per rung and per shape** — carried from `P1M6`, which built the rungs but measured them on single draws. `competent` reads 0.606 at `metro-town` and 0.214, 0.212, 0.236 across the three above it: ordered across the bottom half and flat across the top, on worlds nobody has calibrated yet.
* **The monotone-by-measurement profile**, also carried from `P1M6`, for the same reason.
* Re-run `npm run transfer` at the top, the middle and the bottom.
* Close `#47` and `#48` against measurements, or restate what remains of them.

**Exit — this is Phase 1's exit, on the new ladder:** two independently generated worlds at the same declared tier produce matching difficulty profiles, a solution that reasons carries between them, and one that memorised either collapses on the other — **at more than one rung**, which is the coverage the first closing of this phase did not have.

### Measured so far

Every rung calibrated over six conflict draws of one city, then profiled at three seeds:

| rung | `null` | `blind` | `naive` | `competent` |
|---|---|---|---|---|
| 1 `small-town` | −0.600 | 0.079 | 0.359 | **0.573** ±0.039 |
| 2 `metro-town` | −0.600 | 0.060 | 0.347 | **0.589** ±0.018 |
| 3 `metro-city` | −0.600 | 0.111 | 0.218 | **0.443** ±0.028 |
| 4 `towns-and-rail` | −0.600 | −0.122 | 0.005 | **0.277** ±0.031 |
| 5 `region` | −0.600 | −0.014 | 0.095 | **0.352** ±0.032 |
| tier 4, polycentric | −0.600 | −0.456 | −0.365 | **0.129** ±0.082 |

**The ladder is monotone from rung 2 to rung 4 and inverts at 5.** `competent` reads 0.589 → 0.443 → 0.277 and then **0.352**, which is 0.075 easier against noise of ±0.03 — about two and a half sigma, so not a draw. `naive` inverts in the same place and by a similar margin. Rungs 1 and 2 are also indistinguishable (0.573 against 0.589, inside noise), which is expected: rung 1 is texture only, and texture measures zero.

**Why rung 5 is easier than rung 4, and it is a lesson about the levers.** Rung 5 has *more* of everything — six operators against five, 39 declared conflicts against 33, a bigger network — and a **lower** `maxReachShare` (0.4 against 0.45). The quota is per operator, so spreading the same kind of quota over more operators dilutes it: each feed is about as bad, no feed carries as much of the city, and a bigger network offers more ways around any one of them. **Difficulty is roughly "how bad is a typical feed" times "how much of the network does it carry"**, and rung 5 raises the first while lowering the second.

That is a fixable thing — the levers are all in one list now — but it is a decision about what the top of the ladder should be, not an adjustment to make quietly.

### The shape axis does not hold, and calibration reversed the sign

At tier 4, city against region:

| reference | city | region | verdict |
|---|---|---|---|
| `blind` | −0.122 | **−0.456** | region much harder |
| `naive` | 0.005 | **−0.365** | region much harder |
| `competent` | 0.277 | **0.129** | region harder |

**The region is harder on every reference**, and a lazy integrator strands nearly half its travellers there — 55 % arrive against 90 % for `competent`, because a missed train is forty minutes and a plan built on the wrong interchange has nowhere to go.

**Uncalibrated, the same comparison said the opposite** — `competent` scored 0.364 on the region against 0.201 on the city, and the region looked *easier*. One calibration is a draw from a distribution, and this is the sharpest demonstration this project has produced: the sign of a difference reversed.

So `P1M7`'s exit clause fails on evidence rather than for want of it: **shape is currently a difficulty lever, not a neutral axis.** The options are unchanged — make the region easier (denser rail, shorter headways, fewer towns) until it agrees, or stop calling it an axis and make it a rung.

### The gates, per rung

| rung | headroom | lazy captures | conflicts cost | verdict |
|---|---|---|---|---|
| 1 `small-town` | 9.37m | 0.796 | 0.00m (0 %) | Gate 3 undecidable |
| 2 `metro-town` | 11.16m | 0.732 | −0.50m (−4 %) | fails |
| 3 `metro-city` | 13.06m | −3.494 | 13.07m (100 %) | **all pass** |
| 4 `towns-and-rail` | 10.89m | −5.672 | −11.78m (−108 %) | fails |
| 5 `region` | 12.65m | −6.633 | −2.82m (−22 %) | fails |
| tier 4, polycentric | 6.34m | −2.028 | −4.13m (−65 %) | fails |

**One rung of six passes, and it is the one nearest the world the gates were written for.** The failures split in two, and neither is a defect in a generator (`KNOWN-ISSUES.md` #52, #53):

* **At the bottom there is nothing to measure.** A texture-only rung lets a lazy integrator capture 0.796, which is what a rung with no semantic conflict is *for*.
* **At the top, Gate 3 goes negative** — the conflicted world is up to 11.78m *better* for a lazy reader than an honest one, because honest data lets it match stops, plan ambitious multi-operator journeys and be taken apart by reality, while conflicted data forces robust single-operator fallbacks. Differencing two catastrophes measures the difference between two catastrophes.

### Decisions taken, 2026-09-09

* **`#51` — the ladder ends at four.** `region` measured 0.075 easier than `towns-and-rail` at about two and a half sigma, and *a tier that is easier than the tier below it is not a rung*. The two merged, keeping the harder half of each: five operators and a 0.45 reach cap, with the old top rung's quota, density and clearance bar. What the old rung was *for* — a region rather than a city — became a **shape**, and there are now three: `polycentric-rail` (a train every forty minutes), `polycentric-bus` (a coach every twenty), and `polycentric-mixed`, which is two ways between the same two towns run by two operators.
* **`#52` — the gates ask only the rungs that carry conflict.** `npm run gates` reads the world's rung and reports `n/a` for 1b and 3 where it declares no semantic section. A lazy integrator doing well on a texture-only rung is the rung working.
* **`#53` — Gate 3 states its precondition.** Two guards: the lazy integrator must still be integrating (fallback under half the scored set), and the journey-time conflict cost must be positive. A negative cost means the conflicted world is *better* for a lazy reader than an honest one, which is a real property and not an answer to the question the gate asks.

  **Two numbers, disagreeing in sign, and the first guard tested the wrong one.** At `towns-and-rail` the conflicts cost 0.164 of the whole score at 23 sigma *and* saved the lazy baseline 11.8 minutes of travel. The criterion ratified after P1M0 is journey time; the guard was written against the whole-score figure, which is positive at every rung and would never have fired. That is `#20`'s mistake, caught in review rather than in a measurement.

### Where that leaves the phase exit

**Not met, and the remaining work is decisions rather than code.** The clearance ladder needed no re-derivation at all — bars stated as positions between reference solutions adapted to the new worlds by themselves, which is P1M4's design paying off years ahead of when it was written. What is left:

1. ~~**Re-cut the rungs**~~ — done: the ladder ends at four (`#51`).
2. ~~**State the gates per rung**~~ — done: they ask only the rungs that carry conflict, and Gate 3 says when it cannot decide (`#52`, `#53`).
3. ~~**Re-measure the merged ladder**~~ — done for the scale axis, and **it is ordered**. Calibrated and profiled at three seeds:

   | rung | `blind` | `naive` | `competent` |
   |---|---|---|---|
   | 1 `small-town` | 0.079 | 0.359 | 0.573 |
   | 2 `metro-town` | 0.060 | 0.347 | 0.589 |
   | 3 `metro-city` | 0.111 | 0.218 | 0.443 |
   | 4 `towns-and-rail` | −0.122 | 0.005 | **0.277** |

   Rungs 3 and 4 separate by **8.6, 4.5 and 5.4 times their own noise** on the three references that measure anything, all in the same direction. Rungs 1 and 2 are indistinguishable, which is by construction rather than a defect: rung 1 is texture-only, and texture measures exactly zero.

   **The merged rung turned out to be the old rung 4 exactly** — same median, same spread, same selected draw — because the quota it inherited was undeliverable (`#54`). The merge is a deletion of a rung rather than a blend of two, and the record says so now.
4. **Decide the shape axis.** The region is harder on every reference, so it is currently a difficulty lever rather than a neutral axis — and there are now three links to choose between, which is a lever for making it agree.
5. **Attribute the broken lazy baseline — blocked on `#55`.** Gate 3 declining to decide is honest and does not excuse the world, and the instrument it points at cannot currently answer: `npm run fallback` reports the cosmetic `A-naming` costing the same 9.22 minutes and 91 extra fallbacks as `D-staleness`, with seventeen unrelated conflicts landing on one figure. A cosmetic setting measures zero everywhere else, so the tool is not isolating what it claims to.

   What the run does establish: **45 of 200 journeys already fall back on a world with no conflicts at all**, where `P1 − P2` is a healthy +6.51m. Whatever breaks the lazy integrator at this rung starts from there.
6. Then, and only then, the transfer runs: a memorised solution is worth testing against a ladder whose rungs mean something.

---

# Phase 2 — The living world — **paused behind the reopened Phase 1**

**Goal** (`docs/PHASES.md`): the sandbox half of the project, which Phase 0 deliberately skipped — travellers who actually consult the player, a clock that tracks wall time, and a view that explains what happened.

**Phase exit:** a player can iterate against a live world and *see* why their solution behaved as it did. The subjective test is whether it is enjoyable to work against; the objective one is whether the traveller timeline explains a scoring outcome without recourse to logs.

**The order below is a dependency order.** The debts come first, because everything after them is measured through the same router and quoted against the same generator; the playtest comes last, because it is the only item that needs the rest to exist.

---

### P2M0 — The numbers, before the world starts moving — **two of three; the third found `#48`**

Phase 1 ended with one defect and two measurement debts, and all three get worse once the world stops being a fixed trajectory.

* ✅ **`KNOWN-ISSUES.md` #40 — answered, and the premise was wrong.** The claim was that a disrupted index offers a subset of a clean one's options, so routing on it cannot do better — and 28 of 200 journeys did. **Delaying a service moves its departure later, and a later departure is one a slightly late traveller catches.** Separating the kinds: cancellations alone improve **0 of 98** journeys on the committed world and **0 of 200** on a generated one, while making 7 and 21 worse. Removal-monotonicity holds exactly; the test asserts that half, demonstrates the other on a two-stop fixture, and is no longer `todo`.

  The same premise sat in the information-set audit's bound, which was **above an achievable outcome on 12 of 98 journeys** on the committed world and 30 of 200 on a generated one. It now takes every delay and only the cancellations a player could know — sound, and deliberately weaker than the `P0` quarantine, so the leak detector is the blind-hit statistic.

  One real gap turned up while checking and is closed: walk transfers were rationed by a budget of *rides*. Chaining them changes 2 of 596 query-policy pairs and improves both. The committed world's headroom rose from **8.37m to 8.48m** — the first time "headroom is understated" has had a number rather than an argument behind it.
* ✅ **The calibrated pair, re-measured** on the current generator at three seeds. `competent` 0.365 → 0.422, `tuned` 0.371 → **−0.619**: both halves hold at Tier 3. On the four-reference profile three references agree within noise and `blind` differs by **1.1×** it, which the report calls *not matching* — a marginal verdict on three samples, and honest either way. The generated world's gates are unchanged at **31 %** of headroom, because the walk fix touched only the committed world.
* ❌ **Transfer coverage — the verdict does not hold at Tier 5** (`KNOWN-ISSUES.md` #48). `tuned` carried cal5-a's answer key to cal5-b and scored *better* (+0.045): **the worlds are too alike**, which is the row the two-sided test exists to catch. Two Tier-5 worlds share 80 % of their conflict list and 66 % of their conflicts-with-strengths, against 65 % and 41 % at Tier 3, because the quota exhausts sections B and D at the top *and* `_pick`'s bias draws the strongest rung 86 % of the time. **Tier 1 cannot be *transfer*-tested at all, which is not the same as lacking variety** — it has more than any other rung since `#43` (two Tier-1 worlds share 29 % of their conflict list, against Tier 5's 80 %). It is cosmetic-only, so both worlds' answer keys are byte-identical — all zero displacement, all `iso_offset` — and a test whose second half asks *did the memorised specifics matter* has nothing to ask about.

**Exit:** the monotonicity test is no longer `todo` ✅; every difficulty figure quoted in the documentation was measured on the current generator ✅; the transfer verdict holds at a second tier ❌.

**Reassigned to `P1M7` on 2026-09-08.** It is not reachable while every world of every tier holds the same three operators under the same names, which is what reopening Phase 1 fixes.

**Work done against that third clause before it moved, and what it bought.** The catalogue was widened at its strong end (`B-dst-offset`, `C-cancellation-token`), `generate` lists that hold *kinds* rather than severities are now drawn uniformly instead of by tier, and the answer key was widened from two dimensions to four. Two Tier-5 worlds now share **47 %** of their conflicts-with-strengths against 66 % before, and Tier 3's collapse sharpened to −0.839. **The Tier-5 verdict has not flipped**, and `#48` now says exactly why rather than approximately: that rung's cost is 77 % one conflict, and the two worlds' versions of it decode identically. The options that remain are about which conflict to add next, not about whether the diagnosis is right.

---

### P2M1 — `realtime`

The clock tracks wall time and the world feels alive.

**The constraint that shapes it:** `realtime` is a *mode*, not a replacement. Open-loop scoring, the golden trajectory and cross-machine comparability all rest on runs being reproducible from a seed, and none of that may weaken because a second mode exists. Simulated time stays a monotonic integer count from the world epoch; wall time is what the scheduler waits on, never what the model reads.

**Two OPEN items are decided here, both from `TIME-MODEL.md`:**

* **§6 — free-running ingestion between ticks.** Natural in `realtime` and it costs nothing there, but it means two code paths for the player, and `PLAYER-CONTRACT.md` §5.6 carries the same question. Decide it once, in both documents.
* **§8 — sub-second resolution.** Currently one second, with milliseconds stored and seconds exposed. Transit does not care; say so and close it, or produce the case that does.

**Exit:** a run in `realtime` produces the same scorecard as the same world in `sim`, up to the disruptions it draws; the golden-trajectory test still reproduces byte-for-byte; and both OPEN items are closed in the specifications rather than in a code comment.

---

### P2M2 — Closed loop, and the app-user fraction

Travellers consult the player and act on its answers; the world diverges accordingly. A configured share consults it and the rest follow `P1`, which bounds request volume, models reality, and doubles as a difficulty axis.

**This is the milestone that changes what a score means, and it should be designed before it is built.** `capture` is `(P1 — player) / (P1 — P0a)` over a *fixed* trajectory: every solution is scored against the same day, which is what makes two runs comparable at all. A closed loop makes the day a function of the player's advice, so `P1` and `P0a` stop being computable once and reused. **`SCORING.md` needs reconciling before the first closed-loop run is scored**, and the honest options — score against the counterfactual day, or keep the open loop as the *scored* mode and let the closed loop be the sandbox — are a decision rather than an implementation detail.

**Assigned here:**

* **Ghost-rider capacity denial** (`REFERENCE-POLICY.md` §9) — needs a simulated background population, which the app-user fraction is.
* **Trajectory in-bundle vs regenerated from seed** (`DATA-MODEL.md` §6) — `TECHNICAL-RESEARCH.md` §4 recommended seed-as-canonical with the trajectory as a cache, and bundle size was never estimated. A closed loop is what makes the distinction matter.

**Exit:** a player's advice changes what happens to a traveller; the app-user fraction is configurable and its effect on request volume is measured; and `SCORING.md` states what is scored when the denominator is no longer fixed.

---

### P2M3 — The view that explains it

Map replay, vehicle and passenger flows, an API request view, and the traveller timeline of `OBSERVABILITY.md` §9 — **with the player's knowledge state rendered as a band beneath the world's**, which is the feature the phase exit rests on. Plus closed-loop replay: recorded player responses replayed for post-hoc debugging.

**Assigned here**, because this UI is their first real consumer:

* **`verbatim` logging** (`OBSERVABILITY.md` §7) — capped at 250 MB and downgrading rather than truncating, which was settled at P0M6 and never built.
* **Trace disclosure levels** (`OBSERVABILITY.md` §8), including `attributed`: the catalogue *section* that cost you capture, without naming the operator or the setting. That distinction — a hint rather than an answer key — is the reason the level exists.

**Exit — this is the phase exit.** A scoring outcome can be explained from the traveller timeline without opening a log. If "why did this traveller arrive late" needs `jq`, the milestone is not done.

---

### P2M4 — The playtest, at last

**`KNOWN-ISSUES.md` #3, owed since P1M0, and deliberately scheduled at the end of this phase.** Give the world to one or two engineers who have not seen the repository. Watch. Record where they stall, what they assume, how long before their first scoring run, and what they say about it afterwards. [`docs/PLAYTEST-KIT.md`](docs/PLAYTEST-KIT.md) is the runnable form.

**Why here rather than earlier:** it needs something worth sitting in front of. A live world and a timeline that explains itself are what make the session about the player's understanding rather than about missing tooling — and an hour of a stranger's attention is the scarcest thing in this project, so it should be spent on the version worth showing.

**What it measures, and what nothing else does.** A quest asks *can you find X, having been told X exists*; a playtest asks *can you work out that X exists at all*. Gate 1c stays **PASS by decision** until this runs, and the longer it goes unmeasured the more of the generator rests on an assumption nobody has tested.

**Exit:** two sessions run and written up, with what they found raised as issues rather than summarised as a verdict.

---

## Deferred, with the milestone that owns them

| Item | Source | Owner |
|---|---|---|
| Free-running ingestion between ticks in `realtime` | `TIME-MODEL.md` §6, `PLAYER-CONTRACT.md` §5.6 | **P2M1** |
| Sub-second time resolution | `TIME-MODEL.md` §8 | **P2M1** |
| Ghost-rider capacity denial — needs a background population | `REFERENCE-POLICY.md` §9 | **P2M2** |
| Trajectory in-bundle vs regenerated from seed | `DATA-MODEL.md` §6 | **P2M2** |
| What `capture` normalises against once the day is no longer fixed | `SCORING.md` §2 | **P2M2**, before the first scored closed-loop run |
| `verbatim` logging, and the three trace disclosure levels | `OBSERVABILITY.md` §7, §8 | **P2M3**; assessment-mode redaction in Phase 4 |
| `KNOWN-ISSUES.md` #47 — section D offers no choice of *settings* | `#43`'s invariant test | **P1M8**, against measurements on the new ladder |
| `KNOWN-ISSUES.md` #48 — the top rung is memorisable | `npm run transfer` | **P1M6**–**P1M7**: the structural ladder is the answer chosen for it |
| `SCORING.md` — `P0a`'s ambiguity floor | `KNOWN-ISSUES.md` #23 | Phase 3. Three measurements say 1 %, and none was taken on a city with a large interchange, which is the case that would change the answer |
| The Information family registers realtime failures and scores them at 0.001 | `SCORING.md` OPEN | Ratified 2026-09-05 to stay open. Reopen on evidence, not on taste |
| `latency: sim` and non-atomic pagination — must arrive together | `DATA-MODEL.md` §4 | Phase 3, or whichever milestone adds pagination |
| Documentation *defects* and per-operator presentation | `CORECONCEPT.md` §2.1 F | Phase 3, gated on `KNOWN-ISSUES.md` #12 |
| Generated verifier quests — Gate 1c's return | `PHASES.md`, Gate 1c | Phase 3, with the documentation work |

---

## Risks

**Reopening a phase is cheap to decide and expensive to finish.** Phase 0 was reopened once, at P1M0, and cost four milestones. This reopening is larger in scope: it changes what a tier *is*, so every calibrated world, every clearance bar and every recorded difficulty figure is re-derived at `P1M8`. The argument for paying it now rather than later is that Phase 2 builds a live world, a UI and a playtest **on top of the ladder** — and a playtest run against a world whose tier means something different afterwards is an hour of a stranger's attention spent twice.

**A two-dimensional ladder invites a third dimension.** Scale and shape are enough to state the exit against; the temptation will be to add a mode axis, a demand axis, a fidelity axis, each defensible on its own. **Every axis multiplies what must be measured per release** — the gates, the profile and the transfer test already run per rung. Adding one is a decision to be argued in `PHASES.md`, not a parameter to be introduced in the generator.

**A closed loop removes the fixed denominator that makes two scores comparable.** This is the largest design risk in the phase and it is not a coding problem: `capture` is measured against `P1` and `P0a` on *the same day*, and a day that responds to the player's advice is not the same day. Deciding it late means either a scoring change after results exist, or a sandbox that quietly cannot be scored. **P2M2 states the decision as a deliverable** for that reason.

**`realtime` is one `Date.now()` away from breaking every reproducibility guarantee in the project.** The rule is not new — `src/core` and `src/router` may not read a wall clock, and lint enforces it — but a mode whose whole purpose is to track wall time is the first thing that will want to. Wall time belongs to the scheduler that decides *when to advance τ*, never to anything that decides *what happens*.

**A UI has no natural stopping point.** The exit is a legible explanation of a scoring outcome, not a polished map. The honest test is the one `PHASES.md` states: can somebody say why a traveller arrived late without opening a log. Anything past that is Phase 4's problem.

**The playtest can only be spent once per person.** Fresh eyes are the whole instrument, and a session run against a half-built world buys a weaker measurement of the thing nothing else measures. That is the argument for P2M4's position, and also the argument against slipping it again.

**Generated worlds are harder to keep honest than hand-built ones.** The defect audit exists because a world can silently be easier than it declares, and it caught exactly that on its first run against a world where somebody had thought about every setting. Phase 1 found seven more that way. **Every per-world instrument must run against every generated world**, not as a release check.

**A number quoted after its generator changed is the same defect as a threshold quoted after its denominator changed** (`KNOWN-ISSUES.md` #20). Phase 1's closing change raised semantic content at tiers 2–3 by about two conflicts per world, so the figures it recorded describe a generator that no longer exists. P2M0 re-measures rather than re-labels.

**The router is not optimal, and every number goes through it** (`KNOWN-ISSUES.md` #40). No *comparison* is invalidated, because every baseline and every solution uses the same router and is handicapped identically, but headroom is understated and every absolute journey time is an upper bound. Phase 2 builds a live world on top of it, which is why P2M0 owns it.

**Calibration buys agreement at the cost of an hour.** `npm run calibrate:tier` is a search, so a calibrated world costs six candidate builds and their profiles rather than one build. `npm run world:generate` still produces an *uncalibrated* world in about a minute, and an uncalibrated world is a draw from a range spanning 0.097 to 0.260 on one reference. Whichever is used, the choice should be deliberate.

**Specification drift.** Twelve documents cross-reference each other heavily, and every phase so far has corrected several of them mid-build. **Each milestone ends by reconciling the specifications it touched** — part of the milestone, not cleanup afterwards.
