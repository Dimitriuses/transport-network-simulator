# Technical Research

Research supporting the open questions in `CORECONCEPT.md` §9.

Each section states what exists in the world, what it implies for us, and a **recommended default**. Recommendations are proposals, not decisions — they exist so the open questions have a concrete thing to argue against.

---

## 1. Prior art

Four families of system are relevant. None of them does what we want, but each has solved one of our problems.

### Battlesnake — the closest analogue for the player contract

The player writes a **web server**. The game engine sends it HTTP requests each turn, and the server's responses control the player's behaviour. Key mechanics:

* A fixed per-turn budget, typically **500 ms, explicitly including round-trip latency** — the player is told this budget in the request body, and it can vary per game.
* On timeout, the engine **repeats the player's previous move** rather than failing the run.
* Only HTTP `200` counts as a valid response; anything else is an invalid response.
* Webhooks for lifecycle events (game start, game end).

Why this matters: the model is language-agnostic, requires **no sandboxing at all** (the player hosts their own code), and has a well-tested answer to the "what if the player is slow or broken" question. It is the single strongest piece of prior art for §9.1.

Its weakness: it assumes low-latency, uniform, turn-based interaction. Our player also needs to *pull* large volumes of data on its own schedule, which Battlesnake has no equivalent of.

### Screeps — the opposite model

Players write JavaScript that **runs on the platform**, in a single persistent real-time world, 24/7. Other languages reach it through transpilation or WASM.

Implications: this gives a much stronger "living world" feel and enables a persistent shared universe, but it forces the platform to execute untrusted code (see §7), constrains languages severely, and is a poor fit for the agent-benchmark use case where a submission is an arbitrary program.

### Kaggle environments / Halite / Lux AI — episodic submitted agents

Code is submitted, the platform runs episodes, results are ranked. Good precedent for leaderboards and for reproducible episodic evaluation; same sandboxing burden as Screeps.

### τ-bench / τ²-bench — the agent-benchmark pattern

An LLM agent is given **domain-specific API tools plus written policy guidelines**, and interacts with a simulated user. Each task specifies a customer profile, an instruction, a sequence of golden actions, and a **target database state verified by hash comparison**.

Two lessons:

1. The shape — *task spec + policy documentation + tool APIs + verifiable end state* — is exactly the shape of our benchmark mode, and confirms the "documentation is machine-readable" requirement in the Positioning section.
2. τ-bench verifies by comparing final state to a ground truth. **We can do better**: our scoring is over *outcome metrics* (trip times, failed transfers, information latency), which admits many valid solutions instead of one golden path. That is a genuine advantage — but it only works if the world is deterministic, which is precisely why open-loop mode has to exist.

---

## 2. The player↔simulator contract (Q1–Q8)

> **Superseded in part by [`PLAYER-CONTRACT.md`](PLAYER-CONTRACT.md) v0.1.** Drafting the specification showed the two-model framing below to be one channel short: notifications must be **pushed by the player** to the simulator, or the "delay in dissemination of real-time information" metric measures the simulator's own poll interval rather than the player's responsiveness. The contract therefore has three channels, not two. The analysis below stands as the reasoning that led there.

### The three possible models

| | A. Player as service | B. Player as client | C. Platform executes player code |
|---|---|---|---|
| Direction | Simulator calls the player | Player polls the simulator | Platform runs a submitted artefact |
| Precedent | Battlesnake | ordinary API integration | Screeps, Kaggle |
| Languages | any | any | constrained |
| Sandboxing needed | none | none | **yes, and it is expensive** |
| Fits closed loop | naturally | awkwardly | naturally |
| Fits data ingestion | badly | naturally | naturally |
| Hosted leaderboard | needs a reachable URL | hard | natural |

### Recommendation: A and B together, with C deferred indefinitely

The player's work has two halves, and they want opposite directions:

* **Ingestion** is inherently pull-based. The player polls each operator's API on whatever schedule they choose, handles rate limits, and maintains their own model. This is model **B**, and it is the entire point of the project — it must not be abstracted away.
* **Obligations** are inherently push-based. The world needs to ask the player questions and observe the answers: *plan this journey*, *this passenger is mid-trip and their connection was just cancelled — what now?* This is model **A**.

So: **the player runs one long-lived HTTP service, and also acts as a client of the operator APIs.** Concretely —

* The simulator exposes N operator API endpoints (one per company, each with its own schema and its own misbehaviour) that the player polls.
* The player exposes a small, fixed, well-specified endpoint set that the simulator calls. Proposed minimum: `POST /plan`, `POST /replan`, `POST /notify-ack`, `GET /health`, `GET /identity`.
* Transport is **HTTP/JSON with an OpenAPI description**. gRPC buys performance we do not need and costs accessibility we do need — the audience includes people learning integration, and agents that are much better at HTTP than at protobuf toolchains.
* The player's endpoint set is the *only* part of the interface that is stable and documented perfectly. The operator APIs are deliberately the opposite.

