# Transport Network Simulator

## Project Concept

**Transport Network Simulator** — a simulation game focused on engineering challenges, in which a new city, a set of independent transportation companies, and their information systems are generated for each playthrough.

The player’s task is to develop an organizational and software infrastructure that will unite independent carriers into a single transportation network.

The system must allow the end user to:

* plan routes between any two points;
* view current schedules;
* receive information about delays, cancellations, and other changes;
* adjust the route in response to changes in the transportation network.

At the same time, the transportation system continues to operate independently of the integration infrastructure, and the player must develop a method for individual companies to interact with one another.

Each task is likely to be different, so there should be no universal, predefined solution.

---

## Positioning

The project is deliberately built to serve three audiences from one engine. Any design decision that closes off one of these should be flagged.

1. **Game / sandbox** — a single player builds an integration layer for the fun of it, iterating against a living world.
2. **Training and assessment** — a reproducible engineering challenge for onboarding, courses, or technical evaluation. Different candidates receive different generated worlds of equal difficulty, so tasks cannot be memorised or shared.
3. **Agent benchmark** — an environment for evaluating autonomous coding agents. It has the properties such a benchmark needs: procedurally generated (non-memorisable), objectively scored against outcomes rather than against a reference implementation, multi-step, and requiring live interaction rather than one-shot code generation.

The practical consequence: **the player-facing interface must be equally usable by a human and by a program.** Documentation is machine-readable, task definitions are files, scoring is a deterministic function over a run log.

---

# Simulator Structure

## 1. World Generator

Generates the environment in which the transportation system will operate.

### City

* city map generation;
* roads and other transportation infrastructure;
* districts;
* points of interest;
* population and potential locations of transportation demand.

**Staged approach.** Procedural city generation is the most enjoyable subsystem to build and the least load-bearing for what makes this project distinctive. It is therefore explicitly deferred:

* **Stage 1** — hand-authored city, or a real city imported from OpenStreetMap, or an external online map/city generator. Whatever is cheapest.
* **Stage 2** — parameterised synthetic cities (grid, radial, coastal, river-split) sufficient to vary difficulty.
* **Stage 3** — full procedural generation, only if the core loop has proven itself.

The city exists to give the transport network a plausible shape. It does not need to be beautiful to do that.

### Names

Generating names for cities, districts, streets, stops, stations, transportation companies, routes, and vehicles.

The generator must be able to produce **multiple, inconsistent names for the same real-world object** — abbreviations, transliterations, official versus colloquial.

**Reclassified as cosmetic at P0M10.** This section previously insisted naming was *not* cosmetic but a source of integration difficulty. Measurement disagreed: `A-naming` costs a lazy integrator exactly nothing, on either journey time or the Information family, at every setting on every operator. Name variants are texture — they must exist, because a world where every operator spells a place the same way is not recognisable as the real problem — but they are not what makes the world hard.

Honest caveat: the measured zero is partly a property of the instrument. The lazy baseline matches on geometry and never consults a name, so a name variant has nothing to be wrong about. The reclassification is a design judgement — that identity *formatting* is not the challenge — rather than a demonstration that a name-matching solver would be unaffected.

Low implementation priority; high design importance.

---

# 2. Transportation Company Generator

Each transportation company is an independent system.

A company has:

* its own set of routes;
* vehicles;
* a schedule;
* stops and stations;
* operating rules;
* an internal data model;
* its own API.

### Generating Transport Routes

The generator creates the company’s transport network.

Routes can be:

* efficient;
* inefficient;
* congested;
* poorly coordinated with other companies;
* specialized for specific regions.

The network is not guaranteed to be optimal.

### What a generated network must contain, established at P1M2

The list above says what routes may *look* like. It does not say what a network must *have*, and building the generator found that the second question is the load-bearing one. Reading the hand-built city back — `PHASES.md` says the generator's specification is whatever we found ourselves doing by hand — it is six structural roles rather than an arbitrary graph:

