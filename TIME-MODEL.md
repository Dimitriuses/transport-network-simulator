# Time Model — Rough Draft v0.1

**Status: ROUGH DRAFT.** Deliberately opinionated so it can be argued with. **OPEN** marks things I did not decide.

**Closes:** `CORECONCEPT.md` §9.2 Q9–Q14.
**Forces a change to:** `PLAYER-CONTRACT.md` v0.1 — see §8. Working the time model through surfaced a gap that makes the default mode unusable as currently specified.

---

## 1. The principle: two clocks, never mixed

There are exactly two clocks, and almost every mistake available here comes from letting them touch.

| | Simulated time `τ` | Wall time `w` |
|---|---|---|
| What it is | the world's clock | real elapsed time |
| Authoritative for | everything in the model | nothing in the model |
| Reproducible | yes, by construction | never |
| Appears in scoring | yes | only as a diagnostic |
| Appears in the contract | every timestamp | one field, `guard_wall_s` |

**Rule: no quantity that affects a score may be derived from `w`.** The simulation core never reads the wall clock (`TECHNICAL-RESEARCH.md` §11 already makes this a lint-enforced rule). The harness around it reads `w` only to stop things hanging.

---

## 2. Q9 — Three named modes

| Mode | `τ` advances | Used for | Deterministic |
|---|---|---|---|
| **`virtual`** | event to event, as fast as the machine allows; **pauses** during player calls | open loop, scoring, benchmarking, regression | **yes** |
| **`realtime`** | 1:1 with `w` | closed-loop sandbox | no, by design |
| **`scaled`** | `N ×` `w` | opt-in performance tier only | no |

**`virtual` is the default and the only mode whose scores are comparable.** The others must be requested explicitly.

`scaled` exists because someone will eventually want to ask "can your solution keep up with a city running at 60×?" That is a legitimate question, but it is a *different* question, and §7 keeps it quarantined.

---

## 3. Q13 — The clock pauses, and the pause is only safe under one condition

In `virtual` mode the simulated clock stops while a player request is outstanding. That is what makes results machine-independent.

The obvious objection is that a player measuring `w` can detect the pause. That turns out to be the trivial concern. The serious one is different, and it took writing this out to see it:

> **If the clock is frozen during a `/plan` call, the player can issue a burst of operator API calls from inside its handler and receive a perfectly fresh, perfectly self-consistent snapshot of the whole world at that exact instant — at zero simulated cost.**

That does not leak a little information. It **nullifies catalogue section D entirely** — staleness, non-atomic snapshots, feeds that lag, ghost trips. The highest-value part of the whole design evaporates, silently, and the leaderboard would fill with solutions that simply poll everything inside the handler.

### The fix: operator feeds are pure functions of `τ`

> **Every operator API response is determined solely by the operator's own published-state timestamp, which is a function of simulated time. It is never a function of wall time, and never a function of how many times it was called.**

Concretely: operator `k` publishes state lagging true world state by its characteristic staleness `s_k`, so a call at simulated time `τ` returns the world as of `τ − s_k`, rendered through that operator's schema and defects. During a pause, `τ` is frozen, so the answer is frozen. Calling five hundred times returns the same bytes five hundred times.

Three things fall out of this, all good:

1. **The pause is safe.** There is no information to be gained by polling inside a handler.
2. **Polling faster than a feed updates costs money and yields nothing** — which is exactly the real lesson of transit integration, now enforced by the physics of the world rather than by a rule in the documentation.
3. **Determinism improves**, because operator responses no longer depend on call timing at all.

This rule is load-bearing. If it is ever violated — say by an operator endpoint that reports "requests served in the last minute" using real time — `virtual` mode quietly becomes exploitable.

### The residual leak

A player can still infer *that* it is being waited on by watching `w`. What this buys is nearly nothing: it already knows it is handling a request. Mitigations, in order of preference: all simulator-emitted timestamps are simulated; the documentation states that wall-clock reasoning is unsupported; and optional randomised wall jitter if anyone ever demonstrates an actual exploit. **Accepted as a known, tolerable imperfection.** Not worth engineering away.

---

## 4. Q12 — Two deadlines, always both, never conflated

Every obligation request carries both:

```json
{
  "deadline": "2031-04-07T08:12:20+03:00",   // simulated — a fact about the world
  "guard_wall_s": 30                          // real — anti-hang only
}
```