This answers Q1–Q4 and, critically, means **the MVP needs no sandbox at all**: the player runs their own code on their own machine, and the simulator only ever sends it HTTP requests.

### Failure handling (Q6)

Adopt the Battlesnake precedent, adapted:

* Non-`200`, malformed body, or timeout → the world proceeds as if the player had said nothing. The passenger falls back to a documented degraded behaviour (their last known plan, or the reference policy).
* This is **recorded as a scored failure**, not an aborted run. Robustness is part of what is being measured; a solution that crashes on one edge case should lose points, not lose the run.
* A run aborts only if the player is unreachable for a configured consecutive-failure threshold.

### Still genuinely open

* **Q5 (identity/capabilities):** recommend `GET /identity` returning name, version, and a declared capability set, so the simulator can skip obligations the player does not claim to support. Enables partial solutions at low tiers.
* **Q7 (state between runs):** recommend **allowed and explicit**. Precomputation is legitimate engineering. But the run log must record whether the player started warm, and open-loop scoring should report warm and cold scores separately.
* **Q8 (distributed player):** recommend one addressable endpoint as the contract; what is behind it is the player's business. This keeps the door open for the "scaling" challenge type in §6 without complicating the contract.

---

## 3. Time (Q9–Q14)

This is the hardest area and the one most likely to be got wrong quietly.

### The failure mode to avoid

If the simulation is accelerated against wall-clock deadlines, then a correct-but-slow solution fails for reasons that have nothing to do with integration quality, and the project silently becomes a latency benchmark. The concern raised in §9.2 Q11 is real and is the main design constraint here.

### What deterministic simulation testing teaches

The DST tradition — pioneered by FoundationDB, refined by TigerBeetle's VOPR — controls **every** source of non-determinism: virtual clock, seeded RNG, simulated network and disk I/O, single-threaded execution. FoundationDB's simulator runs an entire cluster including simulated disks, networks and machine crashes deterministically; TigerBeetle's compresses months of simulated operation into minutes of wall-clock time. Randomness is not eliminated — it is made reproducible by a global seed the simulator owns.

That is exactly the property open-loop mode needs, and it is only achievable if **the virtual clock is authoritative and the wall clock is not part of the model.**

### Recommendation: two independent budgets

1. **Simulated deadline** — the world's rule. "A passenger will wait `D` simulated seconds for a re-plan before acting on their own." This is part of the world, it is deterministic, and it is scored. It does not depend on how fast the player's machine is.
2. **Wall-clock guard** — an anti-hang timeout only. Generous (seconds), never scored, exists purely so a wedged player does not stall the run.

Latency is recorded in the run log as a **diagnostic**, and is available as a *separate* performance score for those who want it. It is not part of the primary score by default. This answers Q10–Q12.

### Clock advancement (Q13)

Recommend: **the simulation clock pauses while a player request is outstanding** in open-loop mode. This makes the run independent of machine speed, which is what determinism requires.

There is a real information leak here — a player that measures wall-clock time can detect the pause and infer that the world is waiting on it. Mitigations: every timestamp the simulator emits is a simulated timestamp; the API documentation states that wall-clock reasoning is unsupported and may be penalised; and open-loop scoring can inject randomised wall-clock jitter so the signal is not usable. This is worth flagging as a known, accepted imperfection rather than solving perfectly.

In **closed loop**, prefer real-time or bounded-acceleration operation with a Battlesnake-style fixed budget — the sandbox is meant to feel alive, and determinism is already sacrificed there by design.

### Player-side scheduling (Q14)

The player's polling loops run in *their* time. If the simulation is accelerated, a player polling every 30 real seconds is effectively polling every 30 simulated minutes. Two options:

* **Simulated-time acceleration is 1:1 in the MVP** (recommended) — sidesteps the problem entirely while the design settles.
* Later, expose a simulated-clock endpoint (`GET /clock`) and require players to schedule against it. This is a genuine, interesting engineering constraint and could itself become a difficulty axis.

---

## 4. Determinism and reproducibility (Q15–Q19)

### Mechanism

Follow the DST playbook:

* single-threaded event loop, no wall-clock reads anywhere in the core;
* one global seed, threaded explicitly through every RNG consumer — never a module-level default RNG;
* all randomness drawn in a deterministic order from the event loop, never from concurrent code;
* network effects (latency, drops, staleness, rate-limit trips) simulated *inside* the model rather than emerging from the real network.

Anything that reads the real clock, the real network, or an unseeded RNG breaks reproducibility, and doing this retroactively is very expensive — this constraint must be enforced from the first commit.

### Storage of open-loop trajectories (Q16)

Recommend **seed + engine version as canonical**, with a recorded trajectory as an optional cache artefact. Rationale: seeds are tiny, shareable, and make task distribution trivial (Q39). A recorded trajectory is then a build product used to speed up repeated evaluation and to verify that the engine has not drifted.

Corollary — a **golden-trajectory test** in CI: regenerate a known seed and compare a hash of the event log. Any unintended change to the engine breaks the build immediately.

