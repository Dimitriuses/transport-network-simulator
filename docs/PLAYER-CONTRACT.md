# Player↔Simulator Contract — Draft v0.3

**Status: DRAFT.** A proposal to argue with, not a settled specification. **OPEN** marks what is still undecided.

**Closes:** `CORECONCEPT.md` §9.1 Q1–Q8 (direction, request set, transport, language policy, identity, failure handling, warm state, distribution).
**Implements:** `TIME-MODEL.md` v0.1 (deadlines, ticks, pause semantics, the snapshot rule) and `DATA-MODEL.md` v0.1 §4 (projections, the resolution table).
**Deliberately out of scope:** operator API *design* — those are meant to be non-uniform and badly behaved (`CORECONCEPT.md` §2.1) — and scoring (§9.4).

### Changes in v0.3

| | |
|---|---|
| **`traceparent`** | the simulator sends W3C Trace Context on every obligation; a cooperating player echoes it on operator API calls, letting the run log attribute ingestion to the handler that caused it (`OBSERVABILITY.md` §3). |
| **`tracing` capability** | optional. Attribution in `virtual` mode does not depend on it — the simulator observes both sides — so declining costs only diagnostic precision. |

No payload schema changed in v0.3, and a player that does not declare `tracing` is unaffected.

### Changes in v0.2

| | |
|---|---|
| **`POST /v1/tick`** | new obligation. `GET /v1/clock` alone is insufficient: in `virtual` mode the simulated clock outruns any player-side polling loop, so ingestion cadence must be simulator-driven (`TIME-MODEL.md` §6). |
| **Snapshot rule published** | operator responses are pure functions of simulated time. Now a stated guarantee to the player, not just an internal invariant. |
| **Manual-pause queuing** | `paused` is reported to the player; operator calls queue FIFO; `503` on overflow; `/v1/clock` is exempt. |
| **`guard_wall_s`** | the wall-clock guard now appears explicitly alongside the simulated `deadline`. Two budgets, never conflated. |
| **Brief additions** | `run.wall_budget_s`, `run.pause_queue_depth`, `time_mode`, `latency_mode`. |
| **Run tuple** | extended with `time_mode`, `latency_mode`, `hardware_profile`. |
| **Resolution granularity** | §7 now states that an operator-scoped reference resolves to whatever *that operator* publishes — Site or Quay. |

---

## 1. Decisions

### Q1 — Direction: three channels

The original framing offered a binary — player as service, or player as client. Working through what the world actually needs shows the answer is **three channels**, because the player has three genuinely different relationships:

| # | Channel | Direction | Why it must be this way |
|---|---|---|---|
| 1 | **Ingestion** | Player → Operator APIs | Pull-based by nature. The player decides *what* to fetch; since v0.2 the simulator decides *when* (§5.6). Handling rate limits, staleness and inconsistency is the project. |
| 2 | **Obligations** | Simulator → Player | The world must be able to ask questions and observe the answer under a deadline. Only push gives a measurable response time. |
| 3 | **Dissemination** | Player → Simulator control API | Notifications must be *pushed by the player* for §5's "delay in dissemination of real-time information" to be measurable at all. If the simulator polled for updates, it would be measuring its own poll interval. |

Channel 3 is the one the earlier two-model sketch missed, and it matters: a large part of the stated challenge is *telling people things in time*, and that is only observable if the player initiates.

### Q3 — Transport: HTTP/1.1 with JSON

**Decided: HTTP + JSON, described by OpenAPI 3.1, `application/json; charset=utf-8`.**

* **Language-agnostic with zero toolchain.** Any language with an HTTP server can play. No codegen, no build step, no SDK required.
* **Agent-friendly.** Coding agents handle HTTP/JSON far better than protobuf toolchains. Given the benchmark positioning, this is first-order.
* **Domain-faithful.** Real transit integration is HTTP and JSON. Skills transfer.
* **Debuggable by hand.** `curl` reproduces any interaction; a run log is readable without tooling.