| role | why it exists |
|---|---|
| a hub with several quays | makes the Site/Quay distinction real, and is the only thing that lets `A-granularity` be placed at all |
| radials through the hub on alternating stands | so some transfers are free and others cost a walk |
| an orbital that never touches the hub | the only link between two arms; a real decision rather than a detour |
| a chord on a second operator, bypassing the hub | **the headroom** |
| that operator's stops a short walk from the first's, in *separate Sites* | undeclared interchanges: `P0` may transfer there, the reference policy may not |
| a low-reach regional third operator | a third dialect, deliberately marginal |

**The fifth is not a parameter.** The difference between the unrestricted and restricted transfer graphs *is* what a player competes for (`REFERENCE-POLICY.md` §4.1); without undeclared interchanges a network has zero headroom and no scored journey on it can reward integration, whatever else is true of it.

**Two numbers about geometry are load-bearing and were invisible until a generator chose them badly:**

* **A quay must never sit on its own site's centroid.** A Site is a station complex, a Quay a boarding point within it. Placing them identically makes `A-coordinate-source: site` publish exactly what `quay` publishes (`KNOWN-ISSUES.md` #30).
* **Two distinct quays must not sit on top of each other.** The lazy integrator's stop-matching tolerance is derived from the closest genuine pair, strictly below it; let two drift to 7 m apart and the tolerance becomes 6 m, at which point no operator's published position matches any other's and `P2` degenerates into `P1`.

### Generating Information Systems

Every company has its own data representation schema and its own way of being wrong.

---

## 2.1 Semantic Variability — the core generation problem

There are two kinds of difference between operators, and they are **not** equally valuable.

**Cosmetic variation** — renamed fields, different JSON shapes, different casing, different ID formats. Cheap to generate and superficially convincing, but a player writes one adapter per operator and the challenge is permanently solved. Cosmetic variation is *texture*, not content. It must exist, but it must never be the main source of difficulty.

**Semantic variation** — the two systems disagree about what is true, about what things are, or about when things happened. This cannot be solved by an adapter; it requires the player to make engineering judgements, model the domain, and decide what to trust. **This is the actual game.**

The generator is therefore defined as *sampling from a catalogue of semantic conflicts*, parameterised by difficulty — not as a randomiser of field names.

### Two constraints on sampling, both found by measurement

**A conflict must stay something two real operators would do.** Ratified at P0M8. Two operators can disagree about where a stop is; at 500 m apart that is a broken map rather than a disagreement, and it teaches something other than integration. Every catalogue setting carries the strongest value a real pair could differ by and the cause that produces it, and tests enforce it — because every failing-gate pressure this project has met points at "make the conflict bigger", and that route is deliberately closed.

**Realism and measurability are properties of the *combination*, not of each setting.** Found at P1M1, and the reason the paragraph above is not sufficient on its own. The generator drew a lat/lon swap, a 130 m offset and a 3-decimal truncation for one operator, each inside its own ceiling, and published stops 2,200 km from their quays: the world declared three geometry conflicts and contained one, since nothing subtler is observable underneath a swap. Two defences follow:

* **A conflict that masks another may not be generated beside it.** The catalogue carries an `excludes` relation — `C-latlon-order` excludes everything that merely nudges geometry; `D-no-delays` excludes `C-delay-unit`, because an operator that publishes no delay has no delay unit to get wrong. *A conflict that masks another teaches one lesson instead of two.*
* **The composed consequence is measured on the world itself**, by `npm run realism`, so a combination nobody anticipated is still caught. A generator reaches combinations nobody thought about; that is what it is for.

**And a conflict must be one the operator can express.** `A-granularity: site` publishes one stop where there are several quays, and an operator calling at a single platform of every station it serves publishes that already. Declared and absent is a world quietly easier than its tier claims — `KNOWN-ISSUES.md` #30, and Phase 0's Sudbahn finding in a new form.

### Catalogue of semantic conflicts

#### A. Identity and reference

