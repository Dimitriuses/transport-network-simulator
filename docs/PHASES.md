# Phases — Draft v0.1

The long arc of the project. Each phase states **what it delivers**, **what it deliberately does not**, and **how we know it is finished**.

`ROADMAP.md` breaks the phase currently being built into milestones. This document is the level above that.

> ### A note on the word "tier"
>
> `CORECONCEPT.md` §7 already uses **Tier 0–5** for *how hard a world is for the player* — Tier 0 is a one-operator tutorial, Tier 5 is hostile chaos. It appears in the run brief as `run.tier`, and several specifications key behaviour off it.
>
> This document uses **Phase 0–5** for *how far the project has been built*, to avoid two incompatible numbering schemes colliding. **Phase 0 delivers a Tier-2 world.**
>
> If a different word is preferred — Stage, Release, Milestone Group — it is a global rename of this one document plus a line in the README.

Only **Phase 0** carries completion criteria for "is the core loop actually good?", because that question is answered once. Later phases have delivery criteria only.

---

## Phase 0 — MVP: prove the core loop

**The question this phase exists to answer:** is an integration challenge built from semantic conflict actually hard and actually interesting — or does it only sound that way on paper?

Nothing beyond this phase is worth building until that is answered honestly.

### What it delivers

One hand-built world, end to end:

* **A city** — hand-authored or imported, roughly 200–400 quays. Not generated.
* **Three operators** with hand-written, semantically divergent schemas drawn from `CORECONCEPT.md` §2.1 sections A–D — different identity granularity, different time encodings, different units, different realtime honesty. Written by hand, deliberately: the generator's specification is *whatever we find ourselves doing by hand*.
* **Written documentation per operator**, imperfect in the ways real documentation is imperfect.
* **A deterministic simulation core** — discrete-event, virtual clock, seeded RNG, reconstructible state.
* **Live operator APIs** obeying the snapshot rule: responses are pure functions of simulated time.
* **The full player contract** — obligations, ticks, notifications, the control API.
* **P0, P1 and P2** — oracle, reference policy at `timetable` competence, and a lazy-integration baseline.
* **Open-loop scoring** — a fixed query set, capture-based scorecard, attribution stage 1.
* **A reference player** implementing the contract validly but badly.
* **A conformance suite** any candidate player can run against itself.

### What it deliberately does not deliver

No generation of anything. No closed loop. No UI beyond logs and a static map render. No `realtime` or `scaled` time modes. No modelled operator latency. Tiers 3–5 untouched. Nothing hosted.

### Work-completion criteria

Mechanical, and independent of whether the game is any good:

1. All six roadmap milestones (P0M0–P0M6) meet their exit conditions.
2. The golden-trajectory hash test passes in CI — the same seed produces a byte-identical event log across runs and machines.
3. All five world-validation gates pass (`DATA-MODEL.md` §7), including the defect audit confirming every declared conflict is actually present in the projections.
4. The reference player completes a scored run without the simulator crashing, hanging, or producing an `invalid` result.
5. Every specification the phase touched has been reconciled with what was actually built.

### Proof criteria — is the core loop hard and interesting?

`CORECONCEPT.md` §8 states the MVP's purpose as proving the core loop is hard *and* interesting. That needs to be falsifiable, or it gets answered by whoever is most invested in the answer.

**Gate 1 — Buildable.** *Split into three at P0M10, ratified 2026-09-03. Only the first two are gates.*

The gate previously read: *a competent developer, given only the brief and the operator documentation and no help, produces a working solution within a bounded sitting and captures meaningfully above 0.0.* It was measured by running a solution we wrote.