Rejected: **gRPC** (buys performance the contract does not need, costs accessibility it does); **WebSocket/SSE on the main path** (ordering and delivery semantics are harder to make deterministic, and a dropped socket is a messier failure than a failed request — may return for high-volume closed-loop streaming, not in v0.2); **in-process plugin / submitted artefact** (kills language agnosticism and forces sandboxing, `TECHNICAL-RESEARCH.md` §10).

### Q4 — Language policy

**No supported-language list.** The contract is the specification; any HTTP server satisfying it is valid. SDKs may appear later as a convenience, never a requirement.

---

## 2. Architecture

```text
                    ┌──────────────────────────────────────┐
                    │            SIMULATOR                 │
                    │                                      │
   ┌────────────────┤  Operator APIs   (per-operator host) │
   │  1. ingestion  │   bus_a  :9101   ──┐                 │
   │   (pull, on    │   bus_b  :9102   ──┼─ deliberately   │
   │    tick)       │   metro  :9103   ──┘  inconsistent   │
   │                │                                      │
   │  ┌─────────────┤  Control API     :9000               │
   │  │ 3. dissem.  │   /v1/brief  /v1/clock  /v1/notify   │
   │  │  (push)     │                                      │
   │  │             │  Simulation core ── issues ──┐       │
   │  │             └──────────────────────────────┼───────┘
   │  │                                            │
   │  │                              2. obligations│(push)
   ▼  ▼                                            ▼
 ┌────────────────────────────────────────────────────────────────┐
 │                        PLAYER SOLUTION                         │
 │  /identity /health /plan /replan /tick /run-start /run-end     │
 └────────────────────────────────────────────────────────────────┘
```

Channels 1 and 3 make the player an HTTP **client**; channel 2 makes it an HTTP **server**. Both roles are mandatory above Tier 0.

---

## 3. Addressing, identity and auth

* The player is a **single addressable base URL**, `player.base_url`. Whatever sits behind it — one process, a cluster, a load balancer — is the player's business (**Q8**).
* The player receives exactly **one** bootstrap value: `TNS_CONTROL_URL`, plus `TNS_TOKEN`. Everything else, including operator base URLs, comes from the brief.
* Player paths are versioned: `POST {player.base_url}/v1/plan`.

**Auth.** Simulator → player and player → control API both use `Authorization: Bearer <run token>`. The player SHOULD reject other tokens; it is the only guard against a stray caller polluting a scored run. Player → operator APIs uses whatever each operator demands — deliberately inconsistent schemes, described (imperfectly) in each operator's own documentation. That is catalogue §2.1 E, not an oversight.

**Version negotiation.** Every request in both directions carries `X-TNS-Contract: 0.3`. The player declares supported versions in `/v1/identity`. On mismatch the simulator aborts before the run starts. Negotiation never happens mid-run.

**Trace context.** The simulator sends a W3C `traceparent` header on every obligation. A player declaring the `tracing` capability echoes it on the operator API calls it makes while handling that obligation, which lets the run log attribute ingestion to the handler that caused it (`OBSERVABILITY.md` §3). Optional: in `virtual` mode the simulator can attribute calls temporally without it, since the clock is paused for the handler's duration and the simulator serves both sides. Declining `tracing` costs diagnostic precision, never correctness or score.

---

## 4. Run lifecycle

```text
 1. operator + control APIs come up               simulator
 2. player started with TNS_CONTROL_URL,          (external)
    TNS_TOKEN
 3. GET  /v1/brief                                player → control
 4. GET  /v1/health   (polled until ready)        sim    → player
 5. GET  /v1/identity (version, capabilities,     sim    → player
                       tick cadence)
 6. POST /v1/run-start                            sim    → player
 7. ── PREPARATION PHASE ──   simulated clock frozen, wall budget applies
      player ingests, builds its model
 8. ── RUN ──                 clock advances per time_mode
      sim    → /v1/tick        at the declared simulated cadence
      sim    → /v1/plan, /v1/replan
      player → operator APIs (inside tick handlers)
      player → /v1/notify
 9. POST /v1/run-end                              sim    → player
10. scoring, offline, from the run log
```