**Not all of A is semantic, and P0M10 sorted it.** The split matters because a generator that samples this section uniformly would spend most of its effort on texture.

*Semantic — the operators disagree about what is true:*

* The same physical stop exists in two operators under different names, with coordinates offset by 10–80 m.
* Granularity mismatch: one operator models a station as a single node, another as separate platforms / quays / entrances.
* ID collisions across operators: both use `stop_1`, `route_5`, `1` — **for different places.** The identifier is genuinely ambiguous, and no adapter resolves that.
* ID instability: identifiers change between feed versions (renumbering).
* ID reuse: a retired stop's ID is reassigned to a different stop.
* A stop that two operators both name identically but which is physically two different stops 200 m apart.

*Cosmetic — texture that must exist and must not carry the difficulty:*

* **ID formatting**: bare integers in one feed, prefixed strings in another. One adapter, solved forever. This was always covered by §2.1's own definition of cosmetic variation ("different ID formats"); it was catalogued as semantic by oversight.
* **Name variants** for one place: abbreviations, transliteration, "St." / "Street", district prefixes, official vs colloquial, renamed-but-still-referenced-by-old-name.

Both measure exactly zero against a lazy integrator, at every setting on every operator, and have since the catalogue was first probed at P1M0. Reclassified rather than deleted: a world without them would not look like the real problem.
*Uncatalogued as yet, and unmeasured:*

* Modelling mismatch: route vs line vs pattern vs trip are conflated differently by different operators.
* Direction modelling: one operator represents a bidirectional line as one route, another as two.

#### B. Time and schedule

* Different time zones; local time with no stated offset; UTC in one feed and local time in another.
* DST transitions, including the duplicated hour and the missing hour.
* Service days extending past midnight (`25:10:00`) vs times wrapped to `01:10:00`.
* Service calendars expressed as weekday bitmasks plus exceptions, vs explicit date lists, vs recurring rules.
* Frequency-based service ("every 8–12 minutes") vs explicit stop times.
* Timestamps as epoch seconds, epoch milliseconds, ISO 8601, or a local-format string.
* Ambiguity between scheduled, estimated and actual times — sometimes within the same field.

#### C. Units and value semantics

* Delay expressed in seconds vs minutes; "early" represented as a negative number, as a separate field, or not at all.
* Coordinates with lat/lon swapped, in a projected CRS, or truncated to three decimal places.
* Distances in metres vs kilometres; speeds in km/h vs m/s.
* Occupancy as an enum, as a percentage, or as a raw passenger count.
* Divergent enumerations: `CANCELLED` / `cancelled` / `3` / `"C"`.
* Null vs absent vs sentinel value (`0`, `-1`, `""`, `"unknown"`) meaning the same thing in one feed and different things in another.

#### D. Real-time truthfulness — the highest-value category

* A feed that is consistently ~90 seconds stale and does not say so.
* A feed that publishes vehicle positions but never cancellations.
* A feed that reports delays only at terminals, so mid-route delay must be inferred.
* Trips that silently disappear from the feed instead of being marked cancelled — "ghost" trips.
* Predictions that regress non-monotonically: delay shrinks, then grows again.
* Non-atomic snapshots: paginated results assembled from different moments in time, internally inconsistent.
* Real-time records referencing trips or stops absent from the static schedule.
* Static and real-time feeds updated on different cadences, so they drift apart.
* "On time" published as a default rather than as an observation.
* An operator whose data is accurate but published five minutes late, versus one that is fast but frequently wrong — forcing the player to adopt an explicit trust policy.

#### E. Transport and protocol behaviour

* Rate limits, quotas, throttling, `429` with or without `Retry-After`.
* Pagination: offset-based over shifting data, cursor-based, or absent with a hard result cap.
* Authentication: key in header vs query string, expiring tokens, per-endpoint scopes.
* Partial availability: one endpoint down while others work; intermittent `5xx`; slow responses.
* Delivery model differences: polling only, webhook push, long-lived stream, or a daily bulk file download.
* Inconsistent error signalling: HTTP `200` with an error body; an empty array meaning both "no results" and "failure".