### Versioning (Q17)

Recommend semantic versioning on the engine, with every score permanently tagged `world_seed × engine_version × scorer_version`. Scores are only comparable within the same triple. This is non-negotiable for the assessment and benchmark use cases.

---

## 5. Simulation engine and fidelity (Q27–Q31)

### Existing engines

* **MATSim** — Java, agent-based, mesoscopic, built for large-scale scenarios with activity-based demand and dynamic traffic assignment. Mature and well suited to transport research. For us: far too heavy, hard to embed, and gives us no control over the event loop, which the determinism requirement makes essential.
* **SUMO** — microscopic, space-continuous, per-vehicle interaction. Vastly more road-level fidelity than we need, and a steep learning curve. Relevant only if road congestion ever becomes central.
* **SimPy** — small process-based discrete-event framework in Python. Genuinely useful and cheap to adopt; the main reservation is that its process/generator model makes total control over event ordering and RNG somewhat less explicit than we want.

### Recommendation: write the core

A discrete-event core is a priority queue, an event loop, and a clock — a few hundred lines. Given that the determinism requirement demands ownership of exactly those three things, adopting a framework buys little and costs control. Use existing engines as **references for the domain model**, not as dependencies.

**Discrete-event, not fixed-timestep** (Q27): transit is naturally event-driven (departure, arrival, boarding, alighting, breakdown), and DES is what makes "compress a simulated day into seconds" cheap.

### Fidelity (Q28)

Do **not** model roads or traffic microscopically in the MVP. Model:

* per-segment travel time as a distribution, seeded;
* dwell time at stops, as a function of boardings and alightings;
* congestion as a time-varying speed multiplier on segments or corridors;
* vehicle capacity, and denied boarding when full.

That is sufficient to produce every event type listed in §3 — delays, cascading missed connections, overcrowding — without any road-network simulation.

### Language and scale (Q30–Q31)

Recommend **Python for the MVP**. Iteration speed dominates while the design is unsettled, and a hand-written DES core in Python comfortably handles on the order of 10⁴ passengers over a simulated day. If the "Chaos" tier later demands 10⁵–10⁶ agents, the core is small enough to port to Go or Rust — which is another argument for writing it rather than adopting MATSim.

---

## 6. Data model and the semantic-conflict catalogue (Q32–Q33)

> **Refined by [`DATA-MODEL.md`](DATA-MODEL.md) v0.1.** The "GTFS superset" recommendation below is half right. GTFS is a *publication* format rather than a state model, and its flat stop model cannot express the granularity mismatches catalogue §2.1 A depends on. The canonical model is therefore NeTEx-informed in its identity layer (`Site`/`Quay`, `Line`/`Pattern`/`Journey`) and simulation-native in shape, with **GTFS as a first-class projection target rather than the internal form**. The reasoning below — that the standards' divergence is a free source of authentic variation — stands and is what the projection layer exploits.

### Canonical internal model: a GTFS superset

**GTFS** and **GTFS-Realtime** remain the de facto global standard for multimodal trip planning, even though the EU has made **NeTEx** (static) and **SIRI** (real-time) de jure standards for national access points. **TransXChange** serves the UK and aligns closely with GTFS in principle.

OpenTripPlanner 2 offers a directly applicable precedent: it converts both GTFS and NeTEx into **its own internal model, which is a superset of both**, allowing mixed sources. We should do the same.

Three benefits:

1. It is the model real integration engineers actually face, so the skills transfer — which matters for the training/assessment positioning.
2. The GTFS ↔ NeTEx ↔ TransXChange divergence is a **free, realistic source of semantic variation**: differing scope, differing granularity, differing operational detail. Generated operators can be "GTFS-like", "NeTEx-like", or "proprietary", and the differences will be authentic rather than invented.
3. Existing tooling and validators can be used to check that generated feeds are malformed in the ways we *intended* and well-formed everywhere else.

Per-operator schemas are then defined as **lossy, mutated projections** of the canonical model. That is the cleanest possible framing of the generator: a projection is a declarative object, and the catalogue in §2.1 is a library of projection defects.

### Recommendation for Q33

Declarative manifest **plus** a plugin escape hatch. Most conflicts (unit changes, field renames, staleness offsets, enum remapping, precision truncation) are pure data transforms and belong in a manifest that the evaluator can read to explain a score. A minority (non-atomic pagination, ghost trips, regressing predictions) are stateful and need code. Manifest-first, code where necessary.

### Grounding: the catalogue is not invented

The §2.1 D entries reproduce documented real-world GTFS-RT failures:

* Trip IDs appearing in the real-time feed that no longer exist in the static feed, or stops that have been renumbered — described as **one of the most common causes of "ghost buses"**, where vehicles are moving but journey planners cannot match the update to a scheduled trip.
* Real-time observations that cannot be matched to scheduled records because the `trip_id` is absent from the timetable or the vehicle position falls outside the spatial search radius of candidate stops.
* Static feeds not kept in sync with route, stop and timetable changes, making the real-time feed inconsistent with them.
* A documented class of producer errors around timestamps, trip updates, vehicle positions and alerts.