**The preparation phase is not optional.** Without it every solution is penalised for cold ingestion latency, which is a property of the world's size rather than of the solution's quality. The brief declares `preparation.wall_budget_s`; the simulated clock does not advance during it.

**Preparation is free, and bounded rather than scored.** *Decided at M2.*

Preparation cost is dominated by the size of the world, which the player does not choose. Scoring it would penalise a solution for facing a bigger city — measuring the world rather than the work. The `preparation.wall_budget_s` cap already prevents abuse: a player cannot buy an advantage with unlimited preparation, it simply must finish.

The genuinely interesting version of this question is not preparation at all. It is **recovery**: when an operator's schema drifts mid-run at Tier 5, how fast can a solution rebuild its model *while the world keeps moving*? That is worth measuring, it is a real operational property, and it is a Phase 3 concern. Revisit there — but as recovery, not as preparation.

**Warm starts (Q7).** Persisting state between runs is **permitted and treated as legitimate engineering**, not an exploit. The brief states `run.cold_start`; the run log records it; scoring reports warm and cold separately and never mixes them into one leaderboard.

---

## 5. Player API — the simulator calls these

The player's surface is small, fixed, and — unlike everything else in this project — **documented exactly and honestly**. The contrast with the operator APIs is pedagogical and should be preserved.

### 5.1 Common request envelope

Every obligation carries both budgets from `TIME-MODEL.md` §4:

```json
{
  "contract_version": "0.3",
  "run_id": "run-7f31",
  "issued_at":    "2031-04-07T08:12:00+03:00",
  "deadline":     "2031-04-07T08:12:20+03:00",
  "guard_wall_s": 30
}
```

`deadline` is **simulated** — a fact about the world, identical on every machine. In `virtual` mode an answer takes effect **at `deadline`, always**, whether the player replied in 3 ms or 3 s. `guard_wall_s` is **real**, generous, anti-hang only, and never scored.

### 5.2 `GET /v1/identity`

```json
{
  "name": "my-integrator",
  "version": "0.4.1",
  "contract_versions": ["0.3"],
  "capabilities": ["plan", "replan", "tick", "notify", "tracing"],
  "tick": { "interval_sim_s": 30 }
}
```

`capabilities` lets a partial solution be honest about what it does not implement (**Q5**). The simulator will not issue obligations a player has not claimed, and the scorer records unclaimed capabilities as *forgone* rather than *failed* — so a Tier-0 player that only plans is a valid, scorable participant.

`tick.interval_sim_s` must be ≥ `brief.limits.min_tick_interval_sim_s`. Omit the `tick` capability to receive no ticks at all — legal, and appropriate for a static-timetable Tier 0/1 world.

### 5.3 `GET /v1/health`

`200` with `{"status":"ready"}` when able to serve. Polled only before the run, with a bounded budget from the brief.

### 5.4 `POST /v1/plan`

**Batch-native from the outset** — see §11. A batch of size 1 is normal at low tiers; the schema never changes.

```json
{
  "contract_version": "0.3",
  "run_id": "run-7f31",
  "issued_at": "2031-04-07T08:12:00+03:00",
  "deadline": "2031-04-07T08:12:20+03:00",
  "guard_wall_s": 30,
  "requests": [
    {
      "request_id": "req-000123",
      "traveller_ref": "trv-88431",
      "origin":      { "lat": 50.4501, "lon": 30.5234 },
      "destination": { "lat": 50.4712, "lon": 30.5019 },
      "depart_after": "2031-04-07T08:15:00+03:00",
      "arrive_by": null,
      "preferences": { "max_transfers": null, "walk_speed_mps": 1.3, "accessible": false }
    }
  ]
}
```

