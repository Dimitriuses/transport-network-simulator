# Player↔Simulator Contract — Draft v0.1

**Status: DRAFT.** This is a proposal to argue with, not a settled specification. Decisions are stated plainly so they can be rejected plainly. Points still genuinely undecided are marked **OPEN** inline.

**Closes:** `CORECONCEPT.md` §9.1 Q1–Q8 (direction, request set, transport, language policy, identity, failure handling, warm state, distribution).
**Depends on and does not decide:** §9.2 Q9–Q14 (the time model). This spec defines *where* deadlines and timestamps appear; the policy that sets them belongs to the time specification.
**Deliberately out of scope:** operator API design (§2.1 — those are meant to be non-uniform and badly behaved), scoring (§9.4).

---

## 1. Decisions

### Q1 — Direction: all three, and that is not a compromise

The original framing offered a binary — player as service, or player as client. Working through what the world actually needs shows the answer is **three channels**, because the player has three genuinely different relationships:

| # | Channel | Direction | Why it must be this way |
|---|---|---|---|
| 1 | **Ingestion** | Player → Operator APIs | Pull-based by nature. The player decides what to fetch and how often, handles rate limits and staleness. This *is* the project. |
| 2 | **Obligations** | Simulator → Player | The world must be able to ask questions and observe the answer under a deadline. Only push gives a measurable response time. |
| 3 | **Dissemination** | Player → Simulator control API | Notifications must be *pushed by the player* for §5's "delay in dissemination of real-time information" to be measurable at all. If the simulator polled for updates, it would be measuring its own poll interval. |

Channel 3 is the one the earlier sketch missed, and it matters: a large part of the stated challenge is *telling people things in time*, and that is only observable if the player initiates.

### Q3 — Transport: HTTP/1.1 with JSON

**Decided: HTTP + JSON, described by OpenAPI 3.1, `application/json; charset=utf-8`.**

Rationale:

* **Language-agnostic with zero toolchain.** Any language with an HTTP server can play. No code generation, no build step, no SDK required.
* **Agent-friendly.** Coding agents handle HTTP/JSON far better than protobuf toolchains. Given the benchmark positioning, this is a first-order concern.
* **Domain-faithful.** Real transit integration is HTTP and JSON. Skills transfer.
* **Debuggable by hand.** `curl` reproduces any interaction; a run log is readable without tooling.

Rejected alternatives:

* **gRPC** — buys performance the contract does not need (see §11) and costs accessibility it does need.
* **WebSocket / SSE for the main path** — message ordering and delivery semantics are harder to make deterministic, and a dropped socket is a messier failure than a failed request. May return later for high-volume closed-loop streaming; not in v0.1.
* **In-process plugin / submitted artefact** — kills language agnosticism and forces sandboxing (`TECHNICAL-RESEARCH.md` §10). Explicitly not chosen.

### Q4 — Language policy

**No supported-language list.** The contract is the specification; any HTTP server satisfying it is a valid solution. SDKs may be published later as a convenience, never as a requirement. A player using only `curl` and shell would be legal, if unwise.

---

## 2. Architecture

```text
                    ┌──────────────────────────────────────┐
                    │            SIMULATOR                 │
                    │                                      │
   ┌────────────────┤  Operator APIs   (per-operator host) │
   │  1. ingestion  │   bus_a  :9101   ──┐                 │
   │   (pull)       │   bus_b  :9102   ──┼─ deliberately   │
   │                │   metro  :9103   ──┘  inconsistent   │
   │                │                                      │
   │  ┌─────────────┤  Control API     :9000               │
   │  │ 3. dissem.  │   /v1/brief  /v1/clock  /v1/notify   │
   │  │  (push)     │                                      │
   │  │             │  Simulation core ── issues ──┐       │
   │  │             └──────────────────────────────┼───────┘
   │  │                                            │
   │  │                              2. obligations│(push)
   ▼  ▼                                            ▼
 ┌──────────────────────────────────────────────────────────┐
 │                     PLAYER SOLUTION                      │
 │   HTTP service:  /identity /health /plan /replan /run-*  │
 └──────────────────────────────────────────────────────────┘
```