Google publishes **quality benchmarks for real-time transit data**, and both GTFS static and GTFS-RT have published validation error/warning catalogues. These are worth mining directly — both as a source of further catalogue entries and as inspiration for the information-quality metrics in Q22.

---

## 7. Journey planning, and the scoring oracle (Q20–Q26)

### What the player implements

Journey planning is the player's problem, and the literature is mature:

* **RAPTOR** (Round-bAsed Public Transit Optimized Router) — round-based, not Dijkstra-based, examines each route at most once per round, computes Pareto-optimal journeys over arrival time and transfer count, parallelises easily.
* **CSA** (Connection Scan Algorithm) — organises the timetable as a single array of connections scanned in chronological order; very simple, very cache-friendly.
* For genuinely multimodal networks with unrestricted walking, plain RAPTOR/CSA degrade; **ULTRA** is the current state of the art, precomputing a small shortcut set. **MCR**, **UCCH**, **HLRaptor** and **HLCSA** are the earlier approaches.

We should not provide these — implementing one is a legitimate part of the challenge. But the documentation should *name* them, so players are pointed at the literature rather than reinventing Dijkstra badly. RAPTOR is the right recommendation for a first solution: simple, fast, naturally multi-criteria.

### The oracle — this answers Q21 cleanly

Run **RAPTOR over the simulator's ground truth with perfect information** to compute the optimal journey for every scored query. This gives:

* a **normalisation baseline** — the player's score becomes a ratio against the achievable optimum, which makes scores comparable across worlds of different sizes and shapes;
* a **difficulty calibration instrument** — the gap between the oracle and a lazy integration attempt measures how much a world's conflicts actually cost. [`REFERENCE-POLICY.md`](REFERENCE-POLICY.md) §10 sharpens this into a three-gap test and separates the two baselines this sentence originally conflated (P1, the world's own travellers; P2, a lazy player);
* a **solvability check** (Q34) — if the oracle cannot serve a query, the world is broken, not hard.

This is cheap: the oracle sees the canonical model directly and skips the entire integration problem, which is exactly what makes it an upper bound.

**Recommendation: build the oracle early.** It is the single highest-leverage piece of infrastructure in the project — it turns scoring, calibration and generation validation into one solved problem.

### Scoring shape

Recommend a **small number of independent scores rather than one weighted sum** (Q20):

* *Passenger outcomes* — trip time vs oracle, wait time, failed transfers, non-arrivals.
* *Information quality* — separately measuring wrong, late, and silent. These are three distinct failures and collapsing them hides the interesting behaviour. A solution that says nothing should not score the same as one that confidently says something false.
* *Cost* — API calls, bandwidth, compute (Q23).

A headline number can be derived from these for leaderboards, but the vector must be preserved, and the scorer must attribute loss to specific causes (Q26). Since each world declares its active conflicts (§2.1), the scorer can report *which conflict* cost the player what — turning the score into a diagnostic rather than a verdict.

---

## 8. Map source for Stage 1 (Q36)

* **OSMnx** downloads street networks from OpenStreetMap via the **Overpass API** and models them as NetworkX `MultiDiGraph` objects, with topology correction, projection, plotting, and export to GraphML/shapefile/SVG. It is the standard tool for this and is actively maintained.
* **pyrosm** reads the same data directly from `.osm.pbf` extracts rather than hitting Overpass.
* **StreetGen** exists for in-database procedural generation of street networks, surfaces and street objects — relevant much later, at Stage 3.
* Fantasy/city-art generators produce attractive maps but no routable network. Not usable.

**Recommendation:** ship a **pre-downloaded OSM extract** of one mid-size real city, simplified to a routable graph, committed as a build artefact. Reading a local `.pbf` with pyrosm (or a cached OSMnx graph) means: no network dependency at run time, no Overpass rate limits, and bit-identical input on every run — which the determinism requirement demands. Live Overpass queries are a development convenience only.

Note the licensing constraint: OpenStreetMap data is ODbL, requiring attribution and imposing share-alike obligations on derived databases. This interacts with Q40 and should be checked before anything is published.

---

## 9. Stop matching — what the generator must defeat

The player's stop-matching problem is geospatial entity resolution: composite similarity scoring across attributes, combining string similarity (Levenshtein, Jaro-Winkler) with geographic proximity, then thresholding a combined confidence. Geospatial entity resolution is a recognised sub-problem, distinguished by records having a spatial footprint in addition to textual attributes; recent work compares learned geometry representations against LLMs for it.

**Design implication.** A naive distance threshold plus fuzzy name match will solve an easy world. To make the problem real, the generator must deliberately include:

* **false positives** — distinct stops that are close together *and* similarly named (opposite sides of a large interchange, two "Central Station" stops 200 m apart);
* **false negatives** — the same stop with coordinates 60 m apart and completely unrelated names;
* **granularity mismatches** — one operator's single station node against another's five platform nodes, where the correct answer is a one-to-many mapping, not a match;
* **evidence beyond names and coordinates** — route co-occurrence and timetable correlation should be *necessary* to disambiguate the hard cases, so that the interesting solutions are the ones that use the whole model rather than just strings and distances.

