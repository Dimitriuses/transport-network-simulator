# Roadmap

Work still to do. What has already been built, and what it taught us, is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

Milestones are numbered **`P<phase>M<milestone>`** — `P1M2` is the third milestone of Phase 1. Phases themselves are in [`docs/PHASES.md`](docs/PHASES.md); known defects are in [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md).

**No dates.** Milestones are dependency-ordered and sized relative to each other. Calendar estimates need a capacity figure that is not recorded anywhere.

---

## Where things stand

**Phase 0 is reopened. Gate 3 fails, and `docs/PHASES.md` is explicit that Phase 1 must not begin on a failed Gate 3.**

P0M0–P0M6 delivered one hand-built Tier-2 world end to end and were recorded as passing all three gates. P1M0 — the milestone whose stated purpose was to test what Phase 0 concluded — found the third gate had been measured with an instrument that was wrong at both ends.

| Gate | Result |
|---|---|
| 1 — buildable | PASS on internal evidence only — the solution was written by someone who had seen the world |
| 2 — discriminating | PASS — four solutions, four distinct scores, 0.56 of spread |
| 3 — conflicts doing the work | ~~PASS — 61 %~~ **FAIL — conflicts cost 3 % of headroom against a matched reference** |

**Gate 3's criterion, ratified after P1M0:** conflict cost must be **at least 20 % of the P0−P1 headroom**, measured against `P0a` (`docs/REFERENCE-POLICY.md` §2.1). The old criterion — that conflicts cause most of the *shortfall* — is retained but is no longer the binding test, because against a matched reference it is 100 % by construction.

### What P1M0 established

* **The instrument was wrong at both ends.** The lazy baseline was handed the true disruption set and never read a published feed, so all four catalogue D conflicts were unmeasurable. The reference it was divided by is granted foresight of unannounced disruptions — 2.26 min against a 0.10 min conflict cost, sitting in the denominator. Both corrected; `npm run gates`, `npm run horizon`.

* **The catalogue is weak, not shallow — which is the better problem.** Six of twelve settings bite at *some* strength on *some* operator. The committed world places most below their threshold (`C-coordinate-offset` at 130 m against a 260 m threshold) or on an operator that cannot express them (`sudbahn` scores 0.00 on all twelve at every strength). The strongest single setting available reaches 2.13 min against 3.14 min of headroom, so the catalogue *can* produce a hard world.

* **Nearly all of catalogue A is inert**, because the lazy merger matches on geometry and never needs identifiers to agree. A conflict costs something only if the solver's method depends on what is corrupted, which makes difficulty a property of the (world, solver) pair.

* **`replan` is a Gate 3 prerequisite.** Conflict cost quadruples as the planning lead shortens — 0.10m at 1800 s, 0.46m at 300 s — because a planner that never replans is mostly blind, and a blind planner cannot be punished for reconciling badly.

* **Gate 1 was approximated, not tested.** The competent solution was written by someone who had seen the world. That measures whether the world is *solvable*, not whether it is *discoverable*. `docs/PLAYTEST-KIT.md` makes the missing experiment runnable; it needs a person.

---

# Phase 0, reopened — making Gate 3 pass

**Goal:** a world whose declared conflicts account for at least 20 % of what a player competes for — at *realistic* conflict strengths, measured with an instrument that can see them.

**Exit:** `npm run gates` reports three passes, with Gate 3 measured over the headline score and no gate's criterion weakened to achieve it.

Four milestones, in this order, and the order carries most of the argument.

P0M7 came first because strengthening conflicts while the planner was still blind meant tuning against a suppressed signal. It did its job and then produced a larger finding: the instrument cannot resolve a realistic conflict at all. So P0M8 fixes the instrument, P0M9 grows the world until the instrument has enough signal to read, and only then does P0M10 touch a conflict.