Channels 1 and 3 make the player an HTTP **client**; channel 2 makes it an HTTP **server**. Both roles are mandatory above Tier 0.

---

## 3. Addressing, identity and auth

### Endpoints

* The player is a **single addressable base URL**, supplied in run configuration: `player.base_url`. Whatever sits behind it — one process, a cluster, a load balancer — is the player's business (**Q8**).
* Every simulator-owned surface is discovered from **one** bootstrap value given to the player: `TNS_CONTROL_URL` (plus `TNS_TOKEN`). Everything else, including operator base URLs, comes from the brief.
* Player paths are versioned: `POST {player.base_url}/v1/plan`.

### Auth

* **Simulator → player:** `Authorization: Bearer <run token>`. The player SHOULD reject other tokens; it is the only guard against a stray caller polluting a scored run.
* **Player → control API:** the same run token.
* **Player → operator APIs:** whatever each operator demands. These schemes are deliberately inconsistent — key in header, key in query string, expiring token, per-endpoint scope — and are described (imperfectly) in each operator's own documentation. This is catalogue item §2.1 E, not an oversight.

### Contract version negotiation

Every request in both directions carries `X-TNS-Contract: 0.1`. The player declares the versions it supports in `/v1/identity`. On mismatch the simulator aborts before the run starts, with a clear error. Version negotiation never happens mid-run.

---

## 4. Run lifecycle

```text
 1. operator + control APIs come up          simulator
 2. player process started with              (external)
    TNS_CONTROL_URL, TNS_TOKEN
 3. GET /v1/brief                            player  → control
 4. GET /v1/health   (polled until ready)    sim     → player
 5. GET /v1/identity (version, capabilities) sim     → player
 6. POST /v1/run-start                       sim     → player
 7. ── PREPARATION PHASE ──                  simulated clock frozen
      player ingests, builds its model
 8. ── RUN ──                                clock advances
      sim → /v1/plan, /v1/replan
      player → operator APIs, → /v1/notify
 9. POST /v1/run-end                         sim     → player
10. scoring, offline, from the run log
```

**The preparation phase is not optional.** Without it, every solution is penalised for cold ingestion latency, which is a property of the world's size rather than of the solution's quality. The brief declares `preparation.wall_budget_s`; the simulated clock does not advance during it. **OPEN:** whether preparation cost should be scored separately rather than made free — there is a real argument that "how fast can you build your model" is a legitimate thing to measure at higher tiers.

**Warm starts (Q7).** Persisting state between runs is **permitted and treated as legitimate engineering**, not an exploit. The brief states `run.cold_start: true|false`; the run log records it; scoring reports warm and cold results separately and never mixes them into one leaderboard.

---

## 5. Player API — the simulator calls these

The player's surface is small, fixed, and — unlike everything else in this project — **documented exactly and honestly**. The contrast with the operator APIs is pedagogical and should be preserved.

### `GET /v1/identity`

```json
{
  "name": "my-integrator",
  "version": "0.4.1",
  "contract_versions": ["0.1"],
  "capabilities": ["plan", "replan", "notify"]
}
```

`capabilities` lets a partial solution be honest about what it does not implement (**Q5**). The simulator will not issue obligations a player has not claimed, and the scorer records unclaimed capabilities as forgone rather than failed — so a Tier-0 player that only plans is a valid, scorable participant.

### `GET /v1/health`

`200` with `{"status":"ready"}` when able to serve. Anything else means not ready. Polled only before the run, with a bounded budget from the brief.

### `POST /v1/plan`

**Batch-native from the outset** — see §11. A batch of size 1 is normal at low tiers; the schema never changes.

