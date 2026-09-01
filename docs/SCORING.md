# Scoring — Draft v0.1

**Status: DRAFT.** **OPEN** marks what I did not decide.

**Closes:** `CORECONCEPT.md` §9.4 Q20, Q22, Q23, Q24, Q26; and §9.3 Q18–Q19 (what survives in closed loop).
**Inherits as a requirement:** `REFERENCE-POLICY.md` §8 — the forgone-obligation penalty. Not optional.
**Inherits as structure:** `REFERENCE-POLICY.md` §2 (P0/P1/P2) and §10 (three-gap calibration).

---

## 1. Scoring is a pure function of the run log

Scoring never happens live. It is an offline function:

```
score = f(run_log, oracle_results, world_manifest, scorer_version)
```

Three consequences, all deliberate:

* a score can be **recomputed and audited** long after the run;
* the scorer can be **fixed or improved independently** of the engine, with `scorer_version` protecting comparability;
* a disputed score is a data question, not an argument.

The run log must therefore carry everything scoring needs. At minimum: every obligation issued and its response or failure mode; every notification with the simulator's own arrival stamp; every operator API call the player made, with endpoint, timestamp and response size; every traveller's complete journey outcome; the world's ground-truth event stream; the P0 and P1 results for every scored query; and the world manifest's declared conflict set.

That last item is what makes §10 possible, and it is easy to forget to log.

`OBSERVABILITY.md` extends this log with causal edges — which ingestion calls belong to which obligation handler — turning it into a per-traveller narrative at a cost of roughly 2 MB per run. It also supplies the forensic procedure for §11's `capture > 1`.

---

## 2. The core idea: headroom capture

The obvious normalisation is a ratio against the oracle — `player_time / oracle_time`. It is the wrong one. It makes every world's scale different, it has no natural zero, and it tells a player nothing about whether their effort was worth anything.

Use the three policies instead. For any metric `m` where lower is better:

```
                m(P1) − m(player)
   capture =  ─────────────────────
                m(P1) − m(P0)
```

| capture | meaning |
|---|---|
| **1.0** | matched the oracle — captured all available headroom |
| **0.0** | no better than a city with no integration layer at all |
| **< 0** | **actively harmful** — your solution made things worse than doing nothing |
| **> 1.0** | impossible; signals a bug, a leak, or a cheat (§11) |

This is the right scale because it measures the thing the project is actually about: **how much of the value that integration makes available did you actually deliver?** It is automatically comparable across worlds of different sizes and topologies, which absorbs much of Q25. And it makes the negative region meaningful — a solution that confidently routes people into worse journeys than they would have found alone deserves to score below zero, and under a raw oracle ratio it would not.

`capture > 1` being impossible is a useful free invariant. If it appears, something is wrong — most likely the player has obtained information it should not have.

---

## 3. Three families

Metrics group into three families that are **not substitutable for each other**. This is why a single weighted sum is the wrong primary object.

| Family | Question it answers | Normalisation |
|---|---|---|
| **Service** | did people get where they were going, well? | headroom capture |
| **Information** | did you tell them the truth, in time, without crying wolf? | precision / recall / timeliness / accuracy |
| **Cost** | what did it take to do that? | against a per-tier budget |

A solution can be excellent at one and terrible at another, and collapsing that into one number destroys the only interesting information in the result.

---

## 4. Service family

Per scored traveller, captured against P0 and P1:

* **journey time** — door to door, including waiting and walking;
* **wait time** — time spent at quays, weighted more heavily than in-vehicle time, as travellers experience it;
* **transfers** — count, plus **failed transfers** as a separate counter;
* **arrival** — did they arrive at all, and within their `arrive_by` if one was given.

**Non-arrival dominates.** A traveller who never reaches their destination is not a slow journey; it is a different category of failure. Non-arrivals are reported as a separate rate *and* enter the Service capture at a heavy fixed cost, so that a solution cannot buy a good mean journey time by stranding the difficult cases.

**Wait counts double.** *Decided at P0M5.* Transit practice conventionally values waiting at around twice in-vehicle time, and adopting a published convention beats inventing one. Capture is therefore computed on **generalised time** — `journey + (w − 1) × wait`, with `w = 2` — not on raw door-to-door minutes.

This matters more than it sounds. On raw totals, a solution that trades two minutes of extra riding for eight minutes less standing on a platform looks *worse*. That is exactly the trade a good journey planner makes, and a metric that punishes it would be steering solutions away from the behaviour the project exists to reward.