```json
{ "results": [ { "request_id": "req-000123", "status": "ok",
                 "itinerary": { "legs": [ ... ] } } ] }
```

`status` ∈ `ok` | `no_route` (the player believes none exists) | `declined` (the player will not answer — honest, and scored more kindly than a wrong answer).

### 5.5 `POST /v1/replan`

Issued when a traveller's plan has become unworkable. Same envelope and batching.

```json
{
  "request_id": "req-000488",
  "traveller_ref": "trv-88431",
  "trigger": "missed_connection",
  "position": { "kind": "at_stop", "operator": "bus_a", "stop": "S49" },
  "remaining_itinerary": { "legs": [ ... ] }
}
```

`trigger` ∈ `missed_connection | vehicle_cancelled | stranded | stop_closed | traveller_initiated`.

**The trigger describes what the traveller can perceive, never the underlying cause.** A passenger knows their bus did not arrive; they do not know the operator's feed stopped publishing cancellations. Leaking the cause would hand over the answer to catalogue §2.1 D.

`position.kind` ∈ `at_stop | aboard | walking`, with operator-scoped references (§7) or coordinates as appropriate.

Response `status` ∈ `ok` (new itinerary) | `continue` (current plan still best) | `abandon` (advise giving up) | `no_route` | `declined`.

### 5.6 `POST /v1/tick` — new in v0.2

The simulator drives ingestion cadence. Rationale in `TIME-MODEL.md` §6: in `virtual` mode a simulated day may pass in seconds of wall time, so a player whose loop sleeps 30 real seconds would poll **once** for the whole day. Reading `/v1/clock` does not help — you cannot schedule against a clock that outruns you.

```json
{
  "contract_version": "0.3",
  "run_id": "run-7f31",
  "sim_time": "2031-04-07T08:12:00+03:00",
  "guard_wall_s": 30
}
```

The player performs its operator polling **inside this handler**. The simulated clock is paused for its duration, which §6.4's snapshot rule makes safe.

```json
{ "status": "ok", "next_interval_sim_s": 15 }
```

`next_interval_sim_s` is optional and lets the player **adapt its cadence mid-run** — poll harder around a disruption, back off when quiet. This makes polling strategy a live decision rather than a static config value, and it is one of the more interesting trade-offs available to a player: poll often and pay in API cost, poll rarely and pay in staleness.

**No simulated deadline.** A tick consumes no simulated time, so only `guard_wall_s` applies.

**Ordering.** When a tick and an obligation fall at the same simulated instant, **the tick is delivered first**, so the player is asked questions with the freshest data it could have had. Deterministic and sensible.

**OPEN (`TIME-MODEL.md` §6):** whether free-running ingestion is *also* permitted between ticks in `realtime` mode. Natural there, but it means two code paths for the player.

### 5.7 `POST /v1/run-start` and `POST /v1/run-end`

Lifecycle signals. `run-start` carries the run id and the brief's digest; `run-end` carries the reason (`completed`, `aborted`, `player_failure`, `invalid`). Responses are ignored — these are notifications, and failing to respond is not scored.

---

## 6. Control API — the player calls these

Base: `TNS_CONTROL_URL`.

### 6.1 `GET /v1/brief`

The single machine-readable entry point, and the answer to **Q41/Q42**: what a human reads first and what an agent is handed.

```json
{
  "contract_version": "0.3",
  "run_id": "run-7f31",
  "world":  { "seed": 481516, "engine_version": "0.3.0", "timezone": "Europe/Kyiv" },
  "run":    { "mode": "open_loop", "cold_start": true, "tier": 2,
              "time_mode": "virtual", "latency_mode": "none",
              "wall_budget_s": 3600, "pause_queue_depth": 256 },
  "limits": { "min_tick_interval_sim_s": 5 },
  "preparation": { "wall_budget_s": 300 },
  "operators": [
    { "id": "bus_a", "name": "Nordline", "base_url": "http://localhost:9101",
      "docs_url": "http://localhost:9101/docs",
      "auth": { "scheme": "header_key", "header": "X-Api-Key", "key": "..." } },
    { "id": "metro", "name": "City Metro", "base_url": "http://localhost:9103",
      "docs_url": "http://localhost:9103/openapi.json",
      "auth": { "scheme": "query_key", "param": "apikey", "key": "..." } }
  ],
  "obligations": ["plan", "replan", "tick", "notify"],
  "scoring": { "spec_url": "http://localhost:9000/v1/scoring",
               "metrics": ["trip_time_ratio", "info_latency", "failed_transfers", "api_calls"] }
}
```

