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
| 3 — conflicts doing the work | PASS. 3.10m, **38 % of headroom**, bar 20 % |

*Re-measured at P2M0 after `KNOWN-ISSUES.md` #40 let walk transfers chain. Headroom rose from 8.37m to 8.48m — the oracle got slightly better at two journeys — so the conflicts' share of it fell a point without the conflicts changing at all. The Phase 0 figures are kept in `docs/PHASES.md`. Re-measured again on 2026-09-13, after `KNOWN-ISSUES.md` #56 made the ablation compare matched populations: Gate 3 reads 3.10m of 8.12m on the 82 of 98 journeys both runs planned, and the other gates are unchanged.*

**Phase 1 closed again on 2026-09-13 — on the scale axis, with its shape clause not met.** The reopened phase made a tier a claim about its world as well as its conflicts, and the completion clause holds at three rungs on the current generator (`LADDER_VERSION` 4 and 5 generate single-centre worlds identically):

| rung | profile, ten seeds | transfer, ten seeds | gates |
|---|---|---|---|
| `metro-town` | matches | `competent` +0.038, `tuned` −0.947 | pass, Gate 3 at 25 % |
| `metro-city` | matches | +0.028, −0.218 | pass, 58 % |
| `towns-and-rail` | matches | +0.039, −0.370 | pass, 62 % |

The ladder is monotone by measurement on `competent` in both cities measured. **What did not close is shape.** Once a region's journeys between towns were scored (`KNOWN-ISSUES.md` #64), no region agreed with its city and none was a rung, so P1M7's claim that shape is an axis rather than a difficulty lever is recorded as not met and carried to **P2M5** (`#63`, `#65`). **Phase 2 resumes**, on single-centre worlds.


The record of both closings is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md), under *Phase 1 — closed* and *Phase 1 — closed again*, with the milestone plans this file carried for each.

**What Phase 1 leaves Phase 2**, stated plainly because it shapes the milestones below:

* **The exit holds on single-centre worlds, and regions are not rungs.** Three rungs match on every reference at ten seeds and transfer both ways; no region agrees with its city or screens as a rung. P2M1–P2M4 run on single-centre worlds, and regions wait for P2M5 (`KNOWN-ISSUES.md` #65).
* **The documentation's numbers span five ladder versions.** Only the figures taken at P1M8 and at P1M7's re-measurement were measured on the current generator. P2M0's second clause was that debt, and it was paid on 2026-09-13: every figure describing a current generated world was re-measured, and the rest are dated.
* **Profile and transfer judge `competent` by two rules** (`#62`). At three seeds a transfer can call worlds of equal difficulty different tiers; every exit figure above was taken at ten.
* **The router underneath every number is not optimal** (`#40`). No comparison is invalidated, because everything is handicapped identically, but headroom is understated and Phase 2 builds a live world on top of it.
* **Gate 1c is still a decision rather than a measurement.** The playtest has been owed since P1M0, and it is P2M4.

---

# Phase 2 — The living world — **current: resumed 2026-09-13**

**Goal** (`docs/PHASES.md`): the sandbox half of the project, which Phase 0 deliberately skipped — travellers who actually consult the player, a clock that tracks wall time, and a view that explains what happened.

**Phase exit:** a player can iterate against a live world and *see* why their solution behaved as it did. The subjective test is whether it is enjoyable to work against; the objective one is whether the traveller timeline explains a scoring outcome without recourse to logs.

**The order below is a dependency order.** The debts come first, because everything after them is measured through the same router and quoted against the same generator; the playtest comes last, because it is the only item that needs the rest to exist.

---

### P2M0 — The numbers, before the world starts moving — **delivered 2026-09-13, second clause restated**

Phase 1 ended with one defect and two measurement debts, and all three get worse once the world stops being a fixed trajectory.

* ✅ **`KNOWN-ISSUES.md` #40 — answered, and the premise was wrong.** The claim was that a disrupted index offers a subset of a clean one's options, so routing on it cannot do better — and 28 of 200 journeys did. **Delaying a service moves its departure later, and a later departure is one a slightly late traveller catches.** Separating the kinds: cancellations alone improve **0 of 98** journeys on the committed world and **0 of 200** on a generated one, while making 7 and 21 worse. Removal-monotonicity holds exactly; the test asserts that half, demonstrates the other on a two-stop fixture, and is no longer `todo`.

  The same premise sat in the information-set audit's bound, which was **above an achievable outcome on 12 of 98 journeys** on the committed world and 30 of 200 on a generated one. It now takes every delay and only the cancellations a player could know — sound, and deliberately weaker than the `P0` quarantine, so the leak detector is the blind-hit statistic.

  One real gap turned up while checking and is closed: walk transfers were rationed by a budget of *rides*. Chaining them changes 2 of 596 query-policy pairs and improves both. The committed world's headroom rose from **8.37m to 8.48m** — the first time "headroom is understated" has had a number rather than an argument behind it.
* ✅ **The calibrated pair, re-measured** on the generator as it stood on 2026-09-08, at three seeds. `competent` 0.365 → 0.422, `tuned` 0.371 → **−0.619**: both halves hold at Tier 3. On the four-reference profile three references agree within noise and `blind` differs by **1.1×** it, which the report calls *not matching* — a marginal verdict on three samples, and honest either way. The generated world's gates are unchanged at **31 %** of headroom, because the walk fix touched only the committed world.
* ❌ **Transfer coverage — the verdict does not hold at Tier 5** (`KNOWN-ISSUES.md` #48). `tuned` carried cal5-a's answer key to cal5-b and scored *better* (+0.045): **the worlds are too alike**, which is the row the two-sided test exists to catch. Two Tier-5 worlds share 80 % of their conflict list and 66 % of their conflicts-with-strengths, against 65 % and 41 % at Tier 3, because the quota exhausts sections B and D at the top *and* `_pick`'s bias draws the strongest rung 86 % of the time. **Tier 1 cannot be *transfer*-tested at all, which is not the same as lacking variety** — it has more than any other rung since `#43` (two Tier-1 worlds share 29 % of their conflict list, against Tier 5's 80 %). It is cosmetic-only, so both worlds' answer keys are byte-identical — all zero displacement, all `iso_offset` — and a test whose second half asks *did the memorised specifics matter* has nothing to ask about.

**Exit:** the monotonicity test is no longer `todo` ✅; every difficulty figure quoted in the documentation was measured on the current generator ✅ *when ticked — superseded, see below*; the transfer verdict holds at a second tier ❌ *— met at P1M8, see below*.

**Corrected 2026-09-13, against what P1M8 measured.**

* **The third clause is met, at three rungs rather than two.** On `LADDER_VERSION` 4, `npm run transfer` at ten seeds holds both halves at `metro-town`, `metro-city` and `towns-and-rail` — `competent` moves +0.038, +0.028 and +0.039, `tuned` collapses by 0.947, 0.218 and 0.370, with the key resolving every away operator by kind and rank (`KNOWN-ISSUES.md` #59, #61, #62). The rung it originally failed at, Tier 5, no longer exists (`#51`). Measured on single-centre rungs only: a region's towns tie on everything a rename leaves, so its operators cannot be keyed.
* **The second clause held when it was ticked, and does not hold now.** Three generator changes followed it — `B-dst-offset` left the draw (`#57`, `LADDER_VERSION` 2), each rung fixed its offsetless count (`#58`, 3), and each rung declared its radial headways (`#61`, 4). Figures measured on `LADDER_VERSION` 4 are the ones recorded under P1M8; every earlier figure stands for the generator of the milestone it is quoted with, and none of them may be quoted as current. **As worded, the clause cannot be re-ticked without re-measuring every difficulty figure in the documentation**, so it is recorded as superseded rather than re-asserted.
* **The first clause stands.** `src/router/test/monotone.test.ts` asserts removal-monotonicity and is not `todo`.

**Started 2026-09-13 — the second clause, re-established rather than re-ticked.** Its rule is the one the Risks section below already states: *a number quoted after its generator changed is a defect, and P2M0 re-measures rather than re-labels.* In scope are the six documents that describe the project as it is now — `CLAUDE.md`, `ROADMAP.md`, `README.md`, `docs/PHASES.md`, `docs/SCORING.md` and `docs/REFERENCE-POLICY.md` — which quote a difficulty figure on about a hundred lines. `BUILD-LOG.md` and `KNOWN-ISSUES.md` record what was true on the day, which is their purpose, and are not.

* **A figure presented as the current state of a generated world is re-measured on the current generator.** Five such claims were found:

  | where | claim | measured at | re-measurement |
  |---|---|---|---|
  | `CLAUDE.md` | a generated world passes all three gates, 1b at 0.393, Gate 3 at 31 % | P1M4 | P1M8's gates at three rungs, already taken |
  | `CLAUDE.md` | six-seed stability, hand-built and generated | P1M2 | `npm run stability` on `m1` and a calibrated `metro-city` world |
  | `docs/SCORING.md` | the identifiability floor does not grow with tier | P1M1 | `npm run identifiability` per rung, and on a region |
  | `docs/SCORING.md` | `P0a`'s floor is 0.19 min, 6 % of headroom | before P2M0 | `npm run identifiability` on `m1` |
  | `ROADMAP.md` | an uncalibrated world is a draw from 0.097 to 0.260 | P1M4 | the P1M8 calibration logs — done, below |

* **A figure recording a finding keeps its number and gains its date**, because what it measured no longer exists to measure again: the `#56` walls, all of which carried a setting that has since left the draw, and a P1M8 sweep still described as owed.
* **Figures about `m1` stay current unless something moved under them.** It is hand-built and the generator's versions do not touch it; the router last changed at P2M0 itself.

**Exit, restated 2026-09-13:** every figure in those six documents that describes a generated world as it is now was measured on the current generator, and every other figure is either dated or about `m1`. *As first worded the clause asked for every difficulty figure, which cannot be met once a figure's subject has been removed from the generator; the restatement is recorded here rather than made silently.*

**Re-established 2026-09-13.** Each claim, and what it reads now:

* **Generated-world gates** (`CLAUDE.md`): pass at every rung that carries conflict — 1b at 0.487, 0.158 and 0.094; Gate 3 at 25 %, 58 % and 62 % — replacing P1M4's 31 %.
* **Six-seed stability** (`CLAUDE.md`): `m1` 7.80m headroom at sd 10 %, and conflict cost 2.87m at 19 %. A calibrated `metro-city` world reads 11.07m at 7 %, conflicts 6.30m at 12 %, and **`P1−P2` 0.19m at 130 %**: on the current generator a lazy integration's gain over none is inside its own noise.
* **The identifiability floor** (`docs/SCORING.md`): under 0.1 min across the scored population at `metro-town` and `metro-city`, **0.23 min (2 %) at `towns-and-rail`**, 0.15 min on a region, and 0.13 min (2 %) on `m1`. It grows at the top rung, where P1M1 had found it flat, and it now comes from hub stands and metro platforms rather than collapsed stations. Recorded as a dated re-measurement after the P1M1 table, not over it.
* **The uncalibrated range** (Risks): on `naive`, `metro-city`'s 36 draws across six cities span −0.598 to −0.291, against a quoted 0.097 to 0.260.
* **`m1`'s gates**, re-run because two things moved under them: 1a, 1b and Gate 2 unchanged, and **Gate 3 at 38 %** (3.10m of 8.12m matched headroom), against the quoted 35 %, since `#56` made the ablation compare matched populations. Its clearance bars are −0.600 / −0.152 / 0.058 / 0.156 / 0.304, after `#58` changed what the reference player believes.
* **Findings dated rather than re-measured:** the `#56` walls, all carrying a setting that has since left the draw, and the P1M8 sweep that was owed and has since been paid.
* **P2M0's own record:** its calibrated pair is dated to the generator of 2026-09-08.

**Reassigned to `P1M7` on 2026-09-08.** It is not reachable while every world of every tier holds the same three operators under the same names, which is what reopening Phase 1 fixes.

**Work done against that third clause before it moved, and what it bought.** The catalogue was widened at its strong end (`B-dst-offset`, `C-cancellation-token`), `generate` lists that hold *kinds* rather than severities are now drawn uniformly instead of by tier, and the answer key was widened from two dimensions to four. Two Tier-5 worlds now share **47 %** of their conflicts-with-strengths against 66 % before, and Tier 3's collapse sharpened to −0.839. **The Tier-5 verdict has not flipped**, and `#48` now says exactly why rather than approximately: that rung's cost is 77 % one conflict, and the two worlds' versions of it decode identically. The options that remain are about which conflict to add next, not about whether the diagnosis is right.

---

### P2M1 — `realtime` — **delivered 2026-09-14**

The clock tracks wall time and the world feels alive.

**The constraint that shapes it:** `realtime` is a *mode*, not a replacement. Open-loop scoring, the golden trajectory and cross-machine comparability all rest on runs being reproducible from a seed, and none of that may weaken because a second mode exists. Simulated time stays a monotonic integer count from the world epoch; wall time is what the scheduler waits on, never what the model reads.

**Two OPEN items are decided here, both from `TIME-MODEL.md`:**

* **§6 — free-running ingestion between ticks.** Natural in `realtime` and it costs nothing there, but it means two code paths for the player, and `PLAYER-CONTRACT.md` §5.6 carries the same question. Decide it once, in both documents.
* **§8 — sub-second resolution.** Currently one second, with milliseconds stored and seconds exposed. Transit does not care; say so and close it, or produce the case that does.

**Exit:** a run in `realtime` produces the same scorecard as the same world in `sim`, up to the disruptions it draws; the golden-trajectory test still reproduces byte-for-byte; and both OPEN items are closed in the specifications rather than in a code comment.

**Decided 2026-09-14**, with the measurements that decided them:

* **An answer lands at its deadline in every mode**, as contract §9.2 already required; `TIME-MODEL.md` §10's *applied on arrival* is corrected. A reference player answers in 1–7 ms against a twenty-second deadline, so effects on arrival would buy nothing observable.
* **§6 — free-running ingestion is permitted in `realtime` and `scaled`, and required nowhere**; ticks stay the path that behaves identically in every mode.
* **§8 — resolution is closed at one second**, and the never-implemented *store milliseconds* is withdrawn.
* **One speed-factor scheduler** paces `realtime` (1×) and `scaled` (N×), sequentially, with wall timing injected so it can be tested without waiting on the wall (`TIME-MODEL.md` §2.3). A late event is issued at once as of its scheduled instant, and records its lag outside the golden hash.

**Exit, restated 2026-09-14.** The default mode is `virtual`, not `sim`, and a whole-day run at 1× takes about 12.5 hours of wall time, so the equivalence is checked at 60×: a `scaled` run of the committed world produces the same traveller outcomes as `virtual`, or each difference is attributed; the golden trajectory still reproduces byte-for-byte, and a `virtual` log carries no pacing field; and both OPEN items are closed in the specifications. *Found while building it:* in open loop a replan is asked ahead of the clock, so only plan deadlines can bind in wall time (`KNOWN-ISSUES.md` #66).

**Delivered 2026-09-14 — the exit met.** At 60× on the committed world both reference players produced the same outcome for every traveller as `virtual` — 98 of 98 each, with no obligation answered differently — and every headline difference is attributed: warnings stamped at the τ they arrived, and feeds read a second later, moving Information's timeliness and the response bytes (`TIME-MODEL.md` §2.3). The golden trajectory reproduces byte-for-byte, a `virtual` log carries no pacing field, 169 tests pass, and both OPEN items are closed in `TIME-MODEL.md` and `PLAYER-CONTRACT.md`.

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

### P2M5 — Regions: a region that is a rung — **carried from P1M7, 2026-09-13**

**Why it exists.** Phase 1 closed on the scale axis. P1M7's claim that shape is a declared axis rather than a difficulty lever was measured and does not hold, and the measurement that finally scored a region's journeys between towns showed that **no region is a rung** (`KNOWN-ISSUES.md` #63, #64, #65):

| tier 4, `LADDER_VERSION` 5 | lazy captures | conflicts cost | screen | against the city, ten seeds |
|---|---|---|---|---|
| city | 0.094 | 60 % | rung | — |
| `polycentric-rail` | 0.769 | 19 % | **easy, thin** | `competent` 0.290 → 0.072, **4.6×** |
| `polycentric-bus` | 0.745 | 19 % | **easy, thin** | `naive` 1.6×, `blind` 1.4×, `competent` 1.5× |
| `polycentric-mixed` | 0.515 | 37 % | **easy** | `competent` 2.1×, `naive` 1.5×, `blind` 1.4× |

**What it has to answer**, none of it by making a conflict bigger:

* **Why a lazy integrator captures three quarters of a region's headroom**, so a region is easy before its conflicts cost much.
* **Why the declared conflicts cost only 19 % of it** on rail and bus.
* **Why `competent` collapses on the rail region** — a harder problem, or a competence it lacks.
* **What the 162 journeys per region that only integration can route are**, and whether they belong in the scored set (`#64`).
* **Then whether shape is an axis at all**, or regions become rungs with their own clearance bar — `#51`'s other option.

**Exit:** a calibrated region screens as a rung, and either agrees with its rung's city within noise or takes its own place on the ladder, by measurement.

**P2M1–P2M4 can run on single-centre worlds**, where Phase 1's exit holds. A playtest on a region waits for this milestone.

---

## Deferred, with the milestone that owns them

| Item | Source | Owner |
|---|---|---|
| Free-running ingestion between ticks in `realtime` | `TIME-MODEL.md` §6, `PLAYER-CONTRACT.md` §5.6 | **P2M1** — decided 2026-09-14: permitted in `realtime` and `scaled`, required nowhere |
| Sub-second time resolution | `TIME-MODEL.md` §8 | **P2M1** — closed 2026-09-14 at one second |
| Ghost-rider capacity denial — needs a background population | `REFERENCE-POLICY.md` §9 | **P2M2** |
| Trajectory in-bundle vs regenerated from seed | `DATA-MODEL.md` §6 | **P2M2** |
| What `capture` normalises against once the day is no longer fixed | `SCORING.md` §2 | **P2M2**, before the first scored closed-loop run |
| `verbatim` logging, and the three trace disclosure levels | `OBSERVABILITY.md` §7, §8 | **P2M3**; assessment-mode redaction in Phase 4 |
| `KNOWN-ISSUES.md` #47 — sections B and D offer no choice of *settings* | `#43`'s invariant test | Restated against measurement at P1M8. Closing it is content work — a second drawable section-B setting — with no milestone yet |
| `KNOWN-ISSUES.md` #48 — the top rung is memorisable | `npm run transfer` | **P1M6**–**P1M7**: the structural ladder is the answer chosen for it — decided 2026-09-11; the transfer holds at three rungs |
| Regions as rungs, and whether shape is an axis — `KNOWN-ISSUES.md` #63, #65 | P1M7's shape clause, not met | **P2M5** |
| `SCORING.md` — `P0a`'s ambiguity floor | `KNOWN-ISSUES.md` #23 | Phase 3. Re-measured at P2M0 on the current generator: under 0.1 min across the scored population at the lower rungs, and **0.23 min (2 %) at `towns-and-rail`**, whose hub has three stands — the large-interchange case this item waited for, and well inside Gate 1a's bar |
| The Information family registers realtime failures and scores them at 0.001 | `SCORING.md` OPEN | Ratified 2026-09-05 to stay open. Reopen on evidence, not on taste |
| `latency: sim` and non-atomic pagination — must arrive together | `DATA-MODEL.md` §4 | Phase 3, or whichever milestone adds pagination |
| Documentation *defects* and per-operator presentation | `CORECONCEPT.md` §2.1 F | Phase 3, gated on `KNOWN-ISSUES.md` #12 |
| Generated verifier quests — Gate 1c's return | `PHASES.md`, Gate 1c | Phase 3, with the documentation work |

---

## Risks

**Reopening a phase is cheap to decide and expensive to finish.** Phase 0 was reopened once, at P1M0, and cost four milestones. Phase 1's reopening cost four more — P1M5 to P1M8 — found three generator defects only by measuring (`KNOWN-ISSUES.md` #57, #58, #61), and closed without finishing its shape axis (P2M5). The argument that justified paying for it still holds for what is left of it: Phase 2 builds a live world, a UI and a playtest **on top of the ladder** — and a playtest run against a world whose tier means something different afterwards is an hour of a stranger's attention spent twice.

**A two-dimensional ladder invites a third dimension.** Scale and shape are enough to state the exit against, and shape has not yet been shown to be an axis at all (P2M5); the temptation will be to add a mode axis, a demand axis, a fidelity axis, each defensible on its own. **Every axis multiplies what must be measured per release** — the gates, the profile and the transfer test already run per rung. Adding one is a decision to be argued in `PHASES.md`, not a parameter to be introduced in the generator.

**A closed loop removes the fixed denominator that makes two scores comparable.** This is the largest design risk in the phase and it is not a coding problem: `capture` is measured against `P1` and `P0a` on *the same day*, and a day that responds to the player's advice is not the same day. Deciding it late means either a scoring change after results exist, or a sandbox that quietly cannot be scored. **P2M2 states the decision as a deliverable** for that reason.

**`realtime` is one `Date.now()` away from breaking every reproducibility guarantee in the project.** The rule is not new — `src/core` and `src/router` may not read a wall clock, and lint enforces it — but a mode whose whole purpose is to track wall time is the first thing that will want to. Wall time belongs to the scheduler that decides *when to advance τ*, never to anything that decides *what happens*.

**A UI has no natural stopping point.** The exit is a legible explanation of a scoring outcome, not a polished map. The honest test is the one `PHASES.md` states: can somebody say why a traveller arrived late without opening a log. Anything past that is Phase 4's problem.

**The playtest can only be spent once per person.** Fresh eyes are the whole instrument, and a session run against a half-built world buys a weaker measurement of the thing nothing else measures. That is the argument for P2M4's position, and also the argument against slipping it again.

**Generated worlds are harder to keep honest than hand-built ones.** The defect audit exists because a world can silently be easier than it declares, and it caught exactly that on its first run against a world where somebody had thought about every setting. Phase 1 found seven more that way. **Every per-world instrument must run against every generated world**, not as a release check.

**A number quoted after its generator changed is the same defect as a threshold quoted after its denominator changed** (`KNOWN-ISSUES.md` #20). The ladder has had five versions, and four of them changed what a generated world measures. P2M0 re-measures the figures that describe current worlds rather than re-labelling them, and dates the findings whose subject no longer exists.

**The router is not optimal, and every number goes through it** (`KNOWN-ISSUES.md` #40). No *comparison* is invalidated, because every baseline and every solution uses the same router and is handicapped identically, but headroom is understated and every absolute journey time is an upper bound. Phase 2 builds a live world on top of it, which is why P2M0 owns it.

**Calibration buys agreement at the cost of an hour.** `npm run calibrate:tier` is a search, so a calibrated world costs six candidate builds and their profiles rather than one build. `npm run world:generate` still produces an *uncalibrated* world in about a minute, and an uncalibrated world is a draw from a wide range. On `naive`, on the current generator, 36 draws of `metro-city` across six cities span **−0.598 to −0.291**; `metro-town`'s twelve span −0.283 to −0.087 and `towns-and-rail`'s −0.529 to −0.353. Calibrating each city to its own median still leaves 0.175 between `metro-city`'s six cities (`KNOWN-ISSUES.md` #61). Whichever is used, the choice should be deliberate.

**Specification drift.** Twelve documents cross-reference each other heavily, and every phase so far has corrected several of them mid-build. **Each milestone ends by reconciling the specifications it touched** — part of the milestone, not cleanup afterwards.