This is the concrete design brief for catalogue section A.

---

## 10. Sandboxing — only if we ever host player code (Q37–Q38)

If the recommendation in §2 is adopted, this is **not an MVP concern**: the player hosts their own service and we only send it HTTP.

It becomes relevant for a hosted leaderboard or a managed benchmark harness. Current state of the art:

* **Docker / runc alone is not adequate** for untrusted code — containers share the host kernel, so a kernel vulnerability or misconfiguration permits container escape.
* **gVisor** interposes a user-space kernel (the Sentry) that handles syscalls, exposing only a minimal vetted subset to the host. Cost: roughly 10–30% overhead on I/O-heavy workloads, minimal on compute-heavy ones.
* **Firecracker** microVMs give each workload its own kernel under KVM: hardware-level isolation, ~125 ms boot, under 5 MiB memory overhead. An attacker must escape both the guest kernel and the hypervisor.

**Recommendation:** defer entirely. If hosting later becomes necessary, Firecracker per submission is the right default — our workload is long-lived and network-bound, so boot time is irrelevant and the strongest boundary is nearly free. The fact that model A avoids this problem for a long time is a significant point in its favour.

---

## 11. Language choice for the core — measured

The question: can a TypeScript/Node core carry a realistic number of simulated passengers over a simulated day?

### Method

An equivalent discrete-event workload was implemented in Node and in Python and run on the development machine (Windows, Node v22.20.0, Python 3.13.7). The workload is a binary-heap event loop over a transit-shaped event mix — passenger start, arrive-at-stop, board, alight, and vehicle-stop events — with 4 000 stops, 2 000 vehicles, 40 stops per vehicle and 3 legs per passenger.

Two JS variants were measured: idiomatic object-per-event, and struct-of-arrays over `Float64Array`/`Int32Array`. Python uses `heapq`, whose C implementation favours it — this is the strongest reasonable Python baseline, not a straw man. All implementations break scheduling ties by insertion sequence, since a real simulator requires deterministic tie-breaking.

Equivalence is enforced, not assumed. The RNG is a mulberry32 that is bit-identical across the two languages, control flow never branches on RNG output, and every implementation emits a final-state checksum. The harness fails the run if the checksums disagree. All configurations reported below agree.

Code: [`benchmarks/des-core/`](benchmarks/des-core/) — `node run-all.mjs` reproduces the tables.

### Results

**200 000 passengers — 2 080 000 events**

| Implementation | Events/sec | Wall time | RSS |
|---|---:|---:|---:|
| Node — typed arrays | **2 504 402** | 0.83 s | 53 MB |
| Node — objects | 1 188 383 | 1.75 s | 100 MB |
| Python — heapq | 147 888 | 14.06 s | — |

**1 000 000 passengers — 10 080 000 events** (a full realistic city-day)

| Implementation | Events/sec | Wall time | RSS |
|---|---:|---:|---:|
| Node — typed arrays | **2 020 063** | 4.99 s | 66 MB |
| Node — objects | 673 262 | 14.97 s | 185 MB |
| Python — heapq | 121 548 | 82.93 s | — |

### Findings