The brief states *where* the operators are and how to authenticate. It says **nothing** about their schemas, their quality, or how their data relates. Discovering that is the game.

**`docs_url` is always present.** *Decided at M3.*

Withholding it would make finding the endpoint part of the challenge, and that is a different — worse — game. The difficulty of this project lives in the *data*: what an identifier denotes, where a stop really is, what instant a timestamp means. None of that becomes more interesting if the player also has to guess a URL. It would also break the agent-benchmark use case outright, where an agent with no documentation is being tested on endpoint enumeration rather than on integration.

What *does* vary is documentation **quality**, which is already catalogue §2.1 F: docs that are incomplete, that describe fields the API no longer returns, or that disagree with observed behaviour. That is the interesting version of "you cannot trust the documentation", and it keeps the challenge in the data where it belongs.

### 6.2 `GET /v1/clock`

```json
{ "sim_time": "2031-04-07T08:12:00+03:00",
  "state": "preparation | running | paused | ended",
  "time_mode": "virtual",
  "speed": 1.0 }
```

Lets the player schedule against **simulated** time and observe run state (**Q14**). Cheap, unmetered, and excluded from API-cost scoring.

**`/v1/clock` is exempt from pause queuing** (§6.4) — it must answer during a manual pause, or the player cannot discover why its other calls have stalled.

### 6.3 `POST /v1/notify`

The scored dissemination channel.

```json
{
  "traveller_ref": "trv-88431",
  "kind": "disruption | itinerary_update | info",
  "sent_at": "2031-04-07T08:31:12+03:00",
  "itinerary": { "legs": [ ... ] },
  "message": "Route 12 cancelled; rerouted via Metro line B."
}
```

The simulator stamps arrival in simulated time and delivers to the traveller agent. The gap between the underlying world event and that arrival **is** the information-latency metric. Notifying about something that did not happen, and failing to notify about something that did, are separately scored failures.

`sent_at` is **advisory only** — the simulator's own arrival stamp is authoritative. Trusting a player-supplied timestamp would be an obvious cheat vector on the latency metric.

### 6.4 Operator API invariants — what the player is guaranteed

These are guarantees about the world's physics, not hints about the answers. Publishing them is deliberate: they teach the right lesson and save quota otherwise spent discovering them.

> **The snapshot rule.** Every operator response is a pure function of simulated time. It never depends on wall time, and never on how many times you have called. Operator *k* serves the world as of `τ − sₖ` for its own characteristic lag `sₖ`.
>
> **Consequence: polling faster than a feed updates returns identical bytes and costs you quota.** Poll cadence should track how fast the underlying data changes, not how fast your process can loop.

**What is *not* published:** each operator's `sₖ`, its defect set, its true coverage. Those are exactly what the player is there to discover.

**Manual pause.** An operator or monitoring UI may pause the world. While paused, operator API requests **queue** FIFO per connection and are served after resume against post-resume state; they do not return stale data and they do not fail. Queue depth is `run.pause_queue_depth`; **overflow returns `503`**, a legitimate operator behaviour the player should already handle. `/v1/clock` never queues, and reports `state: "paused"`.

---

## 7. Core data types — and the rule that protects the challenge

### The operator-scoped reference rule

**Itineraries are expressed using each operator's own published identifiers, never the simulator's canonical ones.**

```json
{ "operator": "bus_a", "stop": "S49", "trip": "T447", "route": "12" }
```