> #### Why it was split
>
> **The gate as written cannot survive Phase 1.** It is measured by running a solution we wrote, and once worlds are generated that becomes unworkable in both directions: a fixed solver will eventually fail on some generated world, and a solver tuned per world makes the gate vacuous. Either way it stops measuring the world and starts measuring us. P0M10 is the demonstration — every point of Gate 1's failure traced to a bug or an overfit assumption in the competent solution, and none to the world.
>
> The tangle is that one instrument is asked three questions:
>
> | | question | property of | computable per world? |
> |---|---|---|---|
> | **1a. Solvable** | does a good solution exist? | world + scoring | **yes** |
> | **1b. Not trivial** | does a lazy approach already max out? | world + lazy strategy | **yes, today** |
> | **1c. Discoverable** | can an engineer *find* one from the artefacts, in an afternoon? | world + documentation + person | **no, ever** |
>
> #### 1b — Not trivial. Already measurable.
>
> `P2rt` must capture well below the achievable ceiling. Nothing new is needed: the calibration already reports it, and the committed world is nowhere near trivial.
>
> #### 1a — Solvable. Two parts, both computable without writing a solver.
>
> **Existence.** `P0a` (`REFERENCE-POLICY.md` §2.1) already establishes that a good outcome is reachable under announcement-limited information. If `P0a` is no better than `P1`, integration cannot help anybody and the world is pointless whatever its conflicts do.
>
> **Identifiability — the part that is missing.** `P0a` is *handed* the canonical world. It therefore proves "if you reconcile perfectly, you do well"; it says nothing about whether reconciliation is *possible from what was published*. A world can be simultaneously solvable-in-principle and unfair, and nothing currently detects that.
>
> The check does not require a solver, only the data:
>
> 1. Take every published observation of every canonical entity, across all operators and all fields — ids, names, coordinates, times, calling patterns.
> 2. For the entities that affect routing, ask whether the map *canonical entity → observation tuple* is injective.
> 3. Where two entities are indistinguishable in **every** published field, no solver can separate them. That is not difficulty, it is an unanswerable question.
>
> This yields more than a verdict. The set of unresolvable ambiguities gives a **lower bound on any solver's loss** — the price of information the world withheld — and *solvable* becomes: the achievable optimum, less that floor, is still meaningfully better than `P1`.
>
> **It is the exact dual of the defect audit.** That one confirms the declared conflicts are present; this one confirms they have not made the world impossible. Both run per generated world, neither needs a solution, and a generator needs both.
>
> **Built at P0M10: `npm run identifiability`.** A quay's signature is every published observation of it — stop id, name and coordinates, from every operator. Two quays with identical signatures are indistinguishable to anybody reading only what was published, and the walk between them is a cost no solver can predict.
>
> One thing is deliberately *not* treated as distinguishing: which trips call there. An operator publishing at Site granularity names one stop for three platforms, and its trips call at that stop — so the calling pattern separates the platforms no better than the stop does. Counting it would report a world as fair on the strength of information the player cannot act on.
>
> **It reports a bound, not a frequency.** How often an ambiguity bites depends on the query set; how much it can cost when it does is a fact about the world. Only the second is claimed.
>
> **What it cannot do.** Identifiability is necessary and not sufficient. Information being present does not make it findable in an afternoon by a person with a deadline. Nothing computable closes that gap, which is why 1c stays separate rather than being quietly folded in.
>
> #### What becomes of the competent reference solution
>
> **Demoted from gate instrument to regression detector.** It is valuable for catching a world that has become accidentally unsolvable by a reasonable strategy, and it is worth keeping current. It stops being evidence about *buildability*, because a solution written by whoever built the world was never evidence about that.
>
> Its score is still reported. It no longer decides a gate.

#### 1c — Discoverable. **Removed from the MVP**, deferred to Phase 3.

Not because it stopped mattering — it is the question `CORECONCEPT.md` cares most about — but because nothing computable answers it and a gate that cannot be evaluated should not sit in the exit criteria pretending to be one. `KNOWN-ISSUES.md` #3 has said since P0M6 that no internal work closes this; P0M10 showed the cost of pretending otherwise.