#### F. Coverage and documentation

* An operator whose feed covers only part of its own network.
* Missing geometry / shapes, so paths must be inferred from stop sequences.
* No inter-operator transfer information at all — transfers must be discovered, not read.
* Undocumented fields; documentation that disagrees with the live API; documentation that is correct but incomplete.
* Documentation that disagrees with **itself** — see below.

### Documentation is here to teach a habit, not to add friction

Section F is the one place where the point is not difficulty. Everything else in this catalogue exists to make integration hard in a way that rewards thinking. Documentation exists to teach one specific professional habit:

> **Read the documentation. Then verify it against what the API actually does.**

That is a real skill, it is rarely taught deliberately, and almost every integration engineer learns it the expensive way. A world where the documentation is worth reading *and* cannot be fully trusted teaches it in an afternoon.

This framing decides several things that would otherwise be arguable.

**Documentation must be worth reading.** If it is absent, wrong in every particular, or too tedious to consult, a player rationally ignores it and reverse-engineers the API instead — and then the world has taught the opposite habit. **The default is accurate documentation.** Defects are the exception, and they must be the kind a careful reader can catch.

**Defects must be verifiable, not merely present.** "This field is undocumented" teaches nothing except that documentation is unreliable in general. "The overview says delays are in minutes and the field reference says seconds, and one API call settles it" teaches the habit precisely. Every documentation defect should have an observation that resolves it.

**Do not make the reader hunt.** A field buried on an obscure page is search cost, not thinking cost. That is the cosmetic/semantic line from the top of this section, and burying things falls on the wrong side of it.

**What an operator documents, decided at P1M1.** The accurate default arrived with the generator, and it needed a rule for *which* of an operator's properties it states:

> **Format and units are documented. Accuracy, freshness and completeness are not.**

An operator can only document what it *intends*. A real agency states its time encoding, its identifier scheme, and whether a position means a station or a boarding point — deliberate choices its own engineers had to make. None documents that its survey is 130 m out, that its feed lags five minutes, or that cancelled trips vanish without notice: it does not know, or would not say.

The effect on this catalogue is that **A and B become readable and C's value errors and all of D do not.** Identifier schemes and time encodings stop being archaeology, which was never the skill being taught; every conflict about whether the data is *true* stays discoverable only by measurement, which is where the difficulty is meant to live. `KNOWN-ISSUES.md` #11 carries the per-conflict table, and `src/projections/test/docs.test.ts` enforces it.

### Why a multi-page wiki, specifically

The obvious argument — real operators publish wikis, so it is more realistic — is not strong enough on its own. Navigation is not reconciliation.

The good argument is structural: **a multi-page wiki can contradict itself, and a generated schema document essentially cannot.** An OpenAPI file produced from `src/schema` is internally consistent by construction; that is the point of generating it. Prose spread across several pages can disagree with the API, with its own examples, and with its other pages — and self-contradiction is a genuine class of defect that has no other home in this catalogue.

Build the wiki for that capability. Not for its shape.

### Format is presentation, not difficulty — deferred

An operator publishing a PDF rather than a wiki, or Swagger rather than prose, is **decorative variety between companies**. It is worth having eventually, for the same reason operator names and liveries are worth having: the world should feel like several companies rather than one company three times.

It is explicitly **not** a difficulty axis, for three reasons:

1. **It is solved once and never thought about again.** Writing a PDF extractor is exactly the "one adapter and the challenge is permanently gone" pattern this section opens by warning against.
2. **Everything interesting about it is really about content.** A PDF describing the API as it was two years ago is interesting because it is *stale*, not because it is a PDF — and a stale OpenAPI file would be exactly as interesting. The format is the wrapper; the defect is the payload.
3. **It penalises agents for the wrong thing.** An agent handed a PDF is being measured on document extraction rather than integration, which cuts against the benchmark positioning in *Positioning* above. The same reasoning already settled `docs_url` (`PLAYER-CONTRACT.md` §6.1): withholding it would test endpoint-guessing rather than integration, and format obfuscation is that argument one step removed.

