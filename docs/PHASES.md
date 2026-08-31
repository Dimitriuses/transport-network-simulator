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

1. All six roadmap milestones (M0–M6) meet their exit conditions.
2. The golden-trajectory hash test passes in CI — the same seed produces a byte-identical event log across runs and machines.
3. All five world-validation gates pass (`DATA-MODEL.md` §7), including the defect audit confirming every declared conflict is actually present in the projections.
4. The reference player completes a scored run without the simulator crashing, hanging, or producing an `invalid` result.
5. Every specification the phase touched has been reconciled with what was actually built.

### Proof criteria — is the core loop hard and interesting?

`CORECONCEPT.md` §8 states the MVP's purpose as proving the core loop is hard *and* interesting. That needs to be falsifiable, or it gets answered by whoever is most invested in the answer.

**Gate 1 — Buildable.** A competent developer, given only the brief and the operator documentation and no help, produces a working solution within a bounded sitting and captures meaningfully above 0.0.

*Fails if:* nobody can get anything working — the world is opaque rather than hard. Or everyone reaches 0.9 in an hour — the conflicts are decorative.

**Gate 2 — Headroom is real and discriminating.** The P0−P1 gap is large enough that better solutions score visibly better, and two solutions of genuinely different quality separate by a clear margin rather than noise.

*Fails if:* all solutions cluster. A world that cannot tell good from mediocre cannot teach, assess, or benchmark.

**Gate 3 — The conflicts are doing the work.** *The real gate.* The attribution report must show that most lost capture traces to **declared semantic conflicts** — stop matching, staleness, unit and time mismatches — and not to topology, randomness, or raw routing difficulty.

*Fails if:* loss is dominated by topology or chance. That would mean we have built a routing puzzle wearing an integration costume, and the central thesis of `CORECONCEPT.md` §2.1 — that semantic variability, not network complexity, is what makes integration interesting — is wrong for this design.

**Gate 3 failing is a legitimate outcome and must be allowed to stop the project.** It is cheap to discover now and ruinous to discover after building generators for the wrong thing. Deciding it honestly is worth more than any milestone in the roadmap.

### Exit

All three gates pass, or the design is revisited. **Do not begin Phase 1 on a failed Gate 3.**

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

* Catalogue §2.1 E and F in earnest — rate limits, partial outages, pagination over shifting data, incomplete coverage, documentation that disagrees with behaviour.
* `single_operator_rt` reference competence from Tier 3, narrowing the headroom and demanding more of the player.
* **`latency: sim`** — per-connection simulated-time cursors, making parallelism a real decision. Note that `DATA-MODEL.md` §4 found a catalogue D defect (non-atomic pagination) depends on it, so this may need to arrive earlier than its tier suggests.
* Mid-run schema drift, high query volume, fault tolerance under load.

**Completion:** a Tier-5 world is solvable by a strong solution and clearly discriminates across the quality range. A Tier-5 world nobody can score above 0.2 on is broken, not hard.

---

## Phase 4 — Distribution

**Delivers:** other people running it without us.

* Packaging — a world as a shareable artefact, addressed by `seed × engine_version`.
* **Agent-benchmark harness** — task specification, machine-readable brief, non-memorisable generated tasks, verifiable scoring. Most of the requirements are already met by design; this is packaging, not invention.
* **Assessment mode** — equal-difficulty world generation, trace redaction (`OBSERVABILITY.md` §8), pass/fail tier clearance.
* Licensing (`CORECONCEPT.md` §9.7 Q40), including the ODbL obligations that follow from OSM-derived data.
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
