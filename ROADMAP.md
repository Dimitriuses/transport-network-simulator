# Roadmap

Work still to do. What has already been built, and what it taught us, is in [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md).

Milestones are numbered **`P<phase>M<milestone>`** — `P1M2` is the third milestone of Phase 1. Phases themselves are in [`docs/PHASES.md`](docs/PHASES.md); known defects are in [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md).

**No dates.** Milestones are dependency-ordered and sized relative to each other. Calendar estimates need a capacity figure that is not recorded anywhere.

---

## Where things stand

**Phase 0 is complete.** P0M0–P0M6 delivered one hand-built Tier-2 world end to end, and all three proof gates pass (`npm run gates`, re-run in CI on every build).

| Gate | Result |
|---|---|
| 1 — buildable | PASS — a solution built only from the brief captures 0.292 |
| 2 — discriminating | PASS — four solutions, four distinct scores, 0.56 of spread |
| 3 — conflicts doing the work | ~~PASS — 61 %~~ **FAIL — 4 %.** Corrected at P1M0 with a baseline that actually reads the feeds; see `docs/PHASES.md`. |

**But the gates validated the instruments, and the instruments are now saying the content needs work.** Two findings shape everything below:

* **Of fifteen conflicts declared and audited as present, one does nearly all the work.** `C-coordinate-offset` accounts for the entire conflict-caused loss. The other fourteen are real, verified, and individually cost a solver nothing measurable. A generator that samples the catalogue uniformly would spend most of its effort on ornaments.

* **P1M0 found this understated.** The conflict-depth probe says six of twelve settings can be made to bite at *some* strength on *some* operator, but the committed world places most of them below their threshold or on an operator that cannot express them. Worse, the 61 % above was measured with a baseline handed the true disruption set, so it never read a feed and could not perceive catalogue D at all. Corrected, Gate 3 reads 4 % and fails.
* **Gate 1 was approximated, not tested.** The competent solution was written by someone who had seen the world. That measures whether the world is *solvable*, not whether it is *discoverable*, and no amount of internal work closes that gap.

---

# Phase 1 — Generation

**Goal:** produce worlds instead of hand-authoring them — for the content that actually carries difficulty, and no other.

**Phase exit** (`docs/PHASES.md`): two independently generated worlds at the same declared tier produce matching P0−P1, P0−P2 and P1−P2 gaps within tolerance, and a solution built for one performs comparably on the other.

The first two milestones deliberately generate nothing. Building a generator before knowing which conflicts are worth generating is how a project ends up with fifteen beautifully varied defects and one that matters.

---

### P1M0 — Evidence before generation

Two cheap experiments that answer questions Phase 0 structurally could not.

**A. External playtest.** Give the committed world to one or two engineers who have not seen the repository. Watch. Record where they stall, what they assume, how long before their first scoring run, and what they say about it afterwards.

**B. Conflict-depth probe.** Build world variants with the dominant conflict removed and measure what else bites. Sweep each remaining conflict's parameters — how far must staleness go, how badly must ids collide — before a lazy integrator loses anything measurable.

**Exit:** we can name which conflicts are worth generating and roughly how strong each must be, and we have at least one external data point on discoverability.

**Why this is first, and why it is not optional.** Everything after it depends on knowing which defects earn their place. It costs days rather than months, and it is the only route to genuine Gate 1 evidence — the first honest answer to "is this discoverable?" comes from the first stranger who plays, and nothing we build changes that.

---

### P1M1 — Conflict potency

Act on what P1M0 found. Strengthen the conflicts that can be made to bite, retire the ones that cannot, and add any the probe suggests are missing. Extend the ablation report to run against any world, not only the committed one.

**Exit:** at least five conflicts each independently account for a meaningful share of a realtime-aware lazy integrator's shortfall, and the defect audit still confirms every declared conflict is present.

**The trap to avoid:** it is much easier to make one conflict enormous than to make five matter. A world whose difficulty rests on a single defect is memorisable and teaches one lesson.

---

### P1M2 — Projection generation

Per-operator manifests sampled from the §2.1 catalogue, parameterised by tier. The manifest shape already exists and is already declarative, so this generates configuration rather than inventing a mechanism.

Also serves each operator's `docs_url`, which is currently advertised and unserved (`KNOWN-ISSUES.md` #11). **Accurate documentation only.** Defects wait for Phase 3 and for something able to measure them — a world whose documentation cannot be trusted before it is worth reading teaches players to ignore documentation, which is the reverse of the habit catalogue §2.1 F exists to build.

**Exit:** generated manifests produce worlds whose defect audit passes and whose ablation profile falls within the band their declared tier targets, and every operator serves documentation that matches its own behaviour.

---

### P1M3 — Network generation

Routes, patterns, journeys and calendars over an existing city graph — efficient, inefficient, congested, poorly coordinated. Includes generating the demand table and the scored query set.

**Exit:** a generated network produces headroom comparable to the hand-authored one, with **a query set large enough that the three gaps are stable across seeds**.

That last clause is a prerequisite for P1M5 rather than a nicety. The current world has 22 scored queries, so each is about 4.5 % of the score and the gap estimates are noisier than they look — "two worlds match within tolerance" is not a meaningful claim at that sample size.

---

### P1M4 — Name generation

Names for cities, districts, streets, stops, stations, operators, routes and vehicles — and, importantly, **multiple inconsistent names for the same object**. Naming is a conflict source here, not decoration (`CORECONCEPT.md` §1).

**Exit:** naming conflicts measurably cost a solver that matches on names, and the abbreviation and transliteration variants survive the defect audit.

---

### P1M5 — Difficulty calibration

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

**Equal difficulty is a strong claim.** P1M5's second clause — a solution transferring between worlds — is the real bar, and it is quite possible to satisfy the gap-matching half while failing it. Watch for the temptation to declare victory on the easier half.

**Specification drift.** Twelve documents now cross-reference each other heavily, and Phase 0 corrected several of them mid-build. **Each milestone ends by reconciling the specifications it touched** — part of the milestone, not cleanup afterwards.