Deferred to a later phase, and to be taken up for the "wow" rather than counted as difficulty.

### The measurement gap

**No instrument in this project can currently see a documentation defect.** Difficulty is measured through P2, the lazy baseline, and P2 never reads documentation — so ablation would report every conflict in this section at exactly zero, whether or not it costs a real solver anything.

That is uncomfortably close to the position Phase 0 found the rest of the catalogue in, with one important difference: those conflicts *could* be measured and were found wanting, whereas these cannot be measured at all. Any documentation work built before that gap is closed rests on faith.

Recorded in `KNOWN-ISSUES.md`. The first evidence will come from watching a real person meet these APIs (`ROADMAP.md` P1M0).

### Design rule

Each generated world declares which conflicts from this catalogue are active. That declaration **is** the difficulty definition, it is what makes two worlds comparable, and it is what the evaluator uses to explain a score. Nothing is randomised that is not in the catalogue.

Real-world grounding for this catalogue comes from GTFS / GTFS-Realtime practice, and from the divergence between GTFS, NeTEx / SIRI, and national formats such as TransXChange. See `TECHNICAL-RESEARCH.md`.

---

# 3. Transportation Simulation

Simulates the operation of a generated transportation network.

### Passengers

Simulates city residents who:

* have a starting point and a destination;
* have a desired travel time;
* choose a mode of transportation;
* wait for transportation;
* transfer between modes;
* react to delays and changes;
* can change their route or cancel their trip.

### Transportation

Vehicles are simulated:

* operating on schedule;
* carrying passengers;
* running late;
* breaking down;
* subject to rerouting;
* subject to cancellation;
* interacting with other elements of the network.

### Events

The simulator must generate events that change the state of the transportation network: delay, breakdown, trip cancellation, stop closure, route change, overcrowding, and other random or scenario-based events.

### API Environment

Transportation companies’ APIs must return data consistent with the current state of the simulation.

Thus, the API is not a static set of mock responses — it is an interface to a live simulated world.

---

## 3.1 Two simulation modes

The relationship between the player's solution and the simulated world can be closed or open. **The project implements both**, for different purposes.

### Closed loop — the sandbox

Simulated passengers actually consult the player's journey planner and act on its answers. A better solution produces a materially different world: passengers make different choices, load shifts between operators, congestion moves.

* This is the richer, more alive experience, and the primary sandbox mode.
* It creates genuine feedback effects — including the possibility of a solution that degrades the network by routing everybody the same way.
* **Reproducibility is explicitly sacrificed here.** Two runs of two different solutions are not comparable trace-for-trace, and even the same solution may not replay exactly. This is an accepted trade-off, not a defect to be engineered away.
* The seed still fixes the *initial world* — city, operators, schemas, base demand — so starting conditions are identical even though histories diverge.

### Open loop — scoring

The world evolves along a fixed, pre-recorded trajectory that is independent of the player. The player is evaluated against a fixed set of queries and information obligations issued against that trajectory.

* Fully deterministic and replayable from a seed.
* Two solutions can be compared exactly, because they faced an identical world.
* This is the mode used for benchmarking, assessment, agent evaluation, and regression testing of the player's own solution.

### Consequence for the architecture

The simulation core must be able to run with passenger decision-making bound either to an internal reference policy (open loop) or to the player's endpoint (closed loop). That binding is a configuration switch, not two codebases. Designing for this from the start is a hard requirement.

---

# 4. Player’s Task

The player creates their own **project solution** that interacts with the simulated transportation network.

The player must implement the necessary integration infrastructure. For example:

* retrieving data from transportation companies;
* normalizing data;
* matching stops and routes;
* building a unified model of the transportation network;
* route search;
* retrieving and processing real-time data;
* disseminating notifications about changes;
* adapting routes.

The specific set of requirements depends on the generated task.