The scorecard still reports **raw** minutes for a human to read, because generalised minutes are a number nobody experiences. The two bases must be computed over the same population — mixing them was a bug during P0M5, caught by a test asserting the null player scores exactly 0.0.

---

## 5. Information family (Q22)

The brief said wrong, late and silent are different failures. Working it through, there are **four**, and the fourth closes an obvious exploit.

Frame it as a classification problem over *material events* — world events that actually affect a traveller holding an active itinerary:

| | The player notified | The player did not |
|---|---|---|
| **Event mattered** | true positive → judged on **timeliness** and **accuracy** | **silent** (false negative) |
| **Event did not matter** | **noisy** (false positive) | correct silence |

* **Silent** — the traveller was materially affected and never heard. Recall failure.
* **Noisy** — notifications about events that did not affect that traveller. Precision failure. *Without this, the optimal strategy is to notify every traveller about every event*, which would score perfectly on silence. Real users uninstall apps that do that.
* **Late** — arrived, but too late to be worth anything.
* **Wrong** — arrived in time but misdescribed the situation: said cancelled when it was delayed, or supplied a replacement itinerary that does not work.

### Defining "late" without an arbitrary window

A notification is **actionable** if it arrives before the traveller's **last decision point** — the moment at which they must commit to the affected leg (board the vehicle, or begin the walk to the quay they will be stranded at). After that point the notification is information, not help.

This is a principled definition rather than a tuned constant: it derives from the traveller's own itinerary, adapts automatically to the situation, and cannot be gamed by tuning against a fixed threshold. Timeliness is then scored as a decay from the moment the player *could first have known* — bounded below by operator lag `sₖ`, so a player is never penalised for failing to know something no feed had yet published.

That bound matters. Without it, the Information score would partly measure the world's staleness rather than the player's responsiveness.

### Reporting

Four numbers, reported individually and combined. **Decided at P0M5:**

```
score = F1(recall, precision) × (0.5 + 0.5 × timeliness)
```

Recall and precision combine as an F1 because they trade against each other directly: a player that warns everybody about everything gets recall for free and gives it all back on precision, which is precisely the exploit the noise term exists to close.

Timeliness scales rather than averages, and is floored at 0.5 rather than 0. The reasoning is that **being told late is still worth something** — a traveller who learns at the platform that their train is cancelled is better off than one who learns nothing — but it is worth much less than being told in time to act. A multiplicative term with no floor would say a warning that arrives a second late is worthless, which is false. An average would let excellent timeliness paper over having warned the wrong people, which is worse.

---

## 6. Cost family (Q23)

The trade-off in Q23 — better journeys at a hundred times the API calls — resolves cleanly once cost is modelled the way it actually works for a real aggregator: **as a contractual quota, not as a virtue.**

* Each tier declares a **budget**: API calls, bytes, and notifications sent.
* **Within budget, cost does not reduce the Service or Information scores at all.** Being under quota is not a merit; nobody praises an aggregator for making fewer calls than its contract allows.
* **Exceeding budget is a penalty**, scaled by the overage.
* The world already punishes egregious polling physically, via rate limits and `429`s (catalogue §2.1 E) and via the snapshot rule, which guarantees that polling faster than a feed updates returns identical bytes for nothing (`PLAYER-CONTRACT.md` §6.4).

So the Cost family measures the *economics*; the world itself enforces the *physics*. Those are different mechanisms and both should exist.

---

## 7. Q20 — combining them

**The score is a vector. The headline is a declared profile, not a truth.**

Any weighting across three non-substitutable families is a value judgement. Pretending otherwise buries an editorial decision inside a number. So:

* the **scorecard always reports the full vector**, and it is the scorecard that is canonical;
* a **headline** is produced by applying a *named, published profile*;
* leaderboards state which profile they rank by.

Proposed profiles:

| Profile | Service | Information | Cost |
|---|---|---|---|
| `balanced` *(default)* | 0.6 | 0.4 | budget-gated |
| `passenger` | 1.0 | 0.0 | budget-gated |
| `realtime` | 0.3 | 0.7 | budget-gated |
| `efficient` | 0.5 | 0.3 | 0.2 as a direct term |

The weights are honest guesses and should be treated as such — they are a starting point for argument, not a result. What matters structurally is that **the profile is named in every reported score**, so two numbers can never be compared without their weighting being visible.

---

## 8. Q24 — three levels, not one

Pass/fail and continuous are both needed, at different levels.