```json
{
  "contract_version": "0.1",
  "run_id": "run-7f31",
  "issued_at": "2031-04-07T08:12:00+03:00",
  "deadline": "2031-04-07T08:12:45+03:00",
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

Response:

```json
{
  "results": [
    { "request_id": "req-000123", "status": "ok", "itinerary": { "legs": [ ... ] } }
  ]
}
```

`status` is one of `ok`, `no_route` (the player believes none exists), or `declined` (the player will not answer — honest, and scored more kindly than a wrong answer).

### `POST /v1/replan`

Issued when a traveller's plan has become unworkable. Same batching envelope.

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

**The trigger describes what the traveller can perceive, never the underlying cause.** A passenger knows their bus did not arrive; they do not know the operator's feed stopped publishing cancellations. Leaking the cause here would hand the player the answer to catalogue section D.

`position.kind` ∈ `at_stop | aboard | walking`, with operator-scoped references (§7) or coordinates as appropriate.

Response per request: `status` ∈ `ok` (new itinerary), `continue` (current plan is still best), `abandon` (advise giving up the trip), `no_route`, `declined`.

### `POST /v1/run-start` and `POST /v1/run-end`

Lifecycle signals, following the Battlesnake precedent. `run-start` carries the run id and the brief's digest; `run-end` carries the reason (`completed`, `aborted`, `player_failure`). Responses are ignored — these are notifications, and a failure to respond is not scored.

---

## 6. Control API — the player calls these

Base: `TNS_CONTROL_URL`.

### `GET /v1/brief`

The single machine-readable entry point, and the answer to **Q41/Q42**: it is what a human reads first and what an agent is handed.

```json
{
  "contract_version": "0.1",
  "run_id": "run-7f31",
  "world": { "seed": 481516, "engine_version": "0.3.0", "timezone": "Europe/Kyiv" },
  "run": { "mode": "open_loop", "cold_start": true, "tier": 2 },
  "preparation": { "wall_budget_s": 300 },
  "operators": [
    { "id": "bus_a", "name": "Nordline", "base_url": "http://localhost:9101",
      "docs_url": "http://localhost:9101/docs", "auth": { "scheme": "header_key", "header": "X-Api-Key", "key": "..." } },
    { "id": "metro", "name": "City Metro", "base_url": "http://localhost:9103",
      "docs_url": "http://localhost:9103/openapi.json", "auth": { "scheme": "query_key", "param": "apikey", "key": "..." } }
  ],
  "obligations": ["plan", "replan", "notify"],
  "scoring": { "spec_url": "http://localhost:9000/v1/scoring", "metrics": ["trip_time_ratio", "info_latency", "failed_transfers", "api_calls"] }
}
```

The brief states *where* the operators are and how to authenticate. It says **nothing** about their schemas, their quality, or how their data relates. Discovering that is the game.

**OPEN:** whether `operators[].docs_url` should always be present. Withholding it at the highest tiers would make API discovery itself part of the challenge — appealing, but it may cross from "hard" into "guessing".

### `GET /v1/clock`

```json
{ "sim_time": "2031-04-07T08:12:00+03:00", "state": "preparation|running|ended", "speed": 1.0 }
```

Exists so the player can schedule its own polling against **simulated** time rather than wall time (**Q14**). Cheap, unmetered, and excluded from API-cost scoring.

### `POST /v1/notify`

The scored dissemination channel (channel 3).

```json
{
  "traveller_ref": "trv-88431",
  "kind": "disruption | itinerary_update | info",
  "sent_at": "2031-04-07T08:31:12+03:00",
  "itinerary": { "legs": [ ... ] },
  "message": "Route 12 cancelled; rerouted via Metro line B."
}
```

The simulator timestamps arrival in simulated time and delivers it to the traveller agent. The gap between the underlying world event and this arrival **is** the "delay in dissemination of real-time information" metric. Notifying about something that did not happen, or failing to notify about something that did, are separately scored failures — see §9.4 Q22.

---

## 7. Core data types — and the rule that protects the challenge

### The operator-scoped reference rule

**Itineraries are expressed using each operator's own published identifiers, never the simulator's canonical ones.**

```json
{ "operator": "bus_a", "stop": "S49", "trip": "T447", "route": "12" }
```

`stop`, `trip` and `route` are verbatim strings as that operator publishes them. The simulator resolves the pair `(operator, stop)` to a canonical entity internally.

This is the single most important rule in the contract. If the player could name stops by canonical ID, the simulator would be handing over the solved entity-resolution problem — catalogue section A, and one of the central challenges — for free. Requiring operator-scoped references also happens to be exactly how a real aggregator must address a real operator's API.

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

An itinerary the simulator cannot resolve — an unknown operator, a stop that operator never published, a trip that does not serve those stops — is **not** a transport error. It is a well-formed answer that is wrong about the world, and it is scored as such. This distinction matters: malformed JSON is a bug, an unresolvable itinerary is a modelling failure, and they should never be conflated in the run log.

### Time representation

All contract timestamps are **RFC 3339 with an explicit offset**, in simulated time. The brief declares the world's timezone.

This is deliberately the *good* practice that the operator APIs conspicuously fail to follow (epoch seconds, epoch milliseconds, local time with no offset, `25:10:00` — catalogue §2.1 B). The contract demonstrates the standard the operators fall short of.

---

## 8. Failure semantics (Q6)

| Condition | Simulator behaviour | Scored as |
|---|---|---|
| Non-`2xx` | request treated as unanswered | `player_error` |
| Malformed body / schema violation | request treated as unanswered | `player_error` |
| Wall-clock guard exceeded | request treated as unanswered | `player_timeout` |
| Answer is well-formed but unresolvable | answer used, then fails in-world | modelling failure, not a transport error |
| `declined` | request treated as answered-with-nothing | `declined` — scored, but more kindly than a wrong answer |

**Unanswered** means the traveller falls back to documented degraded behaviour: continue on the current plan if one exists, otherwise use the reference policy. The world does not stall and the run does not abort.

**No automatic retries.** A failure is a deterministic, scored outcome. Retrying would make the number of attempts depend on player behaviour, which reintroduces exactly the non-determinism open-loop mode exists to eliminate. Robustness is part of what is being measured; a player that crashes on one edge case should lose points, not lose the run.

**Abort threshold.** The run aborts only after `run.abort_after_consecutive_failures` (default 50) consecutive failures, recorded as `player_failure`. This distinguishes "buggy" from "not running at all".

Errors use RFC 9457 `application/problem+json` in both directions.

---

## 9. Determinism rules binding the contract

These exist so the contract cannot quietly break the guarantees in `TECHNICAL-RESEARCH.md` §4.

1. **The simulator may issue requests concurrently, but MUST apply responses in `request_id` order, never arrival order.** Without this, HTTP concurrency alone destroys reproducibility.
2. **Every effect of a response lands at a deterministic simulated timestamp**, fixed by the request, not by when the answer came back.
3. **The player may be internally non-deterministic.** The world may not. A player that answers differently on identical input produces a different but individually valid run; the *world's* response to a given answer is fixed.
4. **Notifications are ordered by their `sent_at` in simulated time**, with `(traveller_ref, sequence)` as the tie-break — never by arrival order.
5. **The control API's `/v1/clock` is free and unmetered**, so that polling it cannot perturb cost metrics.

**OPEN:** whether the simulator should reject a notification whose `sent_at` is in the player's future or past beyond a tolerance. Trusting a player-supplied timestamp is an obvious cheat vector for the information-latency metric. Likely answer: the simulator stamps arrival itself and treats `sent_at` as advisory only.

---

## 10. Distribution and packaging

The player is started by whoever runs the session and is reachable at `player.base_url`. In the MVP everything runs locally: operators, control API and player on one machine.

Because the simulator only ever sends HTTP to an address, **it never executes player code**, and the sandboxing problem does not arise (`TECHNICAL-RESEARCH.md` §10). This holds until a hosted leaderboard exists, and is a strong reason to keep the contract as it is.

---

## 11. Scale — why `/plan` is batch-native

A naive per-passenger call does not survive contact with closed loop. A million-passenger day at 5 ms per round trip is over 80 minutes of pure HTTP, before the player does any thinking.

Three mitigations, all in v0.1:

1. **Batching.** `/plan` and `/replan` take arrays. Batch composition is by simulated-time window, which is deterministic. Batch size never changes the semantics of an individual request.
2. **Connection reuse.** Keep-alive is required; the simulator will not open a connection per request.
3. **App-user fraction.** In closed loop, only a configured fraction of travellers consult the player; the rest follow the reference policy. This is realistic — not everyone uses a journey planner — it bounds request volume, and it doubles as a difficulty axis. Open-loop scoring uses a fixed query set of O(10³–10⁴) and does not need it.

Point 3 is a genuine design proposal rather than a mere optimisation, and is the main thing in this section worth arguing about.

---

## 12. Versioning

* Contract version is semver, currently `0.1`, sent on every request and declared in `/v1/identity`.
* Paths carry the major version (`/v1/`).
* Additive fields are minor; removed or re-meaning fields are major.
* A run record is `world_seed × engine_version × scorer_version × contract_version`. Scores compare only within an identical tuple.

---

## 13. Worked example

```text
sim 08:12:00  sim  → player   POST /v1/plan       req-000123, batch of 1
sim 08:12:00  player→ bus_a   GET /timetable?...  (player's own ingestion, ongoing)
sim 08:12:00  player→ sim     200 {status:"ok", itinerary: 4 legs}
sim 08:15:00  world           traveller trv-88431 departs on the plan
sim 08:24:00  world           boards bus_a T447 at S12
sim 08:31:00  world           metro B-1142 cancelled  ← player does not know yet
sim 08:31:40  player→ metro   GET /realtime       ← player's poll interval finds it
sim 08:31:42  player→ sim     POST /v1/notify     kind=disruption, new itinerary
                              → info latency = 42 simulated seconds  [SCORED]
sim 08:39:00  world           traveller alights at S49, follows the new plan
sim 08:58:00  world           arrives — trip_time_ratio vs oracle    [SCORED]
```

Had the player not noticed, the traveller would have reached M-CENTRAL-P2, waited for a cancelled train, and eventually triggered `POST /v1/replan` with `trigger: "stranded"` — a much worse outcome on both the information and passenger metrics. That contrast is the game.

---

## 14. What this closes, and what it does not

**Closed:** Q1 (three channels), Q2 (`plan`, `replan`, `notify`, `identity`, `health`, lifecycle), Q3 (HTTP/JSON/OpenAPI), Q4 (no language list), Q5 (`/identity` capabilities), Q6 (failure table, no retries), Q7 (warm state permitted and recorded), Q8 (one address, contents unconstrained).

**Materially advanced:** Q14 (`/v1/clock`), Q37–Q38 (local, no sandbox), Q41–Q42 (the brief).

**Untouched — and next:** Q9–Q13, the time model. The contract has deliberately been written so that `deadline` is a field whose *policy* lives elsewhere. That policy is now the critical path: it determines whether `/v1/plan` deadlines are simulated or wall-clock, whether the clock pauses during a call, and how acceleration interacts with the player's own polling.

**OPEN items collected:** scoring of preparation cost (§4); whether `docs_url` is always present (§6); trusting player-supplied `sent_at` (§9); the app-user fraction (§11).

### Suggested next artefacts

1. `contract/player-api.yaml` and `contract/control-api.yaml` — OpenAPI 3.1, generated from the same schema source that will drive the runtime validators.
2. A conformance test suite that any candidate player can run against itself before a scored run.
3. A reference player implementing the contract badly but validly — the floor a real solution must beat, and a smoke test for the simulator.
