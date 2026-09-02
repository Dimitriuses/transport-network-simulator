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

**Goal:** a world whose declared conflicts account for at least 20 % of the headroom a player competes for, measured honestly.

**Exit:** `npm run gates` reports three passes, with Gate 3 measured against `P0a` and no gate's criterion weakened to achieve it.

Two milestones, in this order. The order is the point: strengthening conflicts while the planner is still blind means tuning against a suppressed signal, and the likely result is conflicts cranked to absurd strengths to move a number that was never conflict-limited.

---

### P0M7 — `replan`

Issue the `replan` obligation the contract has specified since v0.3 and the harness has never sent (`docs/KNOWN-ISSUES.md` #1). Triggers, positions and response statuses are already fully specified in `PLAYER-CONTRACT.md` §5.5; this implements them.

**Why it is first and why it is not Phase 2 work.** Half of what a live integration layer is *for* — noticing trouble and rerouting somebody around it — is currently unmeasurable, and the measurement above shows it is also suppressing the thing Gate 3 is trying to see. A player who answers once, thirty minutes ahead, cannot be punished for reconciling badly, because it had almost nothing to reconcile.

**Exit:** a traveller whose plan collapses mid-journey is asked again; `P2rt` and `P0a` both replan on the same cadence; and `npm run horizon` shows conflict cost at the harness's planning lead rising towards its short-lead value.

**The trap to avoid:** `replan` must not become a way for a player to be handed information it did not fetch. The obligation says a plan needs revisiting; it does not say why, and the information-set audit must still hold.

---

### P0M8 — Conflict potency

Act on what P1M0 found. Strengthen the conflicts the probe shows can bite, place them on operators that carry enough traffic to express them, retire the ones inert at every setting, and add any the probe suggests are missing. Extend the ablation report to run against any world, not only the committed one.

Concretely, from `npm run probe`:

| Finding | Action |
|---|---|
| `C-coordinate-offset` inert below 260 m; world uses 130 m | raise, or accept it as a Tier-2 setting and stop declaring it as load-bearing |
| `D-staleness` inert below 900 s; world uses 90 and 300 s | raise |
| `sudbahn` expresses nothing at any strength | weight conflict placement by carried traffic |
| `A-granularity`, `A-id-scheme`, `A-naming`, `A-coordinate-source`, `D-silent-cancellation` inert everywhere | make the lazy merger depend on identity, or retire them from the load-bearing catalogue |

That last row is a genuine fork and should be decided explicitly rather than by implementation. Catalogue A is what `CORECONCEPT.md` presents as the heart of the challenge, and it currently costs nothing because `P2` matches on geometry alone. Either the baseline is too narrow to represent a real lazy integrator, or identity reconciliation is not load-bearing in this design. Those call for opposite responses.

**Exit:** Gate 3 passes at ≥ 20 % of headroom, at least five conflicts each independently account for a meaningful share, and the defect audit still confirms every declared conflict is present.

**The trap to avoid:** it is much easier to make one conflict enormous than to make five matter. A world whose difficulty rests on a single defect is memorisable and teaches one lesson. The 20 % threshold can be met by a single 500 m coordinate offset, and that would satisfy the gate while defeating its purpose.

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