**Level 1 — Validity (binary).** Did this run produce a meaningful measurement at all? Run completed; wall budget respected (`TIME-MODEL.md` §9); contract conformance held; no cheat signal fired (§11). A failure here yields `invalid` and **no score** — never a bad score, because a machine-dependent or malformed run is not evidence about the solution.

**Level 2 — Tier clearance (binary).** Did the solution meet the tier's declared minimum? Serves the assessment use case, where "did this candidate pass?" is the actual question, and gates progression along the difficulty ladder.

**Level 3 — Score (continuous).** The vector, and the headline under a named profile.

A run is `invalid`, or `cleared`/`not cleared`, and separately scored. Reporting all three prevents the common failure of a single number that means different things at different ends of its range.

---

## 9. Score identity

```
world_seed × engine_version × scorer_version × contract_version
           × time_mode × latency_mode × hardware_profile × reference_competence
```

`reference_competence` joins the tuple because `REFERENCE-POLICY.md` §5 makes P1's competence configurable — and P1 is the zero point of every capture metric. A score computed against a `timetable` baseline is not comparable to one computed against `single_operator_rt`, since the same solution captures less headroom when the baseline is stronger.

Scores compare only within an identical tuple.

---

## 10. Q26 — explaining a score by counterfactual ablation

A score that cannot be explained is a grade, not a diagnostic. The manifest-driven design in `DATA-MODEL.md` §4 makes a genuinely strong answer available.

**Two-stage attribution:**

**Stage 1 — attribute loss to events.** Each traveller's shortfall against P0 traces to specific moments: a plan that was already suboptimal when issued, a transfer that failed, a disruption that went unnotified, an itinerary that did not resolve. This is bookkeeping over the run log and is cheap.

**Stage 2 — attribute events to conflicts.** Re-run the fixed scored query set with **one declared conflict neutralised at a time**, and measure the capture delta. The delta *is* that conflict's contribution to the loss.

This is expensive — one extra evaluation per declared conflict — but it is tractable precisely because open loop is deterministic and the query set is fixed and small (O(10³–10⁴)). It is also only needed for the diagnostic report, never for the score itself.

The result is a report a player can act on:

```
capture lost: 0.34
  0.19  stop-matching errors           [catalogue A: granularity mismatch, metro]
  0.09  acted on stale realtime        [catalogue D: staleness_s=90, bus_b]
  0.04  timezone handling              [catalogue B: local_naive, bus_a]
  0.02  unattributed
```

That is the difference between "you scored 0.66" and "you scored 0.66, and here is the specific thing to fix first." For the training and assessment positioning in `CORECONCEPT.md`, it is arguably more valuable than the score.

**Ablation is opt-in.** *Decided at P0M5.* Stage one — attributing lost capture to events — is bookkeeping over the run log, costs nothing, and is always on; it already names causes like *"did not arrive: origin unreachable"* against a capture figure. Stage two costs one extra evaluation per declared conflict, and the P0M4 world declares fifteen. At Tier 5 that will be far more.

Making it standard would mean every routine run paying for an analysis almost nobody reads. It is a `--ablate` flag on the scorer, and the natural time to reach for it is when stage one says *where* the capture went and you want to know *which conflict* put it there.

---

## 11. Anti-gaming

Each known vector and its structural answer:

| Vector | Answer |
|---|---|
| Decline everything, let P1 route | Forgone-obligation penalty **plus** P1's outcomes still charged to the player (`REFERENCE-POLICY.md` §8) |
| Notify everyone about everything | Precision term in §5 |
| Poll continuously for freshness | Snapshot rule returns identical bytes; rate limits; cost budget |
| Optimise the mean by stranding hard cases | Non-arrival dominates and is reported separately (§4) |
| Guess canonical identifiers | Unresolvable itineraries score as modelling failures (`PLAYER-CONTRACT.md` §7) |
| Reason about wall-clock time | Unsupported by contract; `virtual` mode makes it inert |
| Any information leak | `capture > 1` is impossible and fires a validity failure (§2) |

The last row is the most useful, because it catches leaks nobody anticipated.

**Quarantine, do not invalidate.** *Decided at P0M5, on evidence.* The run is scored, marked `quarantined`, and withheld from comparison pending the information-set audit.

The evidence is Phase 0 itself: this signal fired three times during construction, and **every single time it was our bug, not a player's** — a free access walk at P0M1, an imagined zero-cost transfer at P0M2, a cancelled service ridden anyway at P0M4. A rule that hard-invalidated would have thrown away three legitimate runs and told us nothing about why. Quarantine keeps the number for diagnosis and keeps it off the leaderboard, which is what both parties actually need.

