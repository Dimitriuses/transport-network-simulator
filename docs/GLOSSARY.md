# Glossary

Shared vocabulary across the specifications. Where a term has a precise definition, the authoritative section is cited.

Terms in **bold** within a definition are themselves defined here.

---

## The two numbering schemes

These are the easiest things in the project to confuse.

**Tier** — how hard a *world* is for the player. Tiers 0–5, from a one-operator tutorial to hostile chaos. Determines which **semantic conflicts** are active, how many operators exist, and how unreliable their feeds are. Appears in the run **brief** as `run.tier`. *(`CORECONCEPT.md` §7)*

**Phase** — how far the *project* has been built. Phases 0–5, from the MVP to procedural city generation. **Phase 0 delivers a Tier-2 world.** *(`PHASES.md`)*

**Milestone** — a step within the current phase. P0M0–P0M6 for Phase 0. *(`ROADMAP.md`)*

---

## The three policies

Three different route-choosing behaviours that are constantly compared to each other. *(`REFERENCE-POLICY.md` §2)*

**P0 — Oracle.** Journey planning with perfect information over the full canonical network. Defines the achievable optimum. Never drives the world; it exists to normalise scores, calibrate difficulty, and verify that a world is solvable at all.

**P1 — Reference policy.** How travellers behave in a city with **no integration layer** — planning on published timetables, transferring only at **obvious interchanges**, reacting to disruption rather than anticipating it. Drives the world's population, and is the fallback when the player fails to answer. Its mediocrity is the premise of the project, not a limitation.

**P2 — Naive baseline.** A deliberately lazy *player*: match stops across operators by coordinate proximity alone, ignore realtime. Never touches the world; used only to calibrate how much a world's conflicts cost someone who does the obvious thing badly.

**Headroom** — the gap between P1 and P0. What a working integration layer makes available, and therefore what a player is competing for.

**Obvious interchange** — a **Site** where two or more operators both publish service. P1 may transfer only at these; P0 may transfer anywhere the network physically connects. The difference between those two sets is where the player's value comes from. *(`REFERENCE-POLICY.md` §4.1)*

---

## Scoring

**Capture** — the score. `(m(P1) − m(player)) / (m(P1) − m(P0))` for a metric where lower is better. **1.0** matches the oracle; **0.0** is no better than no integration at all; **negative** means actively harmful; **above 1.0 is impossible** and signals a leak or a bug. *(`SCORING.md` §2)*

**The three families** — Service (did people arrive, well?), Information (did you tell them the truth, in time, without crying wolf?), Cost (what did it take?). Not substitutable for one another, which is why the score is a vector rather than a number. *(`SCORING.md` §3)*

**Profile** — a named, published weighting across the families that produces a headline number. `balanced`, `passenger`, `realtime`, `efficient`. Every reported headline names its profile, because the weighting is a value judgement rather than a fact. *(`SCORING.md` §7)*

**Silent / noisy / late / wrong** — the four information failures. Missing a notification, sending an irrelevant one, sending one too late to act on, and sending one that misdescribes the situation. *(`SCORING.md` §5)*

**Last decision point** — the moment a traveller must commit to an affected leg. A notification arriving after it is information, not help. This is what makes "late" a principled definition rather than a tuned constant. *(`SCORING.md` §5)*

**Forgone obligation** — an obligation the player declined or failed to answer. Carries a fixed penalty *and* the resulting P1 outcomes still count against the player, so that declining everything can never be a winning strategy. *(`REFERENCE-POLICY.md` §8)*

**Three-gap test** — two worlds are of equal difficulty when their P0−P1, P0−P2 *and* P1−P2 gaps all match within tolerance. Matching conflict lists is not sufficient. *(`REFERENCE-POLICY.md` §10)*

**Attribution / ablation** — explaining a score by tracing lost capture to specific **semantic conflicts**, re-running the query set with one conflict neutralised at a time. *(`SCORING.md` §10)*

---

## The data model

Three layers with a strict dependency direction; nothing ever flows upward. *(`DATA-MODEL.md`)*

