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
* **`P2M0`'s third clause lands here.** ~~With operator identities and counts differing across worlds of a rung, a memorised key has nothing to resolve against — which is `#48`'s root rather than another widening of the catalogue.~~

  **Corrected 2026-09-11 (`KNOWN-ISSUES.md` #59).** The counts do not differ — two worlds of a rung from different seeds share their graph, their roster and every operator's share of it — and a key with nothing to resolve against does not make a world non-memorisable, it makes the memoriser read nothing. `npm run transfer` certified the exit on two identical worlds that way, and now refuses a verdict when its key resolves no operator.

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

### P1M8 — Re-measure, and re-establish the exit — **in progress; the exit clause is met at two rungs**

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

### The gates, per rung — withdrawn, and screened again

> **The table this section carried is withdrawn.** Its conflict costs were measured against a floor that still carried four conflicts (`KNOWN-ISSUES.md` #55), and its account of the top rung — honest data giving a lazy reader more rope — explained an artefact (`#53`, withdrawn).

Screened again with `npm run wall`: Gate 1b's two ends and the paired conflict cost, three seeds, no ablation.

| world | rung | `B-dst-offset` | lazy captures | conflicts cost | |
|---|---|---|---|---|---|
| K2 | `metro-town` | 1 | 0.732 | 8 % | thin |
| K3 | `metro-city` | 1 | −3.494 | 569 % | **wall** |
| K4 / M4 | `towns-and-rail` | 3 | −5.672 | 502 % | **wall** |
| **candidate** | `towns-and-rail` | **0** | **0.057** | **61 %** | **rung** |
| KP4 | `towns-and-rail`, polycentric | 1 | −2.028 | 252 % | **wall** |
| *m1 — Phase 0* | `metro-town` | 0 | 0.186 | 44 % | *rung* |
| *cal-a / cal-b — P1M4* | `metro-city` | 0 / 2 | 0.168 / 0.040 | 43 / 56 % | *rung* |

**Every wall carries `B-dst-offset`, and the top rung drawn without it is a healthy rung.** Not every world carrying it is a wall — K2 is thin with one, cal-b a rung with two — so it is necessary on this evidence and not sufficient. And the calibration search shipped K4's draw as typical over `candidate`'s, because it screens on `naive`, which cannot see the setting (`#58`).

**This screens the worlds that exist; it is not the re-sweep.** Item 8 below still stands, and waits on what the generator is allowed to draw.

### Decisions taken, 2026-09-09

* **`#51` — the ladder ends at four.** `region` measured 0.075 easier than `towns-and-rail` at about two and a half sigma, and *a tier that is easier than the tier below it is not a rung*. The two merged, keeping the harder half of each: five operators and a 0.45 reach cap, with the old top rung's quota, density and clearance bar. What the old rung was *for* — a region rather than a city — became a **shape**, and there are now three: `polycentric-rail` (a train every forty minutes), `polycentric-bus` (a coach every twenty), and `polycentric-mixed`, which is two ways between the same two towns run by two operators.
* **`#52` — the gates ask only the rungs that carry conflict.** `npm run gates` reads the world's rung and reports `n/a` for 1b and 3 where it declares no semantic section. A lazy integrator doing well on a texture-only rung is the rung working.
* **`#53` — Gate 3 states its precondition.** *Withdrawn 2026-09-11: the negative cost it was written for came from `#55`'s floor. `stillIntegrating` stands on its own evidence, and the ceiling the rung actually needed became Gate 1b's (`#56`). Kept below as recorded.* Two guards: the lazy integrator must still be integrating (fallback under half the scored set), and the journey-time conflict cost must be positive. A negative cost means the conflicted world is *better* for a lazy reader than an honest one, which is a real property and not an answer to the question the gate asks.

  **Two numbers, disagreeing in sign, and the first guard tested the wrong one.** At `towns-and-rail` the conflicts cost 0.164 of the whole score at 23 sigma *and* saved the lazy baseline 11.8 minutes of travel. The criterion ratified after P1M0 is journey time; the guard was written against the whole-score figure, which is positive at every rung and would never have fired. That is `#20`'s mistake, caught in review rather than in a measurement.

### Decisions taken, 2026-09-11

Put with the evidence that decided each one, and implemented the same day.

* **`B-dst-offset` leaves the draw (`#57`).** Every wall on the structural ladder carried it; `candidate`, the top rung drawn without it, is a healthy rung at 61 %. It stays in the catalogue — audited, answerable, answered by `competent`, available to a world built around it on purpose — and a `drawn: false` flag stops the generator placing it. **The skip sits after each section's shuffle, not in the pool**, so a world that never drew it is unchanged and one that did gives the slot to `B-time-encoding`, one `random()` for one `random()`. `tools/tests/test_drawn.py` asserts that across every drawing tier and forty seeds, and on the top rung's generated network at the six seeds calibration screens, and fails if the substitution is never exercised. It also explains `#50`'s calibration outlier: the one draw where a shifted operator stated an offset first, beside an epoch-encoded one. Section B is back to one drawable setting against a quota of one, and the room test says so (`#47`, reopened).
* **Every lazy reader believes a stated offset (`#58`).** What any date library does, and what the catalogue calls the lazy reading. The HTTP reference player read the wall clock and ignored the suffix; it now reads it with `statedOffsetS` from `@tns/schema`, and a test holds it to `parseSimTime`, the rule `P2rt` already used. No committed figure moves — `m1`'s only operator stating an offset states the true one — and every HTTP instrument, the calibration screen included, can now see the trap on a world that carries it.
* **The memoriser files its answers by operator kind and rank (`#59`).** `operatorKeys` in `@tns/schema` names an operator by the last word of its published name and by how many lines and trips it runs — facts a rename cannot touch and a player can see — and leaves a tie unkeyed rather than breaking it by id. `npm run tune` files the key from the published timetables and `tuned` resolves it from the ones it receives, with the same function. **Validated on the case that exposed the defect**: the committed world against a copy with every operator id *and* name replaced reads `competent` 0.223 → 0.223, `tuned` 0.294 → 0.294, *the worlds are too alike* — where the id-filed key read −0.600 and *both halves hold*.
* **The city within a rung is shared, and said plainly (`#48`).** Two worlds of one rung from different city seeds have one graph, one roster and one share per operator — and, since `#61`, one timetable, which the seed had been drawing and which set difficulty more than the conflicts did. The exit's non-memorisability is claimed for what differs between them — the conflict draw — and `PHASES.md`'s completion clause now says so. The transfer exit is measured on single-centre rungs, because a polycentric region's towns are symmetric and its operators tie on everything a rename leaves.
* **The shape is tuned with its link modes.** `polycentric-bus`, a coach every twenty minutes against a train every forty, is measured first against `towns-and-rail`; shape stays an axis only if some link mode agrees within noise.
* **`LADDER_VERSION` is 2**, the bump `#51` owed. The committed world's content hash moved from `592fb664` to **`125b606a`**, and nothing else in it changed.
* **And both lazy readers read an offsetless timestamp as UTC** — decided later the same day, when the first calibrations on the new generator showed why it mattered. The top rung's six draws are healthy with two or three `local_naive` operators and easy and thin with none or one; `P2rt` could see that and the calibration screen could not, so it had shipped the thinnest. The player moved to the baseline's rule, and every world was recalibrated on it (`#58`).
* **And each rung fixes how many operators publish `local_naive`** — `metro-town` 1, `metro-city` 2, `towns-and-rail` 3 — decided when the pairs calibrated on the UTC player failed `npm run profile` at both rungs, by 2.4–3.1 times seed noise. Across twelve draws the count decided rung against easy with no exceptions, and each pair disagreed the way its counts did. The generator adjusts a draw to the count rather than re-drawing it, so a world already at its count is unchanged. `LADDER_VERSION` 3; `m1` rebuilt at `436daf10` (`#58`).
* **And each rung declares its radial headways** — twenty and twenty-five minutes, alternating — decided when the fixed-count pairs still failed `npm run profile` and the cause turned out to be the city rather than its conflicts (`#61`). At `metro-city` each city's draws sat close together and the two cities 0.255 apart; six cities spanned 0.335. The generator drew each radial's headway from the city seed, and replacing only one world's four headways moved `naive` from −0.253 to −0.648, with a control rebuilt the same way reproducing that world's hash. Frequent buses improve `P1`, shrink the headroom, and so move the denominator of every score — the one thing a calibration search holding the city fixed never varies. **Per line** rather than a set the seed deals out, because the order alone left 0.178 through the journeys the headroom criterion selects; **the old draw's expected value** rather than one chosen against a gate. The draw is still spent, so a city changes only its timetable. `LADDER_VERSION` 4; `m1` rebuilt at `f2db2704`, its clearance unchanged.

### Where that leaves the phase exit

**The exit clause is met at two rungs, 2026-09-11** — `metro-city` and `towns-and-rail`, each on two worlds from different city seeds, calibrated on `LADDER_VERSION` 4. Both pairs' profiles match at ten seeds on every reference; at ten seeds both transfers hold both halves — `competent` moves +0.028 and +0.039, `tuned` collapses by 0.218 and 0.370, the key resolving every operator; and all four worlds screen as rungs. The seed counts, and that each verdict would stand whichever way it went, were fixed before any result (`#61`, `#62`).

**What that does not say.** It is two cities per rung. At `metro-city` six cities still span 0.175 on `naive` after the headway fix, this pair is the two extremes, and what the profile matched them within is a noise of about ±0.08. The transfer's generalising half, at its default of three seeds, read *not the same tier* on the same pair (`#62`, open). The clause is measured on single-centre rungs, because a polycentric region's towns cannot be keyed. **Closing Phase 1 again is a decision rather than a consequence**: the full gates now pass on one world per rung (item 8 below), and P1M8 still owes the monotone profile re-measured on `LADDER_VERSION` 4, `#47`, and a transfer below `metro-city`.

The clearance ladder needed no re-derivation at all — bars stated as positions between reference solutions adapted to the new worlds by themselves, which is P1M4's design paying off years ahead of when it was written. What is left:

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
4. ~~**Decide the shape axis**~~ — **done: shape is neutral.** On the current generator and player, each link mode against the city on the same conflict seed, at tier 4:

   | | `blind` | `naive` | `competent` | `P2rt` |
   |---|---|---|---|---|
   | city | −0.503 | −0.387 | 0.277 | rung |
   | `polycentric-rail` | −0.525 | −0.396 | 0.314 | rung |
   | `polycentric-bus` | −0.525 | −0.390 | 0.317 | rung |
   | `polycentric-mixed` | −0.525 | −0.420 | 0.315 | rung |

   Every link mode sits within about 0.04 of the city on every reference, which is P1M7's clause. **The rail region measured much harder at P1M8 because `B-dst-offset` was still drawn**, and all four worlds here carry the same three `local_naive` operators. `P2rt` finds the regions somewhat easier than the city (0.28–0.32 against 0.10), inside the same verdict.
5. ~~**Attribute the broken lazy baseline**~~ — done, and it answers in one word: **`B-dst-offset`**. With `#55` fixed, each conflict switched on alone over an honest world:

   ```
   conflict                          fell back    over clean    P1-P2
   no conflicts                         56/200                   6.03m
   B-dst-offset:universytetline        129/200          +73      2.02m
   B-dst-offset:soliankaline            75/200          +19     -2.50m
   B-dst-offset:kameniariv              74/200          +18    -10.03m
   B-time-encoding:akademichnaline      69/200          +13      5.01m
   ...  every remaining row between +5 and -3
   as declared                         139/200          +83     -9.16m
   ```

   Three rows carry the collapse and nothing else exceeds +5. **The sign of the offset decides how bad it is**: `universytetline` publishes `-3600` and the other two `+3600`, and an hour *early* puts departures in the past so no plan exists at all, while an hour *late* leaves a plannable itinerary that is merely wrong. Same setting, same magnitude, opposite sign, one of them destroys the query set.

   Every cosmetic row reads exactly `+0` and exactly `6.03m` — the control group working, and the direct refutation of the broken run where `A-naming` read −9.22m.

6. ~~**Decide what stops a rung becoming a wall**~~ — done (`#56`). **Gate 1b is two-sided**: a lazy integrator must capture at least −1, the point where integrating badly loses as much as integrating perfectly would have won. It went on 1b rather than Gate 3 because 488 % is a *correct* answer to Gate 3's question, and not on the clearance ladder because a rung's bar rescales with that world's own references and so cannot see a wall. `ablate` also compares on a matched population now, which moved the figure 12 points and not the verdict.

   **What it exposes: every calibrated rung above `metro-town` fails the new end** (`metro-town` fails the other way — thin, at 8 %). `metro-city` −3.494, `towns-and-rail` −5.672, `region` −6.633, against +0.186 on Phase 0's hand-built world and +0.393 on P1M4's generated tier-3. **`B-dst-offset` is a cliff rather than a dial, and one operator's is already too much.** The compounding reading was wrong: acting *alone*, `kameniariv` at `+3600` costs **44.83m** against 10.62m of headroom — four times the whole prize from one setting on one operator. A cap of one per world would not have saved it. The two signs also fail in different metrics, which is why each looks mild in the other's table: `−3600` puts departures in the past so no plan exists (**+73 fallbacks of 200**, 1.37m of journey time), `+3600` leaves a plannable itinerary that arrives an hour late (**44.83m**, +18 fallbacks). Every other semantic setting is a dial — `C-coordinate-offset` runs `[30, 60, 130]` — and this one has no weaker realistic value, because a wrong-zone claim *is* an hour.

7. ~~**Widen the catalogue between 18 % and 502 % (`#57`)**~~ — not needed; decided instead that `B-dst-offset` leaves the draw. Measured, not guessed: switching `B-dst-offset` off on the top rung and changing nothing else moves a lazy integrator from **−5.672 to +0.468** and the conflict cost from **502 % to 18 %**. With that setting the rung is a wall; without it the other thirty conflicts are decorative. There is no working middle, and none of the obvious bounds reach it — not a cap of one per world (the smallest of the three operators that drew it, at 15.9 % reach, costs 44.83m alone), not a reach bound, not a weaker value (a wrong-zone claim *is* an hour), not a partial day (real transitions happen when nothing runs).

   **Corrected 2026-09-11: the middle exists.** The 18 % came from editing the setting out of a built world, which left three operators' section-B quota spent on nothing; a draw made *without* it gives them `B-time-encoding` instead. `candidate` — the top rung drawn without `B-dst-offset`, in the same calibration run — is a healthy rung at lazy **+0.057** and **61 %**. So the top rung does not need a wider catalogue to be playable; it needs not to be handed this setting. `#48`'s variety is a separate question, and `#59` is why it is now an open one.

   This is `#47` with numbers attached. **P2M0 added two settings at the strong end and neither lands in the range**: `B-dst-offset` is 502 %, and `C-cancellation-token` is under 0.21m on journey time — its damage, if any, is in arrival and Information, and nothing has measured it there. That measurement is the cheapest next step.

   **Whether `B-dst-offset` stays in the generated pool is a decision rather than a defect.** It is realistic, answerable, and `competent` answers it; a rung *built around* it with everything else mild is a coherent thing to want.

   ~~**Decide first what a lazy integrator does with a stated offset (`#58`)**~~ — decided: both believe it. The two lazy integrators disagree totally: `P2rt` believes the claim and loses 44.83m, the HTTP naive player ignores it and loses nothing, and the four reference solutions score identically on worlds with and without the setting. Until that is settled, "how strong is `B-dst-offset`" has two answers and the widening work above cannot be aimed.

8. ~~**Re-sweep the ladder**~~ — **done at `metro-city` and `towns-and-rail`.** Every gate and calibration figure in P1M8 was measured against the broken floor and none of it stands. `npm run wall` makes this affordable — two calibrations per seed instead of the ablation's 145 — and `npm run gates` then runs only on the rungs it flags. The first calibrations on the new generator found the offsetless-timestamp seam; the rebuild on the UTC player found that neither pair matched within seed noise, and why (`#58`). **Now being rebuilt on the fixed counts**: `towns-and-rail` and `metro-city` at two city seeds each, then the wall screen, `npm run profile` on both pairs at five seeds, both transfers, and the full gates on one world per rung. *On the UTC player, before the count was fixed*, `towns-and-rail`'s calibrated world passed every gate — 1b at 0.100, Gate 3 at 45 % of headroom — and `metro-city` sat on Gate 1b's bar, with three of its six draws easy. The pair figures once recorded here as matching were two-seed verification runs; the profile instrument did not agree. **On the fixed counts** both pairs still failed the profile — `towns-and-rail` on `competent` alone, by 1.2 and then 1.4 times noise; `metro-city` on `blind` and `naive`, with one world easy — and the cause was each city's bus timetable, which the seed drew (`#61`). **On declared headways** both pairs match at ten seeds, every world is a rung, and both ten-seed transfers hold. The full gates then ran on one world per rung and **both pass every gate**. `metro-city` (R3a): 1a with unresolvable ambiguity at 0 % of headroom against a 25 % bar, 1b at 0.158 with 60/200 given up, four distinct scores, and Gate 3 at **58 %** of headroom (6.23m of 10.69m) measured on 146/200 journeys. `towns-and-rail` (R4a): 2 %, 0.094 with 58/200 given up, four distinct scores, **62 %** (6.72m of 10.78m) on 142/200. `B-time-encoding` is the largest single conflict in both ablations, which is `#58`'s count doing the work. The audit column reads `LEAK` for `blind` and `naive` on the `metro-city` world and `clean` for all four on the other. That is `#40`'s diagnostic bound rather than a gate: the scorecard verdict is `scored`, no traveller beat `P0`, the one finding is 0.0m, and the blind-hit statistic is **0 where an optimal planner with the same information would have taken 4**.
9. ~~Then, and only then, the transfer runs~~ — **done at `metro-city` and `towns-and-rail`, ten seeds each, both halves holding**: a memorised solution is worth testing against a ladder whose rungs mean something. **Now measurable**: on each single-centre pair, `npm run tune` on one world and `npm run transfer` to the other, with the memoriser keyed by kind and rank.

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
