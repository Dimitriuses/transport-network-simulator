# Roadmap

Work still to do. What has already been built, and what it taught us, is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

Milestones are numbered **`P<phase>M<milestone>`** — `P2M2` is the third milestone of Phase 2. Phases themselves are in [`docs/PHASES.md`](docs/PHASES.md); known defects are in [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md).

**No dates.** Milestones are dependency-ordered and sized relative to each other. Calendar estimates need a capacity figure that is not recorded anywhere.

---

## Where things stand

**Phase 0 is complete**, on a hand-built Tier-2 world of 38 sites, 50 quays, 10 lines and 98 scored journeys.

| Gate | Result |
|---|---|
| 1a — solvable | PASS. 6.20m reachable of 8.37m headroom; unresolvable ambiguity 2 % against a 25 % bar |
| 1b — not trivial | PASS. A lazy integrator captures 0.186 of reachable headroom |
| 1c — discoverable | PASS **by decision** — scope, not evidence |
| 2 — discriminating | PASS. Four distinct scores, in the order §8 wants |
| 3 — conflicts doing the work | PASS. 3.01m, **36 % of headroom**, bar 20 % |

**Phase 1 is complete as of 2026-09-07.** Worlds are generated rather than authored — city, network, conflicts, names and the scored query set — and the phase exit is met: two calibrated worlds of one tier produce matching difficulty profiles, a solution that reasons carries between them, and one that memorised either collapses on the other. The record is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) under *Phase 1 — closed*, including the milestone plans this file used to carry.

| On a generated Tier-3 world | Result |
|---|---|
| Gates 1a / 1b / 2 / 3 | PASS. 10.53m reachable of 12.12m; lazy integrator 0.393; **31 % of headroom** |
| Defect audit, realism, identifiability | pass, per generated world — 15 declared conflicts, all present |
| Two calibrated worlds, four references | agree within noise; `naive` 0.119 apart → 0.022 |
| Transfer, `competent` / `tuned` | 0.441 → 0.441 / 0.430 → **−0.665** |

**What Phase 1 leaves Phase 2**, stated plainly because it shapes the milestones below:

* **The generator is trustworthy and the numbers are not current.** The last change of Phase 1 stopped a tier's quota being spent on texture, which raised semantic content at tiers 2–3 by about two conflicts per world. Every difficulty figure recorded before it — including the transfer figures above — was measured on the older generator.
* **The exit was met on one pair, at one tier, over two seeds.** That is evidence, not coverage.
* **The router underneath every number is not optimal** (`KNOWN-ISSUES.md` #40). No comparison is invalidated, because everything is handicapped identically, but headroom is understated and Phase 2 builds a live world on top of it.
* **Gate 1c is still a decision rather than a measurement.** The playtest has been owed since P1M0 and is scheduled at the end of this phase.

---

# Phase 2 — The living world

**Goal** (`docs/PHASES.md`): the sandbox half of the project, which Phase 0 deliberately skipped — travellers who actually consult the player, a clock that tracks wall time, and a view that explains what happened.

**Phase exit:** a player can iterate against a live world and *see* why their solution behaved as it did. The subjective test is whether it is enjoyable to work against; the objective one is whether the traveller timeline explains a scoring outcome without recourse to logs.

**The order below is a dependency order.** The debts come first, because everything after them is measured through the same router and quoted against the same generator; the playtest comes last, because it is the only item that needs the rest to exist.

---

### P2M0 — The numbers, before the world starts moving

Phase 1 ended with one defect and two measurement debts, and all three get worse once the world stops being a fixed trajectory.

* **`KNOWN-ISSUES.md` #40 — `route` is not optimal, and not even monotone.** Routing a scored journey on a disrupted index beats routing it on a clean one for 28 of 200 queries, which no optimal search can do: a disruption removes a journey or delays it. `src/router/test/monotone.test.ts` states the property and is marked `todo`. **Fix it or bound it** — an honest bound stated in `SCORING.md` is an acceptable outcome; silence is not.
* **Re-measure the calibrated pair.** Rebuild cal-a and cal-b on the current generator and re-run `npm run profile` and `npm run transfer`. The recorded figures are honest measurements of a generator that has since changed, which is the same defect as quoting a Phase 0 number after the denominator moved.
* **Transfer coverage.** A second pair at another rung — Tier 5 for the top, and Tier 1 now that `#43` has given it more than one world — and three seeds rather than two.

**Exit:** the monotonicity test is no longer `todo`; every difficulty figure quoted in the documentation was measured on the current generator; and the transfer verdict holds at a second tier.

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
| `KNOWN-ISSUES.md` #47 — sections B and D offer no choice of *settings* | `#43`'s invariant test | Phase 3, with the ladder — it is catalogue content |
| `SCORING.md` — `P0a`'s ambiguity floor | `KNOWN-ISSUES.md` #23 | Phase 3. Three measurements say 1 %, and none was taken on a city with a large interchange, which is the case that would change the answer |
| The Information family registers realtime failures and scores them at 0.001 | `SCORING.md` OPEN | Ratified 2026-09-05 to stay open. Reopen on evidence, not on taste |
| `latency: sim` and non-atomic pagination — must arrive together | `DATA-MODEL.md` §4 | Phase 3, or whichever milestone adds pagination |
| Documentation *defects* and per-operator presentation | `CORECONCEPT.md` §2.1 F | Phase 3, gated on `KNOWN-ISSUES.md` #12 |
| Generated verifier quests — Gate 1c's return | `PHASES.md`, Gate 1c | Phase 3, with the documentation work |

---

## Risks

**A closed loop removes the fixed denominator that makes two scores comparable.** This is the largest design risk in the phase and it is not a coding problem: `capture` is measured against `P1` and `P0a` on *the same day*, and a day that responds to the player's advice is not the same day. Deciding it late means either a scoring change after results exist, or a sandbox that quietly cannot be scored. **P2M2 states the decision as a deliverable** for that reason.

**`realtime` is one `Date.now()` away from breaking every reproducibility guarantee in the project.** The rule is not new — `src/core` and `src/router` may not read a wall clock, and lint enforces it — but a mode whose whole purpose is to track wall time is the first thing that will want to. Wall time belongs to the scheduler that decides *when to advance τ*, never to anything that decides *what happens*.

**A UI has no natural stopping point.** The exit is a legible explanation of a scoring outcome, not a polished map. The honest test is the one `PHASES.md` states: can somebody say why a traveller arrived late without opening a log. Anything past that is Phase 4's problem.

**The playtest can only be spent once per person.** Fresh eyes are the whole instrument, and a session run against a half-built world buys a weaker measurement of the thing nothing else measures. That is the argument for P2M4's position, and also the argument against slipping it again.

**Generated worlds are harder to keep honest than hand-built ones.** The defect audit exists because a world can silently be easier than it declares, and it caught exactly that on its first run against a world where somebody had thought about every setting. Phase 1 found seven more that way. **Every per-world instrument must run against every generated world**, not as a release check.

**A number quoted after its generator changed is the same defect as a threshold quoted after its denominator changed** (`KNOWN-ISSUES.md` #20). Phase 1's closing change raised semantic content at tiers 2–3 by about two conflicts per world, so the figures it recorded describe a generator that no longer exists. P2M0 re-measures rather than re-labels.

**The router is not optimal, and every number goes through it** (`KNOWN-ISSUES.md` #40). No *comparison* is invalidated, because every baseline and every solution uses the same router and is handicapped identically, but headroom is understated and every absolute journey time is an upper bound. Phase 2 builds a live world on top of it, which is why P2M0 owns it.

**Calibration buys agreement at the cost of an hour.** `npm run calibrate:tier` is a search, so a calibrated world costs six candidate builds and their profiles rather than one build. `npm run world:generate` still produces an *uncalibrated* world in about a minute, and an uncalibrated world is a draw from a range spanning 0.097 to 0.260 on one reference. Whichever is used, the choice should be deliberate.

**Specification drift.** Twelve documents cross-reference each other heavily, and every phase so far has corrected several of them mid-build. **Each milestone ends by reconciling the specifications it touched** — part of the milestone, not cleanup afterwards.