## 4.1 The player↔simulator contract

**This contract is the actual product.** It determines which languages are usable, how fairness is guaranteed, how the agent-benchmark use case works, and whether performance is being measured deliberately or by accident.

Two draft specifications exist:

* **`PLAYER-CONTRACT.md`** (v0.2) — resolves Q1–Q8 and Q14: three channels, HTTP/JSON, the obligation set (including simulator-driven ingestion ticks), failure semantics.
* **`TIME-MODEL.md`** (v0.1) — resolves Q9–Q14: three time modes with `virtual` as the fair default, two independent deadlines, and the operator snapshot rule that makes a paused clock safe. Modelled operator latency and controlled-hardware performance runs are defined as optional axes, default off.
* **`DATA-MODEL.md`** (v0.1) — resolves Q32–Q35: three layers (canonical world, simulation state, operator projections), with the catalogue in §2.1 realised as declarative per-operator projection manifests.
* **`REFERENCE-POLICY.md`** (v0.1) — resolves Q29 and sharpens Q25: how simulated travellers decide without the player, modelled as a city that has no integration layer. The gap between that and the oracle is the headroom a player competes for.
* **`SCORING.md`** (v0.1) — resolves Q18–Q20 and Q22–Q26: headroom capture as the normalisation, a three-family vector, and score explanation by counterfactual ablation over the declared conflict set.
* **`OBSERVABILITY.md`** (v0.1) — per-traveller causal tracing: what the player fetched while answering, what it replied, and why a traveller went the way it did. Also the forensic procedure for a `capture > 1`.

Implementation is sequenced in **`ROADMAP.md`**, which states which parts of the specifications are in the MVP and which are deferred — the two had drifted apart as the specs grew. §8 below remains the MVP's purpose; the roadmap adds the falsifiable gate that decides whether it succeeded.

The technical options behind these choices are analysed in `TECHNICAL-RESEARCH.md` §2–§4 and §6.

The contract must at minimum define:

* how the player's solution is invoked, and how it addresses the simulator;
* what the simulator is allowed to ask of the player's solution, and with what deadline;
* the relationship between simulation time and wall-clock time;
* what counts as a failure to respond, and what the simulator does about it;
* the isolation and resource limits applied to player code;
* how a task, a world, and a run are packaged and distributed.

---

# 5. Monitoring and Testing

### Monitoring

Monitor the operation of the transportation network and the player's own solution: map, transportation traffic, passenger flows, API requests, delays, route changes, internal system state.

### Testing

Run a series of simulations of the player's solution using the same or different configurations. Comparative testing uses **open-loop** runs, since only those are exactly reproducible.

### Evaluation

The system calculates the solution’s effectiveness. Possible metrics:

* average trip time;
* average wait time;
* number of transfers;
* number of failed transfers;
* number of passengers who did not reach their destination;
* accuracy and timeliness of information;
* delay in the dissemination of real-time information;
* API load;
* resource usage;
* system stability under load.

Scoring is defined as a deterministic function over a run log, so that a score can be recomputed and audited after the fact.

---

# 6. Engineering Challenge

The main feature of the project is that **the player does not receive a ready-made integration solution**.

The player receives:

* a transportation network;
* a set of independent operators;
* documentation and access to their APIs;
* the current state of the simulation;
* success criteria.

Based on this, they must develop a solution on their own.

In the future, there may be various types of engineering challenges:

* integration of multiple APIs;
* building a unified journey planner;
* a real-time system;
* routing under unstable network conditions;
* synchronization between operators;
* identifying and resolving data issues;
* scaling the system;
* fault tolerance.

---

# 7. Difficulty Ladder

Generation is parameterised by difficulty. A world is never uniformly chaotic; it activates a declared subset of the semantic-conflict catalogue in §2.1.