**L1 — Canonical world.** What exists: **Sites**, **Quays**, **Lines**, **Patterns**, **Journeys**, calendars, demand. Immutable after build. Built offline in Python.

**L2 — Simulation state.** What is true at **τ**: vehicle positions, delays, occupancy, cancellations, traveller status. The only mutable thing in the system, and reconstructible from `L1 + seed + event log`.

**L3 — Projections.** What each operator *publishes*, in its own dialect with its own defects. A pure function `(L1, L2@τ, manifest, seed) → bytes`. The only layer the player ever sees.

**Site** — a station complex or interchange. Groups **Quays** a traveller can walk between without leaving it.

**Quay** — a specific boarding location with coordinates: a platform, a stand, a bus stop. All boarding and alighting happens at a Quay.

*Operators publish at different granularities — one names the Site, another names five Quays — and that mismatch is a core challenge rather than an inconvenience.*

**Line / JourneyPattern / ScheduledJourney** — the branded service ("Route 12"); one ordered variant of its Quay sequence; a Pattern plus a start time plus a calendar. Journeys hold *offsets from start*, not absolute times, which makes past-midnight service ordinary rather than special-cased.

**World bundle** — one SQLite file holding L1, the **resolution table**, precomputed distance matrices and the scored query set. Addressed by `seed × engine_version`. *(`DATA-MODEL.md` §6)*

**Resolution table** — the private mapping `(operator, published_id) → canonical entity`. Used by the simulator, oracle and scorer; **never served over any API**. A player that has matched stops correctly has reconstructed part of it by inference, which is the game. *(`DATA-MODEL.md` §4)*

---

## Conflicts and projections

**Semantic conflict** — a disagreement between operators about what is true, what things are, or when things happened. Contrast **cosmetic variation**: renamed fields and different JSON shapes, which a player solves once with an adapter and never thinks about again. Only semantic conflict produces engineering. *(`CORECONCEPT.md` §2.1)*

**The catalogue** — the enumerated conflict types, lettered A–F: identity, time and schedule, units and value semantics, realtime truthfulness, protocol behaviour, coverage and documentation. Section D is the highest-value one. *(`CORECONCEPT.md` §2.1)*

**Projection manifest** — a declarative per-operator description of which conflicts are active and how. Readable by the scorer, which is what makes **attribution** possible. *(`DATA-MODEL.md` §4)*

**Defect audit** — a validation gate confirming that every conflict a manifest declares is *actually present* in the projection output. Catches worlds that are silently easier than they claim. *(`DATA-MODEL.md` §7)*

**Ghost trip** — a trip that vanishes from a realtime feed instead of being marked cancelled. A documented real-world GTFS-RT failure and a catalogue D staple.

**sₖ** — operator *k*'s characteristic staleness. A call at **τ** returns the world as of `τ − sₖ`. Never published to the player; discovering it is part of the challenge.

---

## Time

**τ (tau)** — simulated time. Internally a monotonic integer count of seconds from the world epoch; rendered as RFC 3339 exactly once, at the operator API boundary. *(`TIME-MODEL.md` §8)*

**The two clocks** — simulated time governs everything in the model; wall time governs nothing in it. No quantity that affects a score may derive from wall time. *(`TIME-MODEL.md` §1)*

**`virtual` / `realtime` / `scaled`** — the three time modes. `virtual` jumps event to event and pauses during player calls; it is the default and the only mode whose scores compare. `realtime` tracks wall time for the closed-loop sandbox. `scaled` runs at N× and is quarantined as an opt-in performance tier. *(`TIME-MODEL.md` §2)*

**Snapshot rule** — every operator response is a pure function of `(operator, endpoint, params, τ)`; never of wall time, never of call count. Adopted so a paused clock cannot be exploited; it also makes response bodies regenerable, which is what keeps run logs small. *(`PLAYER-CONTRACT.md` §6.4)*

**Automatic vs manual pause** — an automatic pause happens while an obligation is outstanding, and operator calls are *served* from the frozen snapshot. A manual pause is administrative, and calls *queue* instead. Different events, different correct behaviour. *(`TIME-MODEL.md` §3)*