**The constraint that shapes all three** is that a conflict must stay realistic. Two operators can disagree about where a stop is; at 500 m apart that is not a disagreement, it is a broken map, and it teaches something other than integration. Every route to a passing gate that runs through "make the conflict bigger" is closed by construction.

---

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

| proposal | where | what it changes |
|---|---|---|
| **Gate 1 splits into three** — solvable, not-trivial, discoverable | `docs/PHASES.md` | the first two become computable per world; the third is sampled by people, never gated. The competent solution is demoted to a regression detector |
| **The identifiability audit** | `docs/PHASES.md`, Gate 1a | a per-world check, needing no solver, that the published data can distinguish the entities that matter — the dual of the defect audit, and a lower bound on any solver's loss |
| **Gate 3 returns to its ratified metric** | `docs/PHASES.md`, Gate 3 | journey time against headroom, measured on `P2rt`. The whole-score figure becomes a diagnostic |

The fault they share: **a gate measured by running a solution we wrote is a gate about that solution.** `P2rt` and `P0a` are defined in `REFERENCE-POLICY.md`; the competent and naive players are implementations. Every point of Gate 1's failure at P0M10 traced to a bug or an overfit assumption in ours, and Gate 3's two irreconcilable numbers differ by a factor of 3.5 for no reason other than which of the two kinds of instrument they use.

A fourth question fell out and is recorded as an **OPEN** in `docs/SCORING.md`: `P0a` sits 2.10 min above `P0` against 3.35 min of headroom, so **capture is normalised against a ceiling of about 0.37 that no player can exceed**. Every capture figure the project has recorded is scaled against an unreachable 1.0.

**The honest alternative.** If realistic conflicts cannot reach 20 % even with a sound instrument and a big enough world, the response is the one this roadmap has committed to from the start: **narrow the claim rather than pad the catalogue.** That would not end the project. It would move its centre of gravity from journey-time capture to the Information family and to the engineering effort of getting there — which is arguably where an integration challenge belongs anyway, and would itself be a finding worth publishing.
---

# Phase 1 — Generation

**Blocked on Phase 0's reopened exit.** Do not begin until `npm run gates` reports three passes. P1M0 already ran — ahead of the gate, which is how the failure was found — and is recorded below; nothing after it should start.

**Goal:** produce worlds instead of hand-authoring them — for the content that actually carries difficulty, and no other.

**Phase exit** (`docs/PHASES.md`): two independently generated worlds at the same declared tier produce matching P0−P1, P0−P2 and P1−P2 gaps within tolerance, and a solution built for one performs comparably on the other.

---

### P1M0 — Evidence before generation — **part B done, part A outstanding**