`stop`, `trip` and `route` are verbatim strings as that operator publishes them. The simulator resolves `(operator, stop)` internally via a private table (`DATA-MODEL.md` §4).

This is the single most important rule in the contract. If the player could name stops by canonical ID, the simulator would be handing over the solved entity-resolution problem — catalogue §2.1 A, one of the central challenges — for free. It also happens to be exactly how a real aggregator must address a real operator's API.

**Resolution granularity.** `(operator, stop)` resolves to whatever *that operator* publishes: a Site for an operator publishing at station granularity, a Quay for one publishing platforms (`DATA-MODEL.md` §2). Two operators may therefore name the same physical place at different levels, and both references are correct. The player is never told which level it is holding.

For the same reason, `origin` and `destination` in a plan request are **coordinates, not stops**. Finding the usable stops near a point, across operators that disagree about where and what those stops are, is the player's problem.

### Itinerary

```json
{
  "legs": [
    { "mode": "walk", "from": { "lat": 50.4501, "lon": 30.5234 },
      "to": { "operator": "bus_a", "stop": "S12" },
      "depart": "2031-04-07T08:15:00+03:00", "arrive": "2031-04-07T08:21:00+03:00" },

    { "mode": "transit", "operator": "bus_a", "route": "12", "trip": "T447",
      "from_stop": "S12", "to_stop": "S49",
      "depart": "2031-04-07T08:24:00+03:00", "arrive": "2031-04-07T08:39:00+03:00" },

    { "mode": "walk", "from": { "operator": "bus_a", "stop": "S49" },
      "to": { "operator": "metro", "stop": "M-CENTRAL-P2" },
      "depart": "2031-04-07T08:39:00+03:00", "arrive": "2031-04-07T08:43:00+03:00" },

    { "mode": "transit", "operator": "metro", "route": "B", "trip": "B-1142",
      "from_stop": "M-CENTRAL-P2", "to_stop": "M-NORTH",
      "depart": "2031-04-07T08:47:00+03:00", "arrive": "2031-04-07T08:58:00+03:00" }
  ]
}
```

An itinerary the simulator cannot resolve — unknown operator, a stop that operator never published, a trip that does not serve those stops — is **not** a transport error. It is a well-formed answer that is wrong about the world, and is scored as such. Malformed JSON is a bug; an unresolvable itinerary is a modelling failure; they must never be conflated in the run log.

**Access legs are charged whether or not the player mentions them.** An itinerary names transit legs and the transfers between them; it does not have to describe the walk from the traveller's origin to the first boarding point, or from the last alighting point to their destination. The simulator supplies and charges for both, and rejects an itinerary whose first boarding quay is not reachable from the origin at all.

This is not a detail. M1 shipped without it, and the consequence was that a journey silently began wherever the player chose to board — a free teleport of up to the full walking radius, at both ends. The reference player beat a perfectly-informed planner on seven queries out of ten. Anything a traveller physically does costs time, including the parts the player did not think to mention.

### Time representation

All contract timestamps are **RFC 3339 with an explicit offset**, in simulated time. The brief declares the world's timezone.

This is deliberately the *good* practice the operator APIs conspicuously fail to follow — epoch seconds, epoch milliseconds, local time with no offset, `25:10:00` (catalogue §2.1 B). Internally the simulator holds monotonic integer seconds and renders exactly once, at this boundary (`DATA-MODEL.md` §2).

---

## 8. Failure semantics (Q6)

| Condition | Simulator behaviour | Scored as |
|---|---|---|
| Non-`2xx` | request treated as unanswered | `player_error` |
| Malformed body / schema violation | request treated as unanswered | `player_error` |
| `guard_wall_s` exceeded | request treated as unanswered | `player_timeout` |
| Answer well-formed but unresolvable | answer used, then fails in-world | modelling failure, not transport |
| `declined` | treated as answered-with-nothing | `declined` — scored, but kindly |