**How it returns, in Phase 3: generated verifier quests.** Rather than watching someone explore and writing down impressions, the world generates directed tasks against its own answer key — *find the stop these two operators disagree about, and report the distance*; *measure how far behind this feed runs*; *name the two stops whose identifiers collide*. Verifier-only, never served to a player.

That converts discoverability from anecdote into data: a quest has a right answer, so it yields pass/fail per conflict per person, comparable across worlds and across people, and it doubles as a regression test and as the seed of the Tier 0 tutorial.

**The distinction that must not be lost when it arrives.** A quest measures **directed search** — *can you find X, having been told X exists*. A playtest measures **undirected discovery** — *can you work out that X exists at all*. The second is the harder claim and the one §2.1 is really about. Quests are cheaper, repeatable and scorable, and they cannot replace [`PLAYTEST-KIT.md`](PLAYTEST-KIT.md); a world where every quest is passed and no unprompted engineer ever notices a conflict has failed at exactly the thing the quests appear to prove.

#### What can be checked *now*, without people

Neither of these establishes discoverability. Both are **necessary conditions**, and a world failing either is unfair rather than hard — which is worth catching in Phase 0 rather than in a playtest.

**Information present.** The identifiability audit above (1a). If the published data cannot distinguish two entities, no amount of looking will.

**Symptom present.** *Proposed, not yet built.* Every conflict that costs a player points must produce a distinguishable symptom in **player-visible** output — a scorecard line, a traceable failure, a warning that arrived too late. A conflict that silently subtracts capture with no observable consequence is not difficult, it is arbitrary: the player loses and has no thread to pull.

This is checkable against the existing attribution machinery: for each declared conflict, does the player-visible output differ between the world with it and without it? It is the same leave-one-in comparison the ablation already runs, asked of the scorecard rather than of the score.

**Built at P0M10: `npm run symptoms`.** It shares `conflictVariants()` with the ablation, deliberately — a conflict that one instrument scores and the other never builds would let a world pass one for reasons the other never saw.

The symptom vector is attribution causes, traveller failure reasons and the Information family's event counts. **It excludes the score**, because a conflict that moves the number and nothing else is precisely the case being tested for, and including the number would make the check pass on the strength of the thing it is checking.

**Silent is not automatically a failure.** A cosmetic conflict costing nothing *should* be invisible. The combination that makes a world arbitrary is silent **and** costly, so the output is read beside `npm run probe`.

**It must stay a symptom, not a diagnosis.** `OBSERVABILITY.md` §8 sets `attributed` as the default disclosure level precisely because naming the cause hands over the answer key. *"Three travellers missed a connection you budgeted at 60 s that took 210 s"* is a thread to pull. *"`C-coordinate-offset:nordline` cost you 0.54 min"* is the solution.

**Gate 2 — Headroom is real and discriminating.** The P0−P1 gap is large enough that better solutions score visibly better, and two solutions of genuinely different quality separate by a clear margin rather than noise.

*Fails if:* all solutions cluster. A world that cannot tell good from mediocre cannot teach, assess, or benchmark.