Two cheap experiments that answer questions Phase 0 structurally could not. Part B is delivered and is what reopened Phase 0; see [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

**A. External playtest.** Give the committed world to one or two engineers who have not seen the repository. Watch. Record where they stall, what they assume, how long before their first scoring run, and what they say about it afterwards.

**B. Conflict-depth probe.** ✅ `npm run probe`. Built world variants with each conflict alone, at each strength, on each operator, against a conflict-free baseline. Found the measuring instrument wrong at both ends before it could find anything about the conflicts.

**Exit:** we can name which conflicts are worth generating and roughly how strong each must be, and we have at least one external data point on discoverability.

**Why this is first, and why it is not optional.** Everything after it depends on knowing which defects earn their place. It costs days rather than months, and it is the only route to genuine Gate 1 evidence — the first honest answer to "is this discoverable?" comes from the first stranger who plays, and nothing we build changes that.

*This milestone justified itself.* It was scoped as two cheap experiments and instead invalidated a phase exit. Part A is still owed, and `docs/PLAYTEST-KIT.md` is the runnable form of it.

---

### P1M1 — Projection generation

Per-operator manifests sampled from the §2.1 catalogue, parameterised by tier. The manifest shape already exists and is already declarative, so this generates configuration rather than inventing a mechanism.

Also serves each operator's `docs_url`, which is currently advertised and unserved (`KNOWN-ISSUES.md` #11). **Accurate documentation only.** Defects wait for Phase 3 and for something able to measure them — a world whose documentation cannot be trusted before it is worth reading teaches players to ignore documentation, which is the reverse of the habit catalogue §2.1 F exists to build.

**Exit:** generated manifests produce worlds whose defect audit passes and whose ablation profile falls within the band their declared tier targets, and every operator serves documentation that matches its own behaviour.

---

### P1M2 — Network generation

Routes, patterns, journeys and calendars over an existing city graph — efficient, inefficient, congested, poorly coordinated. Includes generating the demand table and the scored query set.

**Exit:** a generated network produces headroom comparable to the hand-authored one, with **a query set large enough that the three gaps are stable across seeds**.

That last clause is a prerequisite for P1M4 rather than a nicety. The current world has 22 scored queries, so each is about 4.5 % of the score and the gap estimates are noisier than they look — "two worlds match within tolerance" is not a meaningful claim at that sample size.

---

### P1M3 — Name generation

Names for cities, districts, streets, stops, stations, operators, routes and vehicles — and, importantly, **multiple inconsistent names for the same object**. Naming is a conflict source here, not decoration (`CORECONCEPT.md` §1).

**Exit:** naming conflicts measurably cost a solver that matches on names, and the abbreviation and transliteration variants survive the defect audit.

---

### P1M4 — Difficulty calibration

The tier ladder becomes real: generate to a requested tier, and verify. This is the phase exit.

**Exit:** two independently generated worlds at the same declared tier produce matching P0−P1, P0−P2 and P1−P2 gaps within tolerance, **and a solution built for one performs comparably on the other**.

The second clause is the one that matters, and the harder of the two. Matching gaps say the worlds are equally hard *in aggregate*; a solution transferring says they are hard *in the same way*. Only the second supports the assessment use case, where two candidates must face genuinely equivalent tasks.

---

## Deferred, with the milestone that owns them

| Item | Source | Owner |
|---|---|---|
| `latency: sim` and non-atomic pagination — must arrive together | `DATA-MODEL.md` §4 | Phase 3, or whichever milestone adds pagination |
| Ghost-rider capacity denial — needs a simulated background population | `REFERENCE-POLICY.md` §9 | Phase 2, with closed loop |
| Free-running ingestion between ticks in `realtime` | `TIME-MODEL.md` §6 | Phase 2 |
| Sub-second time resolution | `TIME-MODEL.md` §8 | Phase 2 |
| Trajectory in-bundle vs regenerated from seed | `DATA-MODEL.md` §6 | Phase 2 |
| `replan` obligation — specified but never issued | `PLAYER-CONTRACT.md` §5.5 | `KNOWN-ISSUES.md` #1 |
| Documentation *defects* and per-operator presentation | `CORECONCEPT.md` §2.1 F | Phase 3, gated on `KNOWN-ISSUES.md` #12 |

---

## Risks

**The catalogue may be shallower than it looks.** The clearest signal from Phase 0. If P1M0's probe finds that only geometric conflicts bite, the project is a narrower challenge than `CORECONCEPT.md` claims, and the honest response is to narrow the claim rather than pad the catalogue.

**Generated worlds are harder to keep honest than hand-built ones.** The defect audit exists because a world can silently be easier than it declares. It caught exactly that on its first run, against a hand-built world where somebody had thought about every setting. A generator will produce combinations nobody thought about, so the audit and the ablation must run against every generated world rather than as a release check.

**Equal difficulty is a strong claim.** P1M4's second clause — a solution transferring between worlds — is the real bar, and it is quite possible to satisfy the gap-matching half while failing it. Watch for the temptation to declare victory on the easier half.

**Specification drift.** Twelve documents now cross-reference each other heavily, and Phase 0 corrected several of them mid-build. **Each milestone ends by reconciling the specifications it touched** — part of the milestone, not cleanup afterwards.