**Unanswered** means the traveller falls back to documented degraded behaviour: continue on the current plan if it is still physically possible, otherwise replan under the reference policy (`REFERENCE-POLICY.md` §8). The world does not stall and the run does not abort. In `virtual` mode the fallback fires at `deadline` — the same instant an answer would have landed, which is what makes response speed unable to influence the outcome.

**Declining is never free.** An unanswered or declined obligation carries a fixed forgone-obligation penalty *and* the resulting reference-policy outcomes still count in full against the player's passenger metrics. Without both, refusing to answer would become a winning strategy for a weak solution — see `REFERENCE-POLICY.md` §8.

**No automatic retries.** A failure is a deterministic, scored outcome. Retrying would make attempt counts depend on player behaviour, reintroducing exactly the non-determinism open-loop mode exists to eliminate. Robustness is part of what is measured: a player that crashes on one edge case should lose points, not lose the run.

**Abort threshold.** The run aborts after `run.abort_after_consecutive_failures` (default 50) consecutive failures, recorded as `player_failure`. This distinguishes "buggy" from "not running at all".

**Wall budget.** Exhausting `run.wall_budget_s`, or breaching `guard_wall_s` in a way the harness treats as a hang, yields an **`invalid`** run rather than a bad score (`TIME-MODEL.md` §9) — machine-dependent outcomes must never be scored as though they were properties of the solution.

Errors use RFC 9457 `application/problem+json` in both directions.

---

## 9. Determinism rules binding the contract

These exist so the contract cannot quietly break the guarantees in `TECHNICAL-RESEARCH.md` §4.

1. **The simulator may issue requests concurrently, but MUST apply responses in `request_id` order, never arrival order.** Without this, HTTP concurrency alone destroys reproducibility.
2. **Every effect of a response lands at a deterministic simulated timestamp**, fixed by the request, not by when the answer came back.
3. **Ticks precede obligations at the same simulated instant** (§5.6).
4. **Operator responses obey the snapshot rule** (§6.4) — pure functions of `τ`, never of wall time or call count. This is enforced structurally by the projection signature in `DATA-MODEL.md` §1, not by discipline.
5. **The player may be internally non-deterministic. The world may not.** A player answering differently on identical input produces a different but individually valid run; the world's response to a *given* answer is fixed.
6. **Notifications are ordered by the simulator's arrival stamp**, with `(traveller_ref, sequence)` as tie-break — never by network arrival order, and never by player-supplied `sent_at`.
7. **`/v1/clock` is free, unmetered and never queued**, so polling it cannot perturb cost metrics or hide a pause.

---

## 10. Distribution and packaging

The player is started by whoever runs the session and is reachable at `player.base_url`. In the MVP everything runs locally: operators, control API and player on one machine.

Because the simulator only ever sends HTTP to an address, **it never executes player code**, and the sandboxing problem does not arise (`TECHNICAL-RESEARCH.md` §10). This holds until a hosted leaderboard exists, and is a strong reason to keep the contract as it is.

---

## 11. Scale — why `/plan` is batch-native

A naive per-passenger call does not survive contact with closed loop: a million-passenger day at 5 ms per round trip is over 80 minutes of pure HTTP before the player thinks.

1. **Batching.** `/plan` and `/replan` take arrays. Batch composition is by simulated-time window, which is deterministic. Batch size never changes the semantics of an individual request.
2. **Connection reuse.** Keep-alive is required; the simulator will not open a connection per request.
3. **App-user fraction.** In closed loop, only a configured fraction of travellers consult the player; the rest follow the reference policy (`REFERENCE-POLICY.md` §3). Realistic — not everyone uses a journey planner — it bounds request volume, and it doubles as a difficulty axis. Open-loop scoring uses a fixed query set of O(10³–10⁴) against ghost riders and does not need it.

Ticks add negligible load: one call per `interval_sim_s` of simulated time, regardless of world size.

---

## 12. Versioning