**`deadline` vs `guard_wall_s`** — the simulated deadline is a fact about the world and decides when an answer takes effect; the wall guard is generous anti-hang machinery and is never scored. *(`TIME-MODEL.md` §4)*

---

## The contract

**Obligation** — something the simulator asks the player: `plan`, `replan`, or `tick`. Pushed to the player's HTTP service. *(`PLAYER-CONTRACT.md` §5)*

**The three channels** — ingestion (player → operator APIs), obligations (simulator → player), dissemination (player → control API). Dissemination must be player-initiated, or information latency measures the simulator's own poll interval. *(`PLAYER-CONTRACT.md` §1)*

**Tick** — a simulator-driven ingestion cue at a player-declared simulated cadence. Exists because in `virtual` mode the clock outruns any player-side polling loop. The player may adapt its cadence via `next_interval_sim_s`. *(`PLAYER-CONTRACT.md` §5.6)*

**Brief** — the machine-readable run manifest: where the operators are, how to authenticate, which obligations are active, how scoring works. Says nothing about operator schemas or quality. The entry point for both humans and agents. *(`PLAYER-CONTRACT.md` §6.1)*

**Operator-scoped reference** — a stop or trip named by *that operator's own published identifier*, never a canonical one. `{"operator":"bus_a","stop":"S49"}`. Canonical IDs would hand over the solved entity-resolution problem. *(`PLAYER-CONTRACT.md` §7)*

**Preparation phase** — a wall-budgeted window before the run in which the clock does not advance and the player builds its model. Prevents penalising solutions for cold ingestion, which is a property of the world's size rather than the solution's quality. *(`PLAYER-CONTRACT.md` §4)*

**Capability** — something the player declares it implements. Unclaimed capabilities are scored as *forgone*, not *failed*, so a partial solution is a valid participant. *(`PLAYER-CONTRACT.md` §5.2)*

---

## Modes, runs and logs

**Open loop** — the world runs a fixed trajectory independent of the player, who is scored against a fixed query set. Fully reproducible. The MVP is open loop.

**Closed loop** — travellers actually consult the player and act on its answers, so the world diverges. Richer, deliberately not reproducible live, but replayable post hoc from recorded responses. *(`CORECONCEPT.md` §3.1)*

**Ghost rider** — a scored traveller in open loop. Their journey is simulated against the fixed trajectory and measured in full, but their boarding does not alter vehicle loads. The exact price of reproducibility. *(`REFERENCE-POLICY.md` §9)*

**App-user fraction** — in closed loop, the share of travellers who consult the player; the rest follow P1. Realistic, bounds request volume, and doubles as a difficulty axis. *(`PLAYER-CONTRACT.md` §11)*

**Run tuple** — `world_seed × engine_version × scorer_version × contract_version × time_mode × latency_mode × hardware_profile × reference_competence`. Scores compare only within an identical tuple. *(`SCORING.md` §9)*

**Golden trajectory** — a CI test that regenerates a known seed and compares a hash of the event log. Catches any unintended change to the engine immediately.

**Information-set audit** — the forensic procedure for an impossible score: compute everything the simulator actually served the player before it answered, and check whether its answer depended on anything outside that set. *(`OBSERVABILITY.md` §5)*

**Log levels** — `score`, `trace` (default), `replay`, `verbatim`. *(`OBSERVABILITY.md` §7)*

**Invalid run** — a run whose outcome depended on the machine rather than the solution: wall guard breached, budget exhausted. Yields *no score*, never a bad one. *(`TIME-MODEL.md` §9)*

---

## Routing

**RAPTOR** — the round-based transit routing algorithm used for P0 and P1. Not Dijkstra-based; examines each route at most once per round; naturally multi-criteria over arrival time and transfer count.

**CSA** — Connection Scan Algorithm. An alternative the player might implement; simpler and very cache-friendly.

Neither is provided to the player. The documentation names them so players are pointed at the literature rather than reinventing Dijkstra badly.