**`deadline` (simulated)** is a world quantity: how long a traveller will wait on their phone before acting without an answer. It comes from world configuration per obligation type. It is identical for every player on every machine.

**`guard_wall_s` (real)** exists so a wedged player does not stall a run forever. It is deliberately generous, it is **never scored**, and it does not scale with anything.

### When does an answer take effect?

In `virtual` mode: **at `deadline`, always** — whether the player answered in 3 ms or 3 s.

This is the fairness property, stated as a mechanism. The traveller acts at the same simulated instant either way; the only things that vary are *whether* an answer arrived and *what it said*. Response speed cannot influence the world, so it cannot influence the score.

The symmetry is deliberate: an answered request and an unanswered one both resolve at `deadline`, one with an itinerary and one with the fallback.

**OPEN.** An alternative is to land the answer at `issued_at + δ`, where `δ` is a *modelled* app-response delay drawn from the seeded RNG. Equally deterministic, slightly more lifelike, and it would let "the app is snappy" be part of the world rather than absent from it. I lean against — it adds a knob without adding a decision the player can influence — but it is a real option.

### Does the deadline scale with acceleration?

In `virtual`, the question does not arise. In `scaled` at `N×`, the simulated deadline stays fixed by the world while the real time available becomes `deadline_sim / N`. **That is precisely the trap in Q11**, which is why `scaled` is opt-in and separately scored, never merged with `virtual` results.

---

## 5. Q10 — Latency is measured, recorded, and inert

Player response latency is measured in wall time and written to the run log for **every** request, in all modes.

In `virtual` mode it is inert: it affects nothing in the world and contributes nothing to the primary score. It is surfaced as a separate **performance profile** — p50/p95/p99 per obligation type, plus total wall time — because it is genuinely useful to the player and genuinely uninteresting as a measure of integration quality.

In `realtime` and `scaled` it affects the world by construction, which is the entire point of those modes.

---

## 6. Q14 — The player's own scheduling, and why this breaks the contract

Here is the problem `virtual` mode creates, and it is not a detail.

The simulated clock jumps from event to event as fast as the machine allows. A simulated day may pass in four seconds of wall time. A player whose ingestion loop sleeps 30 real seconds between polls will poll **once** for the entire day. Its model will be empty, its answers worthless, and the failure will look like a bug in the player rather than a flaw in the mode.

`GET /v1/clock` (contract §6) lets the player *read* simulated time, but reading is not enough — the player cannot schedule against a clock that outruns it. Polling in a tight loop is not a fix either: it burns CPU, and under §3's snapshot rule it returns identical bytes.

### Proposal: invert it — the simulator drives ingestion cadence

Add a third obligation to the player API:

```
POST /v1/tick   { "sim_time": "2031-04-07T08:12:00+03:00", "guard_wall_s": 30 }
```

The player declares a cadence — in **simulated** seconds — at `run-start` or in `/v1/identity`:

```json
{ "tick": { "interval_sim_s": 30 } }
```

The simulator then calls `/v1/tick` at exactly those simulated instants. The player does its operator polling inside the handler. The clock is paused during it, which §3 has already made safe.

What this buys:

* the player can never be outrun by the clock, in any mode;
* ingestion cadence becomes an explicit, declared, **scored** cost rather than an accident of `sleep()` placement;
* the same player code runs unchanged in `virtual` and `realtime`;
* polling cadence becomes a legible strategic choice — poll often and pay in API cost, or poll rarely and pay in staleness. That is a good decision to put in front of a player.

What it costs: the player can no longer poll on its own initiative between ticks. **OPEN:** whether to allow free-running ingestion *in addition* to ticks in `realtime` mode. I lean yes — it costs nothing there and it is more natural — but it means two code paths for the player, so possibly not worth it.

> **This is a required amendment to `PLAYER-CONTRACT.md` v0.1**, which does not currently contain `/v1/tick` and whose §6 treats `/v1/clock` as sufficient. The contract needs a v0.2 adding: the `tick` obligation, the `tick` capability, `interval_sim_s`, and a statement of the §3 snapshot rule (which is really a property of the operator APIs and belongs there too).

---

## 7. Q11 — Structural safeguards against accidental performance benchmarking

Not a policy anyone has to remember; four mechanisms:

1. **`virtual` is the default.** Fairness is opt-out, not opt-in.
2. **Mode is part of the run tuple.** `world_seed × engine_version × scorer_version × contract_version × time_mode`. Scores compare only within an identical tuple, so a `scaled` result can never silently land beside a `virtual` one.
3. **The wall guard is generous and unscored**, so it cannot be mistaken for a quality signal or quietly tightened into one.
4. **Guard-triggered aborts produce an `invalid` run, not a bad score** — see §9.

---

## 8. Internal representation

* Internally, `τ` is a **monotonic integer count of seconds from a declared world epoch**. Never a local wall-clock structure.
* This matters specifically because the world contains DST transitions and past-midnight service days (catalogue §2.1 B). A monotonic counter orders correctly through a duplicated 02:30; a local timestamp does not.
* Local time, offsets, `25:10:00` and the rest are **rendering concerns at the operator API boundary** — which is exactly where the interesting defects live.
* The contract surface renders `τ` as RFC 3339 with explicit offset; the brief declares the world timezone.
* **Resolution: one second.** **OPEN:** whether sub-second resolution is ever needed. I do not think it is — transit does not care — but the integer representation should leave room, so store milliseconds and expose seconds.

---

## 9. Aborts, validity, and reproducibility

Because a wall-guard breach depends on the machine, a run that hits one is **not reproducible** and must not be scored as though it were.

| Outcome | Run status | Rationale |
|---|---|---|
| Completed | `scored` | normal |
| Player errors / timeouts within threshold | `scored` | robustness is part of the measurement |
| Consecutive-failure threshold hit | `scored`, `player_failure` | deterministic in `virtual`: the same player fails the same way |
| **Wall guard breached** | **`invalid`** | machine-dependent; not a property of the solution |
| Total wall budget exhausted | `invalid` | same reason |

An `invalid` run is reported to the player with the reason and is excluded from any comparison. Otherwise a slower laptop silently changes results, which is the exact failure this whole document exists to prevent.

The brief gains `run.wall_budget_s` — a total budget across the run, alongside per-request `guard_wall_s`.

---

## 10. Worked comparison

The same moment, in each mode. A traveller requests a plan at simulated 08:12:00 with a 20-simulated-second deadline; the player takes 1.4 s of wall time to answer.

```
virtual    τ 08:12:00  request issued, clock PAUSES
           w +1.4 s    player answers; latency logged, inert
           τ 08:12:20  answer applied. Traveller acts.
                       → identical on any machine. Comparable. Scored.

realtime   τ 08:12:00  request issued, clock runs with w
           τ 08:12:01.4 answer arrives, applied on arrival
           τ 08:12:20  (deadline unused — answered in time)
                       → alive; a 25-second answer would have missed. Not comparable.

scaled 60× τ 08:12:00  request issued; 20 sim-seconds = 333 ms real
           w +1.4 s    → MISSED. Fallback fires.
                       → measures latency, not integration quality.
                         Separate leaderboard. Never mixed.
```

The third line is the whole argument for keeping `virtual` the default.

---

## 11. What this closes

**Q9** — three modes, `virtual` default.
**Q10** — measured in wall time, recorded always, inert in `virtual`, surfaced as a separate performance profile.
**Q11** — four structural safeguards (§7), not a policy.
**Q12** — two deadlines, always both: simulated `deadline` is a world fact and decides when answers land; `guard_wall_s` is unscored anti-hang.
**Q13** — yes it pauses; safe **only** because operator feeds are pure functions of `τ` (§3). The residual wall-time leak is accepted.
**Q14** — `/v1/clock` is insufficient; the simulator drives ingestion via a new `/v1/tick` obligation at a player-declared simulated cadence.

**Open items:** modelled response delay `δ` vs landing at the deadline (§4); free-running ingestion in `realtime` (§6); sub-second resolution (§8).

**Required next:** `PLAYER-CONTRACT.md` v0.2 — add `/v1/tick`, the `tick` capability and `interval_sim_s`; state the §3 snapshot rule as a binding property of the operator APIs; add `run.wall_budget_s` to the brief; add `time_mode` to the run tuple.

The §3 snapshot rule is the piece most worth a second opinion. It is the difference between a real-time challenge and a decorative one, and it constrains the operator API implementation from the very first line of code.