| Tier | Name | Operators | Data | Active conflicts | Player must |
|------|------|-----------|------|------------------|-------------|
| 0 | Tutorial | 1 | Static timetable, one schema | none | answer point-to-point queries |
| 1 | Two worlds | 2 | Static, cosmetically different schemas, **stop mapping provided** | A (cosmetic only) | normalise and merge two models |
| 2 | Integration | 2–3 | Static plus simple delays, **no mapping provided** | A, B, C | match stops and routes; handle time and units |
| 3 | Live | 3–4 | Full real-time, events, reacting passengers | + D | maintain a live model; issue notifications; re-plan |
| 4 | Hostile | 4–6 | Unreliable, throttled, partially stale feeds | + E, F | build a trust policy; degrade gracefully |
| 5 | Chaos | 6+ | High load, faults, mid-run schema drift | all | scale, stay fault-tolerant, self-heal |

Independent difficulty axes, which the tiers combine but which remain separately configurable:

* number of operators;
* degree of schema divergence (cosmetic → semantic);
* real-time fidelity (none → complete → deliberately unreliable);
* event frequency and severity;
* API reliability, latency and rate limits;
* query volume and concurrency;
* network topology complexity — how many transfers a typical trip requires.

Onboarding is a first-class requirement, not a later polish task. A player must be able to succeed at Tier 0 within an hour.

---

# 8. MVP

The concept above describes roughly five separate hard products. The MVP deliberately implements none of the generators.

**In scope:**

* one hand-authored city — imported or hand-drawn, not generated;
* three operators with **hand-written** schemas that differ *semantically*, drawn from the catalogue in §2.1;
* a deterministic discrete-event simulation core with an explicit virtual clock;
* HTTP APIs per operator serving live simulation state, plus written documentation for each;
* **open-loop mode only**, with a fixed query set;
* a scoring script producing a reproducible number from a run log;
* no UI beyond logs and a static map render.

**Explicitly out of scope for the MVP:** city generation, name generation, schema generation, closed-loop passenger feedback, a monitoring UI, multiplayer, leaderboards, packaging as a product.

**Purpose:** prove that the core loop is hard *and* interesting with hand-made content. Only the parts of that content that demonstrably carried the difficulty are then worth generating. Building generators first inverts the risk — it produces a large amount of machinery before anybody knows whether the game is any good.

---

# General Model

```text
                 WORLD GENERATOR
                       │
          ┌────────────┴────────────┐
          │                         │
        CITY                 TRANSPORT OPERATORS
          │                         │
          │             ┌───────────┼───────────┐
          │             │           │           │
          │           Bus A       Bus B       Metro
          │             │           │           │
          │             └───────────┼───────────┘
          │                         │
          └─────────────┬───────────┘
                        │
                 LIVE SIMULATION
                        │
             ┌──────────┼──────────┐
             │          │          │
         Passengers  Vehicles     Events
             │          │          │
             └──────────┼──────────┘
                        │
                      APIs
                        │
                        ▼
               PLAYER SOLUTION
                        │
             ┌──────────┼──────────┐
             │          │          │
          Routing     Realtime   Integration
             │          │          │
             └──────────┼──────────┘
                        │
                        ▼
                    EVALUATOR
                        │
                 performance score
```

## Loop modes

```text
  OPEN LOOP  (scoring, benchmarking, regression testing)

    seed ──► world ──► fixed trajectory ──► queries ──► PLAYER ──► answers ──► score
                            │                                                    ▲
                            └────── evolves independently of the player ─────────┘


  CLOSED LOOP  (sandbox — the interesting one)

    seed ──► world ──► simulation ◄──────────────┐
                            │                    │
                            ▼                    │
                       passengers ──► ask ──► PLAYER
                            │                    │
                            └── act on answer ───┘
                            │
                            ▼
                     world diverges — not replayable
```

---

# 9. Open Questions

These must be answered before implementation begins. `TECHNICAL-RESEARCH.md` investigates the options and proposes a default for most of them; the decisions themselves are still open.

## 9.1 Player↔simulator contract