**Separation and ordering are different questions.** Separation is `max − min` over the measured solutions. Whether the solution we *believe* is best actually scores best is a fact about that solution and belongs to Gate 1. Conflating them cost P0M10 two milestones of looking at the world for a fault that was in a reference solution (`KNOWN-ISSUES.md` #21).

**Gate 3 — The conflicts are doing the work.** *The real gate.* The attribution report must show that lost capture traces to **declared semantic conflicts** — stop matching, staleness, unit and time mismatches — and not to topology, randomness, or raw routing difficulty.

**Criterion, ratified after P1M0:** the declared conflicts must cost a realtime-aware lazy integrator **at least 20 % of the P0−P1 headroom**, measured against `P0a` — an optimum held to the same announcement horizon (`REFERENCE-POLICY.md` §2.1).

Two things about that wording are the result of getting it wrong first, and both matter:

* **Measured against `P0a`, not `P0`.** P0 is clairvoyant: it routes around disruptions before they are announced. Dividing by a gap containing that advantage measures the oracle's foresight as though it were the world's difficulty, and at a 30-minute planning lead that term is over twenty times the conflict term.
* **Judged on headroom, not on share.** The original wording — "*most* lost capture" — stops being a test under a matched reference. With the conflicts switched off, a lazy integrator is exactly optimal, so the conflict-caused share is 100 % by construction whatever the conflicts do. Share is still reported; it is no longer the binding criterion.

> ### Ratified 2026-09-03 — Gate 3 returns to the metric it was ratified against
>
> P0M8 redefined this gate to attribute across the whole headline score, on the argument that staleness's real damage is that nobody gets warned and that capture alone would miss it. **The argument was sound and its premise was false.** Measured at P0M10 over twelve paired seeds, the Information family moves by 0.001 between a world with every declared conflict and one publishing honest values (`KNOWN-ISSUES.md` #19).
>
> Worse, the redefinition changed the instrument as well as the arithmetic, and that turns out to dominate:
>
> | measured on | what it is | conflict cost |
> |---|---|---|
> | `P2rt`, journey time | the baseline **specified** in `REFERENCE-POLICY.md` §2 | **2.53m — 76 % of headroom** |
> | naive reference player, headline | an HTTP service **we wrote** | 0.129 of the score |
>
> Those are the same conflicts in the same world. Capture is already a fraction of headroom, so the player's capture drop of 0.216 means they cost *it* 0.72m — against `P2rt`'s 2.53m. **A factor of 3.5, from the choice of solver alone**; the remaining ×0.6 is Information failing to move. Decomposed: `0.755 → (÷3.5, solver) → 0.216 → (×0.6, families) → 0.129`.
>
> **This is Gate 1's disease in a second place.** Measuring a gate through a solution we wrote makes the gate about that solution. `P2rt` is defined in a specification; the naive player is an implementation that could change next week and move the gate with it.
>
> **Decided:** Gate 3's criterion is the ratified one — conflict cost as a share of `P0−P1` headroom, on journey time, measured on `P2rt`, averaged over seeds with the paired difference. The whole-score figure is reported as a diagnostic and decides nothing. This resolves `KNOWN-ISSUES.md` #20 without choosing whichever number passes: it returns to the metric that was actually agreed.
>
> **The open question it leaves** is #19 — whether the Information family *should* be movable by a realtime conflict, and what is wrong with either the family or catalogue D if it is not.

*Fails if:* loss is dominated by topology or chance. That would mean we have built a routing puzzle wearing an integration costume, and the central thesis of `CORECONCEPT.md` §2.1 — that semantic variability, not network complexity, is what makes integration interesting — is wrong for this design.

**Gate 3 failing is a legitimate outcome and must be allowed to stop the project.** It is cheap to discover now and ruinous to discover after building generators for the wrong thing. Deciding it honestly is worth more than any milestone in the roadmap.

### Exit

Gates **1a**, **1b**, **2** and **3** pass, or the design is revisited. **Do not begin Phase 1 on a failed Gate 3.**

Gate **1c** (discoverable) is deliberately not in the exit criteria: nothing computable evaluates it, and it returns in Phase 3 as generated verifier quests. Its two *necessary conditions* — information present, symptom present — are in scope here and are the way a discoverability problem gets caught at this phase.

> **This clause was invoked on 2026-09-02.** Gate 3 was recorded as passing at P0M6 and re-measured as failing at P1M0. Phase 0 is reopened: P0M7 (`replan`) and P0M8 (conflict potency) now sit ahead of Phase 1, whose generation milestones are blocked behind their joint exit. See [`../ROADMAP.md`](../ROADMAP.md).

---

## Phase 0 — result

*Measured 2026-09-01 with `npm run gates`.*

> **Superseded on the Gate 3 row — see the correction below.** Gate 3 was recorded as passing at 61 %. Both the baseline it measured and the reference it divided by were wrong, in opposite directions. Corrected at P1M0, the gate **fails**: the declared conflicts cost 3 % of the headroom a player competes for. The original numbers are kept because a result that is quietly rewritten cannot be challenged.

| Gate | Result |
|---|---|
| **1 — buildable** | PASS. A solution built only from the brief and the operator APIs captures **0.292** of the headroom, headline 0.546. |
| **2 — headroom real and discriminating** | PASS. 3.14 min of headroom; four solutions of different quality produce four distinct scores spanning 0.56 of headline. |
| **3 — conflicts are doing the work** | ~~PASS, 61 %~~ → **FAIL.** Conflicts cost 3 % of headroom against a matched reference. Corrected at P1M0; see below. |

### Three things the measurement forced

**Gate 3 needed a different instrument than the one specified.** P2 as defined ignores realtime, so it is *guaranteed* to lose to a disrupted day whether or not any conflict exists — which confounds exactly the question the gate asks. Measured that way, conflicts accounted for 4 % of its loss and the gate failed. So the gate was re-measured on a lazy integrator that *does* handle realtime and therefore differs from a careful one in matching quality alone, and that reported 61 %.

**The 61 % was wrong, and the way it was wrong is the important part.** That realtime-aware baseline was built by handing it `disruptionsForNaive(world, disruptions)` — the world's *true* disruption set. It never read a published feed. So every conflict that lives in a feed — staleness, silently dropped cancellations, delays published in the wrong unit, delays not published at all — cost it **exactly nothing by construction**, and ablation dutifully reported each at zero. The instrument was blind to a quarter of the catalogue and reported the blindness as an absence.

Corrected at P1M0 by `believedDisruptions()`, which polls each operator's feed on a five-minute cadence and believes what it is told. Gate 3 then reads 4 %.

**And the reference it divided by was wrong in the other direction.** That 4 % left 96 % attributed to "everything else", which was never diagnosed. It is not topology: **1.46 of those 2.26 minutes is trouble nobody had announced yet when the plan was made.** §2 of `REFERENCE-POLICY.md` grants P0 "full L1 + perfect realtime" and in the same row calls it "the achievable optimum" — two different objects, since no player can read the future. That foresight sat in the gate's denominator at twenty times the size of its numerator.

Gate 3 now measures against **P0a** (`REFERENCE-POLICY.md` §2.1), an optimum held to the same announcement horizon as the baseline. Two things follow, and the second is the finding:

* With conflicts switched off, `P0a − P2rt` is **exactly zero** — so the conflict-caused *share* is 100 % by construction and has stopped being a test. The gate now judges conflict cost against **headroom**.
* That reads **3 %**, and the gate fails. Reproduce with `npm run gates` and `npm run horizon`.

**Leave-one-out ablation attributes almost nothing, and that is a true fact about the world.** Remove the coordinate offset and a lazy integrator still trips over colliding identifiers; remove those and it still misreads the timestamps. The defects are individually unnecessary and collectively sufficient, so removing any one changes nothing. Leave-*one-in* — switch everything off and add one back — is what measures a defect's standalone contribution.

**One conflict is doing nearly all the work.** Of fifteen declared and audited as present, `C-coordinate-offset` alone accounts for the entire 0.70 min of conflict-caused loss. The other fourteen are real, verified, and individually cost a lazy integrator nothing measurable. *(`A-coordinate-precision` scores −0.34 alone: truncation partially cancels the offset, so adding it in isolation helps.)*

*Corrected at P1M0: with a feed-reading baseline the conflict-caused loss is 0.10 min, not 0.70, and the dominant term turns out not to be conflicts at all — it is the cost of planning half an hour before departure without ever replanning. The finding above understates the problem rather than overstating it.*

### What this says about Phase 1

*(Written when Gate 3 was believed to pass. Phase 1 began on that basis, and P1M0 — whose entire purpose was to test this reasoning — found the gate result unsound. The instruction below survives the correction; only the verdict above it changed.)*

The gates pass, so Phase 1 may begin. But the ablation is a sharper instruction than the verdict:

* **Generate the conflicts that bite.** A generator that samples the catalogue uniformly would spend most of its effort on defects that cost a solver nothing. The ablation report is the tool for finding out which earn their place — and it should be run against every generated world, not just this one.
* **Interaction is the norm, not the exception.** Defects here are jointly sufficient and individually unnecessary. A difficulty model that treats conflicts as independent and additive will be wrong.
* **Gate 1's caveat still stands.** The competent solution was written by someone who had seen the world. That measures whether the world is *solvable*, not whether it is *discoverable*, and no amount of internal testing can close that gap. The first genuine Gate 1 evidence will come from the first stranger who plays.

---

## Phase 1 — Generation

**Delivers:** the ability to produce worlds instead of hand-authoring them — *for the content that Phase 0's attribution showed was carrying the difficulty, and no other.*

Expected order, subject to that evidence:

* **Projection generation** — per-operator manifests sampled from the §2.1 catalogue, parameterised by tier. Almost certainly first: Phase 0's hand-written projections are already manifest-shaped, so this is generating configuration rather than inventing a mechanism.
* **Operator network generation** — routes, patterns, journeys, calendars over an existing city graph. Efficient, inefficient, congested, poorly coordinated.
* **Name generation** — including, importantly, *multiple inconsistent names for the same object*, which is a conflict source rather than decoration.
* **Difficulty parameterisation** — the tier ladder becomes real: generate to a requested tier and verify with the three-gap test.

**Does not deliver:** city generation. That stays deferred to Phase 5.

**Completion:** two independently generated worlds at the same declared tier produce matching P0−P1, P0−P2 and P1−P2 gaps within tolerance, and a solution built for one performs comparably on the other. That is the assessment use case's actual requirement — non-memorisable tasks of equal difficulty — and it is not satisfied by matching conflict lists alone.

---

## Phase 2 — The living world

**Delivers:** the sandbox half of the project, which Phase 0 deliberately skipped.

* **Closed loop** — travellers actually consult the player and act on its answers; the world diverges accordingly.
* **App-user fraction** — a configured share consults the player, the rest follow P1. Bounds request volume, models reality, doubles as a difficulty axis.
* **`realtime` time mode** — the clock tracks wall time; the world feels alive.
* **Monitoring UI** — map replay, vehicle and passenger flows, API request view, and the traveller timeline from `OBSERVABILITY.md` §9 with the player's knowledge state rendered as a band beneath the world's.
* **Closed-loop replay** — recorded player responses replayed for post-hoc debugging.

**Completion:** a player can iterate against a live world and *see* why their solution behaved as it did. The subjective test is whether it is enjoyable to work against; the objective one is whether the traveller timeline explains a scoring outcome without recourse to logs.

---

## Phase 3 — The full ladder

**Delivers:** Tiers 3 through 5, and the fidelity axes that make them possible.

* Catalogue §2.1 E and F in earnest — rate limits, partial outages, pagination over shifting data, incomplete coverage, documentation that disagrees with behaviour and with itself.
* **Documentation defects arrive here, not earlier, and in a fixed order:** accurate documentation is generated at P1M1; defects wait until something can measure them (`KNOWN-ISSUES.md` #12). Section F exists to teach a habit — read the documentation, then verify it — so a world whose documentation is untrustworthy *before* it is worth reading teaches the opposite (`CORECONCEPT.md` §2.1).
* Per-operator documentation *presentation* — a wiki here, Swagger there — as decorative variety between companies. Explicitly not a difficulty axis.
* `single_operator_rt` reference competence from Tier 3, narrowing the headroom and demanding more of the player.
* **`latency: sim`** — per-connection simulated-time cursors, making parallelism a real decision. Note that `DATA-MODEL.md` §4 found a catalogue D defect (non-atomic pagination) depends on it, so this may need to arrive earlier than its tier suggests.
* Mid-run schema drift, high query volume, fault tolerance under load.
* **Generated verifier quests — Gate 1c returns here.** Directed tasks the world generates against its own answer key: *find the stop these two operators disagree about and report the distance*; *measure how far behind this feed runs*; *name the two stops whose identifiers collide*. Verifier-only, never served to a player, and belonging with the documentation work because a quest is a question about what can be found in the artefacts.

  Why here rather than earlier: quests are cheap to generate only once conflicts are generated from declared manifests (P1M1) and documentation exists to be read (also P1M1). Before that there is nothing to generate a quest *from*.

  They convert discoverability from anecdote into data — a quest has a right answer, so it scores pass/fail per conflict per person, comparable across worlds and people — and they double as regression tests and as the seed of the Tier 0 tutorial.

  **Do not let them quietly replace the playtest.** A quest measures *directed search* — can you find X, having been told X exists. A playtest measures *undirected discovery* — can you work out that X exists at all. The second is the harder claim and the one `CORECONCEPT.md` §2.1 is about. A world where every quest passes and no unprompted engineer ever notices a conflict has failed at precisely the thing the quests appear to prove.

**Completion:** a Tier-5 world is solvable by a strong solution and clearly discriminates across the quality range. A Tier-5 world nobody can score above 0.2 on is broken, not hard.

---

## Phase 4 — Distribution

**Delivers:** other people running it without us.

* Packaging — a world as a shareable artefact, addressed by `seed × engine_version`.
* **Agent-benchmark harness** — task specification, machine-readable brief, non-memorisable generated tasks, verifiable scoring. Most of the requirements are already met by design; this is packaging, not invention.
* **Assessment mode** — equal-difficulty world generation, trace redaction (`OBSERVABILITY.md` §8), pass/fail tier clearance.
* Licensing is settled — MIT, see `LICENSING-NOTES.md`. Revisit only if a distributed world bundle ever contains OSM-derived data.
* Optionally: hosting, leaderboards, and the sandboxing that only becomes necessary if we ever execute player code (`TECHNICAL-RESEARCH.md` §10).

**Completion:** someone with no contact with the project clones it, reads the brief, builds a solution, and gets a meaningful score.

---

## Phase 5 — City generation

**Delivers:** full procedural city generation — the thing that was most tempting to build first and is therefore deliberately last.

`CORECONCEPT.md` §1 sets out the staging: hand-authored or imported first, parameterised synthetic second, fully procedural third. `TECHNICAL-RESEARCH.md` §8 identified the trap — city generation is the most enjoyable subsystem to build and the least load-bearing for what makes this project distinctive.

By Phase 5 there will be four phases of evidence about what a city actually needs to provide: which topologies produce interesting transfer structure, how the obvious-interchange set should be shaped, what makes stop matching hard rather than merely tedious. Generating cities before knowing any of that means generating the wrong ones beautifully.

**Completion:** generated cities produce worlds indistinguishable in difficulty and interest from the imported ones, verified by the three-gap test.

---

## Summary

| Phase | Delivers | Finished when |
|---|---|---|
| **0** | one hand-built Tier-2 world, end to end | three proof gates pass |
| **1** | generation of schemas, networks and names | two generated worlds verifiably equal in difficulty |
| **2** | closed loop, realtime mode, monitoring UI | the world is enjoyable to iterate against and explains itself |
| **3** | Tiers 3–5, hostile feeds, latency modes | Tier 5 solvable and discriminating |
| **4** | packaging, benchmark and assessment modes | a stranger can run it |
| **5** | procedural city generation | generated cities match imported ones in difficulty |

Phases 1–5 are sketches. They will be rewritten as each becomes current — and Phase 0's findings will rewrite Phase 1 in particular, which is the intent rather than a shortcoming.