### `capture > 1` is not sufficient on its own

Found while building P0M1. `capture` is a *ratio*, and its denominator is the headroom `m(P1) − m(P0)`. Where that headroom is zero or near-zero, the ratio cannot be formed and **the leak detector is silently blind** — which is exactly the situation in a low-tier world, a world with one operator, or any world whose declared conflicts turn out not to bite.

P0M1 hit this for real: a simulator bug let players begin their journey at whichever quay they chose to board, skipping the walk from the origin. The reference player beat the oracle on seven of ten queries. `capture > 1` could not fire, because P1 and P0 coincided.

**The companion invariant, which holds regardless of headroom:**

> **No traveller may arrive sooner than perfect information allows.** For every scored traveller, `journey ≥ oracle_journey`.

This is strictly stronger — it is per-traveller rather than aggregate, so a single anomaly is enough, and it needs no denominator. A run with any such traveller is invalid and goes to the information-set audit (`OBSERVABILITY.md` §5).

Implemented in `src/scoring` as `impossibleTravellers`. **Both checks should run**: the per-traveller one catches what the aggregate ratio cannot, and the ratio still catches systematic advantage spread thinly across many travellers where no single one looks impossible.

---

## 12. Closed loop (Q18–Q19)

**Q18 — what remains reproducible.** The initial world only: city, operators, schemas, demand table, traveller attributes. Once the player's answers begin changing behaviour, histories diverge and two runs are not comparable trace-for-trace. This was accepted deliberately in `CORECONCEPT.md` §3.1.

**Q19 — replay for debugging: yes.** Record the event stream *and every player response*. Replaying the recorded responses against the same seed reproduces the run exactly, because the only non-deterministic input has been captured. **A closed-loop run is therefore not reproducible live, but is perfectly reproducible post hoc** — which is what debugging actually needs.

**Closed-loop scores** are computed with the same machinery and marked `non-comparable`. They are useful for tracking your own progress against yourself; they must never appear on a leaderboard beside open-loop results. The distinction is carried in the score identity via `run.mode`.

---

## 13. Example scorecard

```
run-7f31   seed 481516 · engine 0.3.0 · scorer 0.1.0 · contract 0.2
           virtual · latency none · reference timetable · tier 2
           VALID · tier CLEARED

SERVICE                              capture 0.71
  journey time                               0.74
  wait time                                  0.66
  failed transfers          12 / 4,812       0.81
  non-arrivals               3 / 4,812       0.52   ← dominates
INFORMATION                          score   0.58
  recall (not silent)      142 / 190         0.75
  precision (not noisy)    142 / 201         0.71
  timeliness                                 0.63
  accuracy                                   0.91
COST                                 within budget
  API calls             184,220 / 250,000
  notifications             201 / 1,000

HEADLINE  profile=balanced            0.66

TOP ATTRIBUTED LOSS
  0.19  stop matching        [A: granularity mismatch, metro]
  0.09  stale realtime       [D: staleness_s=90, bus_b]
```

The non-arrival line is doing exactly what §4 intends: three stranded travellers out of nearly five thousand pull the Service family down noticeably, because being stranded is categorically worse than being slow.

---

## 14. What this closes

**Q20** — a three-family vector as the canonical result; headline via a named, published profile; weighting is an explicitly declared value judgement.
**Q22** — four failure kinds, not three: silent, noisy, late, wrong. "Late" defined against the traveller's last decision point and floored by operator lag.
**Q23** — cost as a contractual budget, not a virtue: free within, penalised beyond; the world enforces the physics separately.
**Q24** — three levels: validity (binary), tier clearance (binary), score (continuous).
**Q26** — two-stage attribution, with counterfactual ablation over the declared conflict set producing an actionable report.
**Q18** — initial world only.
**Q19** — yes: record player responses, replay post hoc.

**Open:** none. All four were closed at P0M5 — wait weighting (§4), the Information combination (§5), ablation as opt-in (§10), and quarantine-not-invalidate on `capture > 1` (§11).

**With this drafted, every question in `CORECONCEPT.md` §9 has a drafted answer except the platform and packaging questions Q39–Q40 and Q43–Q44**, which are product decisions that do not block building. The specifications are ready to become executable: OpenAPI documents and a conformance suite from the schema source in `DATA-MODEL.md` §5.