1. Does the player run a long-lived service that the simulator calls, or a client that polls the simulator? Or both, for different obligations?
2. If the simulator calls the player, what is the request set? Plan a journey, notify of a change, answer a health check — what else?
3. Is the transport HTTP/JSON, gRPC, or something else? Is there one contract, or does the player choose?
4. Are player solutions language-agnostic by construction, or is there a supported set of languages with provided SDKs?
5. How does the player's solution declare its identity, version and capabilities to the simulator?
6. What happens on a non-response, a malformed response, or a crash — retry, treat as failure, substitute the previous answer, or abort the run?
7. May the player hold state between runs (a warm cache, precomputed indices)? Is that a feature or an exploit?
8. May the player's solution be multi-process or distributed, or must it be a single addressable endpoint?

## 9.2 Time

9. Does the simulation run at wall-clock speed, faster, or as fast as the participants allow?
10. Is the player's response latency measured in wall time, in simulated time, or ignored?
11. If the simulation is accelerated, how do we stop it from silently becoming a performance benchmark that penalises correct-but-slow solutions?
12. Is there a per-request deadline? Is it fixed, or does it scale with the acceleration factor?
13. Does the simulation clock pause while waiting for the player — and if so, does that leak information about the world's state?
14. How does the player's own internal scheduling (polling intervals, periodic refresh) map onto simulated time?

## 9.3 Determinism and reproducibility

15. Exactly which sources of non-determinism does open-loop mode control — RNG, clock, network ordering, I/O — and by what mechanism?
16. Is the open-loop trajectory generated once and recorded, or regenerated from a seed on every run? What is stored, and how large is it?
17. What is the versioning policy for the simulator itself? A change to the scoring engine invalidates past scores.
18. In closed loop, what *is* still guaranteed reproducible — the initial world only, or more?
19. Can a closed-loop run be recorded and replayed for debugging, even if not for scoring?

## 9.4 Scoring and evaluation

20. How are the individual metrics in §5 combined? Weighted sum, Pareto front, or several independent scores?
21. Is there a reference or oracle solution defining the achievable optimum, and is the score normalised against it?
22. How is *information quality* scored — being wrong, being late and being silent are three different failures.
23. How are trade-offs scored, e.g. a solution that achieves better trips at the cost of a hundred times the API calls?
24. Is there a pass/fail threshold, or only a continuous score?
25. How do we verify that two generated worlds are of *equal* difficulty, which the assessment use case requires?
26. Can the scorer explain a score, attributing loss to specific causes?

## 9.5 Simulation fidelity

27. Discrete-event or fixed timestep? At what granularity — per second, per minute?
28. Are roads and congestion modelled, or only schedule adherence?
29. How do passengers decide in open loop, without the player? What reference policy do they use?
30. How many passengers and vehicles must a run support, and what does that imply for the engine and the language choice?
31. Do we build on an existing engine (SimPy, MATSim, SUMO) or write our own core?

## 9.6 Generation

32. What is the canonical internal data model from which per-operator schemas are derived — a GTFS superset, or something native?
33. How is a semantic conflict *specified* — declaratively in a manifest, or as code in a transformation plugin?
34. How do we verify that a generated world is solvable at all, and solvable at the intended difficulty?
35. How is generated API documentation produced, and is it deliberately imperfect (see §2.1 F)?
36. Which external source or service provides the map in Stage 1, and what are its licensing terms and rate limits?

## 9.7 Platform and distribution

37. Does the simulator run locally on the player's machine, as a hosted service, or both?
38. If we execute player code rather than merely calling it, what isolation is required — and does that change the answer to question 1?
39. How is a task or world packaged and shared — a file, a container image, or a seed plus a version number?
40. What is the licence, and does the agent-benchmark use case impose different requirements?

## 9.8 Benchmark and assessment mode

41. What does an agent receive as its task specification, and in what format?
42. Is the agent given the operator documentation, or must it discover the APIs?
43. How do we stop solutions being shared or memorised while keeping difficulty comparable?
44. Is there a fixed public task set for leaderboard comparability, alongside the generated ones?