1. **TypeScript is not the constraint.** At the larger scale Node with typed arrays is **~17× Python**; even naive object-based Node is **~5.5×**. A full city-day of ten million events costs about five seconds of core time.
2. **Representation matters more than language.** Typed arrays are **3× faster than objects in the same runtime** — comparable to many cross-language differences, and available without changing language at all.
3. **The object-based version degrades worst under load.** Going from 2 M to 10 M events, throughput fell 43 % for objects, 19 % for typed arrays, 18 % for Python. That is GC pressure from short-lived event objects, and it also shows in memory: 185 MB vs 66 MB. Naive JS is the option whose performance is least predictable as worlds grow — which matters most at the Chaos tier, exactly where headroom is wanted.
4. **Deterministic tie-breaking is not free.** Ordering equal-timestamp events by insertion sequence costs the typed implementation roughly a third of its throughput (≈3.1 M → ≈2.0 M events/sec), because a third parallel array must be sifted. It is nonetheless mandatory — without it, event order at equal timestamps is an implementation detail and reproducibility is lost. Most of the cost is recoverable later by packing timestamp and sequence into a single `f64` key (a day's timestamps and ~10⁷ sequence numbers fit inside 2⁵³ comfortably); not worth doing until the core is otherwise settled.
5. **This measures only the event loop.** Real per-event work is heavier, and the operator API layer plus player round-trips will dominate total run time. Core throughput is unlikely to be the bottleneck in any runtime — which means **performance is the wrong reason to choose TypeScript, and also the wrong reason to reject it.**

Caveats: one machine, one run per configuration, synthetic per-event work. The ratios are large enough that noise is immaterial, but they are directional, not precise.

### Determinism hazards specific to JavaScript

The determinism requirement in §4 interacts with JS in ways that need explicit handling.

* **`Math.random()` is not seedable.** Ban it outright; supply a seeded PRNG (mulberry32, PCG). Trivially solved, but must be a lint-enforced rule, not a convention.
* **Transcendental functions are the real hazard.** ECMA-262 only *recommends* fdlibm for `Math.sin`/`cos`/`tan`; it does not require it, and specifies results as implementation-approximated. In practice V8 statically links its own routines (bundled llvm-libc, fdlibm-derived for sin/cos), so results are consistent across operating systems for a given V8 — but **not guaranteed across V8 versions**. A concrete recent example: `Math.tanh` was changed in V8 14.8.57 / Chrome 148 to call `std::tanh`, which reads the host libm, making it OS-dependent where it previously was not.
  * **Mitigation (recommended):** keep transcendentals out of the simulation core entirely. Geodesic distances are the only real need, and they can be computed once at world-build time and shipped as a `Float64Array`. IEEE-754 `+ - * /` and `sqrt` are exactly specified and reproduce everywhere; only the transcendental library is unstable.
  * **Fallback:** compile fdlibm to WebAssembly and call that. There is direct precedent — this was done specifically because reproducible math was required for game replays.
* **Iteration order is an advantage, not a risk.** JS object key order is specified (integer-like keys ascending, then string keys in insertion order), and `Map`/`Set` preserve insertion order. This is stronger than Go's deliberately randomised map iteration.
* **`async` is the discipline problem.** Promise microtask ordering is deterministic, but real I/O is not, and `async` is idiomatic enough in TS that it will creep into the model if unguarded. **Architectural rule: the simulation core is synchronous; nothing in it may be `async`, and all I/O lives at the boundary.** Enforce with lint.
* **Do not parallelise the core.** `worker_threads` plus `SharedArrayBuffer` would destroy reproducibility. Parallelise across seeds instead — running many worlds is embarrassingly parallel and is what the benchmark and assessment use cases actually need.
* **Numbers are f64 only.** Integer identifiers are exact to 2⁵³, but bitwise operators truncate to int32, which silently caps any packed-field scheme. Fine if deliberate.
* **Erasable syntax is worth adopting as a rule.** Node ≥ 22.18 runs `.ts` files directly by stripping types, with no build step — but only for *erasable* syntax. `enum`, `namespace`, parameter properties and decorators are rejected outright (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`); the benchmark hit this with `const enum` and uses plain consts plus a union type instead. Keeping the whole codebase erasable (TypeScript's own `--erasableSyntaxOnly` enforces it) buys a zero-toolchain path for scripts, tools and benchmarks, and costs almost nothing stylistically.

### The actual argument for TypeScript

It is not speed. It is that **this project's content is schemas and their mutations**, and TypeScript is unusually good at that:

* one language across simulation core, operator API servers, player SDK, and the monitoring UI in §5;
* the canonical model, the per-operator projections, the conflict manifest, the runtime validators, the OpenAPI documents and the generated operator documentation can all derive from a single schema source (Zod / TypeBox → JSON Schema → OpenAPI), which for a generator whose entire job is producing divergent schemas is a substantial structural win;
* the monitoring UI is a web application, so shared types remove a whole class of drift;
* it is the most natural language for a player SDK aimed at HTTP integration work.

Against it: Python's numeric and geospatial ecosystem is far stronger, and the Stage 1 map pipeline (§8, pyrosm/OSMnx) is Python. Scoring analysis and calibration also want pandas.

### Decision

**Adopted: TypeScript for the runtime, Python for offline work** — a hybrid split along the offline/runtime seam, which is clean because world-building already produces a data artefact:

* **Python, offline** — OSM extraction, world building, world validation, scoring analysis and calibration.
* **TypeScript, runtime** — simulation core, operator API servers, player-facing contract, monitoring UI.

Three decisions follow, and all three are expensive to retrofit, so they belong in the first commit:

1. **Struct-of-arrays over TypedArrays for the hot path** — the event queue and per-entity state. Not everywhere; only the core.
2. **No `async` and no wall-clock reads inside the core**, lint-enforced.
3. **No transcendental functions in the core** — precompute geodesic distances at world-build time (which is Python's side of the seam anyway).

Note that performance was *not* the deciding argument. Python at ~122 k events/sec already handles a million-passenger day in 83 seconds, and the API layer will dominate long before the event loop does. The decision rests on the type and schema-sharing story, which is the right basis for it: this project's content is schemas and their mutations, and that is where TypeScript pays. The throughput headroom is a bonus that removes scale as a future concern.

---

## 12. Recommended MVP stack

| Concern | Recommendation | Rationale |
|---|---|---|
| Simulation core | Hand-written single-threaded DES, **TypeScript**, struct-of-arrays hot path | Determinism demands owning the event loop. §11: ~17× Python, but chosen for the type/schema-sharing story rather than for speed |
| Offline pipeline | **Python** — OSM extraction, world building, world validation, scoring analysis | Numeric and geospatial ecosystem; clean seam, since world-building emits a data artefact |
| Clock | Virtual, authoritative, pausable | Prerequisite for open-loop reproducibility |
| RNG | One seed, explicitly threaded | DST practice; no module-level default RNG anywhere |
| Canonical data model | GTFS superset, OTP2-style | Realistic, tooled, and the source of authentic schema divergence |
| Operator APIs | HTTP/JSON, TypeScript, one app per operator, schemas derived from the canonical model | Matches what integration engineers actually face; one schema source feeds validators, OpenAPI and generated docs |
| Player contract | Player-hosted HTTP service, OpenAPI-described; player also polls operator APIs | Language-agnostic, no sandbox, Battlesnake-proven |
| Oracle | Own RAPTOR over ground truth | Normalisation, calibration and solvability in one component |
| Map | Pre-downloaded OSM extract, pyrosm/OSMnx, committed | Deterministic, offline, no rate limits |
| Conflict specification | Declarative manifest, plugin escape hatch | Scorer can read the manifest to explain a score |
| Scoring | Metric vector, oracle-normalised, seed×engine×scorer tagged | Comparable, auditable, diagnostic |
| Sandbox | None | Not needed under the recommended contract |

---

## 13. Status of the open questions

**Answered in draft by [`PLAYER-CONTRACT.md`](PLAYER-CONTRACT.md) v0.1:** Q1–Q8, and materially Q37–Q38, Q41–Q42.

**Answered in draft by [`TIME-MODEL.md`](TIME-MODEL.md) v0.1:** Q9–Q14.

**Answered in draft by [`DATA-MODEL.md`](DATA-MODEL.md) v0.1:** Q32–Q35.

**Answered in draft by [`REFERENCE-POLICY.md`](REFERENCE-POLICY.md) v0.1:** Q29, and Q25 sharpened into a three-gap test.

**Answerable now with the research above:** Q15–Q17, Q21, Q26, Q27–Q28, Q31, Q36.

**Needs a product decision, not more research:** Q18–Q20, Q22–Q24, Q30, Q39–Q40, Q43–Q44.

**Language choice (§11) — decided:** TypeScript runtime, Python offline.

**Critical path.** Contract v0.2, the time model, the data model and the reference policy are all drafted. What remains:

1. **Q20/Q22 — the scoring function.** The last major undecided piece. It inherits a hard requirement from `REFERENCE-POLICY.md` §8 (the forgone-obligation penalty, without which declining everything becomes optimal) and the three-gap calibration structure from §10.
2. **OpenAPI documents and a conformance suite**, generated from the schema source in `DATA-MODEL.md` §5 — the point at which the specifications become executable.
3. **Q30** — target scale, which the benchmark in §11 has already shown is unlikely to bind.

---

## Sources

Prior art and player contract:
- [Battlesnake API Reference](https://docs.battlesnake.com/api)
- [Battlesnake API Introduction](https://docs.battlesnake.com/api/introduction)
- [Battlesnake Webhooks](https://docs.battlesnake.com/api/webhooks)
- [Go Time #182 — Battlesnake engine architecture](https://changelog.com/gotime/182)
- [Screeps Documentation](https://docs.screeps.com/api/)
- [Awesome Programming Games](https://github.com/readyready15728/awesome-programming-games)
- [AI game competitions overview (Halite, Lux AI, Terminal)](https://www.coderone.dev/blog/ai-game-competitions-list/)
- [τ-bench: A Benchmark for Tool-Agent-User Interaction](https://arxiv.org/html/2406.12045v1)
- [τ²-bench repository](https://github.com/sierra-research/tau2-bench)

Determinism:
- [TigerBeetle — Protocol-Aware Deterministic Simulation Testing](https://tigerbeetle.com/blog/2026-08-20-protocol-aware-dst/)
- [Diving into FoundationDB's Simulation Framework](https://pierrezemb.fr/posts/diving-into-foundationdb-simulation/)
- [What's the big deal about Deterministic Simulation Testing?](https://notes.eatonphil.com/2024-08-20-deterministic-simulation-testing.html)
- [Antithesis — Deterministic simulation testing](https://antithesis.com/docs/resources/deterministic_simulation_testing/)

Simulation engines:
- [The Multi-Agent Transport Simulation MATSim](https://www.researchgate.net/publication/301343001_The_Multi-Agent_Transport_Simulation_MATSim)
- [An Overview of Agent-Based Traffic Simulators](https://arxiv.org/pdf/2102.07505)
- [Comparative Evaluation of Road Traffic Simulators](https://www.scitepress.org/Papers/2021/102383/102383.pdf)

Transit data standards and data quality:
- [GTFS-Realtime Reference](https://gtfs.org/documentation/realtime/reference/)
- [GTFS-RT in practice: what operators get wrong about real-time feeds](https://www.pysae.com/content/article/gtfs-rt-practice-operators-mistakes-real-time-feeds)
- [GTFS static validation errors and warnings](https://developers.google.com/transit/gtfs/guides/static-errors-warnings)
- [GTFS-Realtime validation errors and warnings](https://developers.google.com/transit/gtfs-realtime/guides/realtime-errors-warnings)
- [Quality benchmarks for real-time transit data](https://support.google.com/transitpartners/answer/7529583?hl=en)
- [Understanding GTFS, NeTEx and SIRI](https://skedgo.com/understanding-gtfs-and-netex/)
- [Multimodal Transport with NeTEx and GTFS Data Standards](https://mia-platform.eu/blog/multimodal-transport-netex-gtfs-data-standards/)
- [MobiDataLab — State of the Art on Mobility Data Sharing Standards](https://mobidatalab.eu/wp-content/uploads/2022/01/MobiDataLab-D2.4-StateOfTheArtOnMobilityDataSharingStandards-v2.0DRAFT.pdf)

Routing and journey planning:
- [Round-Based Public Transit Routing (RAPTOR)](https://www.semanticscholar.org/paper/Round-Based-Public-Transit-Routing-Delling-Pajor/05f0582d121e04fcb3a7b0b90b18f4c1a9fc03e9)
- [Route Planning in Transportation Networks (survey)](https://arxiv.org/pdf/1504.05140)
- [ULTRA: Unlimited Transfers for Efficient Multimodal Journey Planning](https://pubsonline.informs.org/doi/10.1287/trsc.2022.0198)
- [Efficient Algorithms for Fully Multimodal Journey Planning](https://drops.dagstuhl.de/storage/01oasics/oasics-vol106-atmos2022/OASIcs.ATMOS.2022.14/OASIcs.ATMOS.2022.14.pdf)
- [transnetlab/transit-routing](https://github.com/transnetlab/transit-routing)
- [OpenTripPlanner 2 documentation](https://docs.opentripplanner.org/en/latest/)
- [OpenTripPlanner architecture](https://github.com/opentripplanner/OpenTripPlanner/blob/dev-2.x/ARCHITECTURE.md)
- [OTP Interfaces and Data Sources](https://docs.opentripplanner.org/en/latest/Interfaces-Data-Sources/)

Maps:
- [OSMnx documentation](https://osmnx.readthedocs.io/_/downloads/en/stable/pdf/)
- [OSMnx: Python for Street Networks](https://geoffboeing.com/2016/11/osmnx-python-street-networks/)
- [Modeling and Analyzing Urban Networks and Amenities With OSMnx](https://onlinelibrary.wiley.com/doi/10.1111/gean.70009)
- [StreetGen: city-scale procedural generation of streets](https://arxiv.org/pdf/1801.05741)

Entity resolution:
- [Omni Geometry Representation Learning vs LLMs for Geospatial Entity Resolution](https://arxiv.org/pdf/2508.06584)
- [Fuzzy Name Matching: Methods, Algorithms & Techniques](https://www.babelstreet.com/blog/fuzzy-name-matching-techniques)
- [Fuzzy Matching Guide](https://winpure.com/fuzzy-matching-guide/)

JavaScript determinism and numeric behaviour (§11):
- [MDN — Math](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math)
- [Your Browser Does Math Differently on Every OS](https://scrapfly.dev/posts/browser-math-os-fingerprint/) — V8 statically links its math routines; the `Math.tanh` / V8 14.8.57 regression to host libm
- [Mozilla: Intent to Implement — use fdlibm for Math.cos, Math.sin, Math.tan](https://groups.google.com/a/mozilla.org/g/dev-platform/c/0dxAO-JsoXI/m/eEhjM9VsAgAJ)
- [Math in V8 Is Broken; How Do We Fix It?](https://www.linux.com/training-tutorials/math-v8-broken-how-do-we-fix-it/)
- [v8/third_party/fdlibm](https://chromium.googlesource.com/v8/v8/+/3.28.71.4/third_party/fdlibm/fdlibm.js?autodive=0%2F)
- [ECMAScript Language Specification](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html)
- [Math.pow: potentially different results on different browsers (mdn/browser-compat-data #19429)](https://github.com/mdn/browser-compat-data/issues/19429)
- [V8 Deep Dives: Random Thoughts on Math.random()](https://dev.to/puzpuzpuz/v8-deep-dives-random-thoughts-on-math-random-2ci4)

Sandboxing:
- [How to sandbox AI agents in 2026: MicroVMs, gVisor & isolation strategies](https://northflank.com/blog/how-to-sandbox-ai-agents)
- [Firecracker vs gVisor: Which Sandbox in 2026?](https://www.alekseialeinikov.com/en/blog/topics/devops/microvms-firecracker-vs-gvisor-secure-workloads-2026)
- [Notes on sandboxing untrusted code](https://gist.github.com/mavdol/2c68acb408686f1e038bf89e5705b28c)
- [Let's discuss sandbox isolation](https://www.shayon.dev/post/2026/52/lets-discuss-sandbox-isolation/)
