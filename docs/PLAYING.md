# Building a solution

Everything you need to play, and nothing about how the world was made.

You are building the layer that unites several transport operators into one usable network. They publish independently, they disagree, and none of them knows the others exist. Your job is to make a traveller's journey work anyway.

---

## What you build

**An HTTP service.** Any language. No SDK, no build step, no code we run — the simulator only ever sends your service requests over the network.

You also act as a *client*: you fetch from the operators, and you push notifications back. Three channels in total, and they are not symmetrical:

| | Direction | Who starts it |
|---|---|---|
| **Ingestion** | you → operator APIs | you decide *what*, the simulator decides *when* |
| **Obligations** | simulator → you | the simulator |
| **Dissemination** | you → control API | **you** |

That last row is the one people miss. Nobody asks you whether a traveller should be warned. If you do not push a notification, nothing happens and the traveller finds out by standing on a platform.

---

## Getting started

```
npm ci
npm run world:build        # build the world
npm run demo               # watch the reference player do it badly
```

Then point the simulator at your own service instead. Before a scored run:

```
npm run conformance -- http://localhost:8080
```

That checks you speak the contract. It says nothing about whether you are any good.

---

## The five endpoints

Full definitions in [`PLAYER-CONTRACT.md`](PLAYER-CONTRACT.md) and the generated OpenAPI under [`contract/`](../contract/).

| Endpoint | You must |
|---|---|
| `GET /v1/identity` | say who you are and what you implement |
| `GET /v1/health` | say when you are ready |
| `POST /v1/plan` | answer journey requests, **in batches** |
| `POST /v1/tick` | do your polling here — this is your ingestion cue |
| `POST /v1/run-start`, `/v1/run-end` | acknowledge; responses are ignored |

Declare only what you implement. An unclaimed capability is scored as *forgone*, not *failed*, so a solution that only plans is a valid participant.

**Start from the brief**, `GET {TNS_CONTROL_URL}/v1/brief`. It tells you where the operators are, how to authenticate, and the world's timezone. It tells you **nothing** about their schemas, their quality, or how their data relates.

---

## Five things that will catch you out

Not a complete list, and deliberately not tied to any particular world. These are the shapes of the problem.

### 1. An identifier only means something inside its operator

Two operators may both number their stops from 1. Stop `7` is a different place depending on who published it. If you key your model on the bare identifier you will silently fuse two unrelated places, and your itineraries will be *well-formed and wrong*.

Answer in operator-scoped references — `{"operator": "...", "stop": "..."}` — using each operator's own published ids, exactly as they gave them to you.

### 2. Coordinates are not ground truth

One operator may publish positions that are systematically displaced. Another may round them. Another may give you the centroid of a station rather than the platform a vehicle actually calls at.

A distance threshold alone will therefore both miss real neighbours and invent false ones. Worse, a *systematic* displacement cannot be fixed by widening the threshold — that only adds wrong pairs.

You can often recover a systematic offset by comparing operators against each other. But be careful: a displacement of 130 m and a genuine separation of 80 m look the same to a nearest-neighbour search, and cannot be fully separated. When you know your geometry is suspect, **budget transfers generously** rather than trusting a corrected distance.

### 3. Two stops near each other are still two stops

The most expensive mistake available. If you merge nearby stops into one node, your planner will promise instant transfers between places that are ninety seconds apart on foot — and the traveller is already standing on the platform when it turns out to be wrong.

Link them. Do not fuse them.

### 4. Timestamps do not all mean the same thing

Epoch seconds, RFC 3339 with an offset, and local time with *no* offset are all plausible. The last is the dangerous one: it parses fine and denotes a different instant than you assume. Nothing in the payload says which you are looking at. The brief states the world's timezone; no operator does.

### 5. A feed is not the present

Every operator's realtime feed describes some moment in the past, and the honest ones say so in `as_of`. Polling faster does not make it fresher: **an operator's response is a pure function of simulated time**, so hammering it returns identical bytes and burns your quota.

Two consequences:

* set your `tick` cadence to how fast the data actually changes, not to how fast your process can loop;
* a trip that has *disappeared* from a feed has not become punctual. It may be cancelled and the operator may not say so.

---

## How you are scored

Three families, and they do not substitute for one another. Full detail in [`SCORING.md`](SCORING.md).

**Service** — did people get where they were going? Reported as **capture**:

```
1.0   you matched a planner with perfect information
0.0   you did no better than a city with no integration layer at all
< 0   you made things worse than doing nothing
```

Capture uses *generalised* time, so waiting counts double. Trading a little riding for a lot less standing about is rewarded, as it should be.

**Information** — did you tell people the truth, in time, without crying wolf? Four ways to fail: silent, late, wrong, and **noisy**. Warning everyone about everything scores perfectly on silence and gives it all back on precision.

**Cost** — API calls and bytes, against a per-tier budget. Within budget it costs you nothing; nobody praises an aggregator for staying under its contract.

### Declining is never free

If you do not answer, the traveller falls back to travelling as anyone would with no integration layer — and you are charged both that outcome *and* a forgone-obligation penalty. Refusing everything scores 0.0 on Service and 0.0 on Information. It is never a strategy.

---

## Reading your own result

The scorecard ends with **where the capture went** — lost capture attributed to specific causes, so you can tell a stop-matching failure from a missed connection without opening the log.

If it says your run was **quarantined**, a traveller arrived sooner than perfect information allows. That is impossible, so either something leaked or we have a bug. Historically it has always been our bug — but the run is withheld from comparison until the information-set audit says which.