* Contract version is semver, currently `0.3`, sent on every request and declared in `/v1/identity`.
* Paths carry the major version (`/v1/`).
* Additive fields are minor; removed or re-meaning fields are major.
* A run record is `world_seed × engine_version × scorer_version × contract_version × time_mode × latency_mode × hardware_profile`. Scores compare only within an identical tuple; `hardware_profile` is `null` for every machine-independent run, which is the normal case.

---

## 13. Worked example

```text
sim 08:12:00  sim  → player   POST /v1/tick        clock paused for handler
sim 08:12:00  player→ bus_a   GET /timetable       ingestion inside the handler
sim 08:12:00  player→ metro   GET /realtime        same τ — consistent snapshot
sim 08:12:00  player→ sim     200 {next_interval_sim_s: 30}
sim 08:12:00  sim  → player   POST /v1/plan        req-000123 — tick came first
sim 08:12:00  player→ sim     200 {status:"ok", itinerary: 4 legs}
sim 08:12:20  world           answer applied at deadline, not at reply time
sim 08:15:00  world           traveller trv-88431 departs on the plan
sim 08:24:00  world           boards bus_a T447 at S12
sim 08:31:00  world           metro B-1142 cancelled  ← player does not know yet
sim 08:31:30  sim  → player   POST /v1/tick
sim 08:31:30  player→ metro   GET /realtime        ← finds it; feed lag sₖ applies
sim 08:31:30  player→ sim     POST /v1/notify      kind=disruption, new itinerary
                              → info latency = 30 simulated seconds   [SCORED]
sim 08:39:00  world           alights at S49, follows the new plan
sim 08:58:00  world           arrives — trip_time_ratio vs oracle     [SCORED]
```

Had the player polled at a 300-second cadence instead of 30, it would have found the cancellation far too late: the traveller would have reached M-CENTRAL-P2, waited for a train that was never coming, and eventually triggered `/v1/replan` with `trigger: "stranded"` — much worse on both the information and passenger metrics. Had it polled at 5 seconds, it would have paid ten times the API cost for information the feed's own lag `sₖ` prevented it from having any sooner. **That trade-off is the game.**

---

## 14. What this closes, and what it does not

**Closed:** Q1 (three channels), Q2 (`plan`, `replan`, `tick`, `notify`, `identity`, `health`, lifecycle), Q3 (HTTP/JSON/OpenAPI), Q4 (no language list), Q5 (`/identity` capabilities), Q6 (failure table, no retries), Q7 (warm state permitted and recorded), Q8 (one address, contents unconstrained), Q14 (simulator-driven ticks with adaptive cadence).

**Materially advanced:** Q37–Q38 (local, no sandbox), Q41–Q42 (the brief).

**OPEN items:** whether `docs_url` is always present (§6.1); free-running ingestion between ticks in `realtime` (§5.6). Preparation cost (§4) was closed at M2: free, bounded, revisited as *recovery* in Phase 3.

**Untouched — and next:** Q29, the open-loop reference policy. How simulated travellers decide without the player determines the fallback behaviour referenced throughout §8, and the MVP needs it because the MVP is open-loop.

### Suggested next artefacts

1. **`contract/player-api.yaml` and `contract/control-api.yaml`** — OpenAPI 3.1, generated from the schema source in `DATA-MODEL.md` §5 into a committed, stable path.

   These two are **repository artefacts**: one per contract version, identical for every world, and a stable URL to point a player or an agent at. They are generated but committed, with CI asserting that regeneration produces no diff — so they are always browsable and always true.

   **Operator API documents are not repository artefacts.** They vary per world with the projection manifest, so they are emitted into the **world bundle** and served at each operator's `docs_url` (§6.1). Committing them would be meaningless — there is no single correct version — and at higher tiers they are deliberately imperfect, which is a property of a *world*, not of the project.

2. A conformance suite any candidate player can run against itself before a scored run.
3. A reference player implementing the contract badly but validly — the floor a real solution must beat, and a smoke test for the simulator.
