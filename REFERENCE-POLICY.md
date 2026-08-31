# Reference Policy — Draft v0.1

**Status: DRAFT.** **OPEN** marks what I did not decide.

**Closes:** `CORECONCEPT.md` §9.5 Q29 (how travellers decide without the player), and clarifies Q25 (equal-difficulty verification).
**Imposes a constraint on:** Q20/Q22, the scoring function — see §8. That constraint is not optional; without it, refusing to answer becomes a winning strategy.
**Constrained by:** `PLAYER-CONTRACT.md` §8 and §11, `DATA-MODEL.md` §2, `TECHNICAL-RESEARCH.md` §7.

---

## 1. The question is not "what routing algorithm"

The obvious reading of Q29 is "pick a baseline routing algorithm". That reading produces the wrong artefact.

The reference policy is not a placeholder for the player. It is **the model of how people travel in a city that has no integration layer** — which is the premise of the entire project. `CORECONCEPT.md` opens by stating that the player's job is to unite independent carriers into a single network. If the simulated population already travelled as though that network existed, there would be nothing to build.

So the design constraint is inverted from what it first appears:

> **The reference policy must be realistically mediocre, and its mediocrity must be of a specific, principled kind: exactly the mediocrity that an absence of integration causes.**

Not random incompetence. Not artificial handicapping. The policy should be *as good as a well-informed local can be* when nobody has joined the operators' data together — and no better. The gap between that and the oracle **is** the headroom the player is competing for. It is also, therefore, the quantity that determines whether a world is worth playing at all.

---

## 2. Three policies, currently conflated

Existing documents use "reference policy" and "naive baseline" loosely, sometimes for the same thing. They are three different objects with three different jobs.

| | **P0 — Oracle** | **P1 — Reference policy** | **P2 — Naive baseline** |
|---|---|---|---|
| Represents | the achievable optimum | a city without integration | a lazy integration attempt |
| Knowledge | full L1 + perfect realtime | published, per-operator, unjoined | player-side, coordinate-threshold matching only |
| Drives the world? | **never** | **yes** | never |
| Used for | score normalisation, solvability | world evolution, non-app-users, fallback | difficulty calibration |
| Lives | in the scorer | in the simulation core | in the validation harness |

**P0** is defined in `TECHNICAL-RESEARCH.md` §7: RAPTOR over ground truth with perfect information. It is an upper bound, never a traveller.

**P2** is a deliberately lazy *player*: match stops across operators by coordinate proximity alone, plan on the merged graph, ignore realtime. Its purpose is calibration — the P0-to-P2 gap measures how much a world's declared conflicts actually cost someone who does the obvious thing badly. It never touches the world.

**P1 is this document.**

---

## 3. Who uses which policy

| Loop mode | Population | Scored travellers |
|---|---|---|
| **Open loop** | all background travellers → **P1** | separate query set → **player**, simulated as ghost riders (§9) |
| **Closed loop** | `1 − app_user_fraction` → **P1** | `app_user_fraction` → **player**, and they perturb the world |

This is what makes open loop reproducible: the entire population runs P1, which is a pure function of the seeded world, so the trajectory is fixed regardless of what the player does.

---

## 4. P1's design

Three restrictions, each modelling a specific real consequence of non-integration.

### 4.1 Restricted transfer graph — the important one

A P1 traveller may transfer **only at publicly-obvious interchanges**: Sites where two or more operators both publish service. These are the places every local knows connect — the central square where the buses and the metro both stop, the terminal where three companies share a forecourt.

A P1 traveller may **not** transfer between a pair of quays that happen to be 90 metres apart, are named differently by two operators, and appear in no shared publication. Nobody knows that connection exists, because nobody has ever joined the two datasets.

**This is where the player's value comes from, stated precisely.** The oracle transfers on the *full* canonical connectivity of the city. P1 transfers only on the *publicly obvious* subset. Everything in between — the non-obvious, discoverable-only-by-careful-data-work connections — is exactly what a working integration layer unlocks, and exactly what the player is being paid to find.

It also means the headroom is **generator-controllable**: widen or narrow the obvious-interchange set and you directly tune how much a good solution can win by. That is a far more principled difficulty dial than fiddling with delay distributions.

### 4.2 Scheduled-only information

P1 plans on published timetables, not realtime. It discovers a cancellation by standing at a quay and watching the vehicle not arrive.

This produces exactly the failure modes the player exists to prevent: passengers stranded by disruptions nobody told them about, connections missed that a warning would have saved, journeys abandoned that a reroute would have completed.

### 4.3 Reactive, never anticipatory

When a plan breaks, P1 replans from the traveller's current position — again scheduled-only, again on the restricted graph. It never anticipates. It has no notion that a downstream leg is *about to* fail.

Abandonment is bounded by per-traveller thresholds drawn from the world seed: maximum wait at a quay, maximum cumulative delay tolerated, maximum replans attempted. On breach, the trip is abandoned and counts against `passengers who did not reach their destination`.

---

## 5. Competence levels — a difficulty dial

P1's information access is configurable. Better baseline, less headroom, harder to score well.

| Level | Traveller knows | Models |
|---|---|---|
| **`habitual`** | only a personal repertoire of lines and quays, seeded per traveller | a population of creatures of habit; widest headroom |
| **`timetable`** *(default)* | all operators' published timetables, no realtime, obvious interchanges only | a diligent local with paper schedules |
| **`single_operator_rt`** | the above, plus realtime **for the operator of the current or next leg only** | everyone has each operator's own app, but nothing joins them; narrowest headroom |

`single_operator_rt` is the most realistic of the three for a contemporary city and the most demanding on the player, since it removes the easiest source of advantage. **OPEN:** whether it, rather than `timetable`, should be the eventual default. I lean toward `timetable` for the MVP — it is simpler and gives the first players visible wins — and `single_operator_rt` from Tier 3 upward.

---

## 6. Implementation: one router, three configurations

P0, P1 and P2 are **the same RAPTOR** with different inputs. No second routing engine is needed.

| | Graph | Time source | Transfers |
|---|---|---|---|
| **P0** | full canonical | L2 truth at `τ` | all canonical connectivity |
| **P1** | full canonical | published schedules (+ single-operator realtime at the top level) | obvious interchanges only |
| **P2** | player-side merged | whatever the lazy match produced | coordinate threshold |

Since the oracle is already required (`TECHNICAL-RESEARCH.md` §7 argues it is the highest-leverage component in the project), P1 costs an edge filter and a time source, not an implementation.

---

## 7. Determinism

P1 must be a pure function of `(L1, L2@τ, traveller attributes, seed)`. Specifically:

* no wall-clock reads, per `TECHNICAL-RESEARCH.md` §11;
* all randomness — patience thresholds, repertoire contents, tie-breaks among equal-cost itineraries — drawn at **world build time** and stored in L1's demand table, not drawn during the run;
* ties among Pareto-equal itineraries broken by a deterministic rule (lowest canonical id chain), never by iteration order over a hash container.

Storing traveller attributes in the demand table (`DATA-MODEL.md` §2) rather than generating them at run time is what allows the app-user fraction to be selected deterministically and the same population to be replayed exactly.

---

## 8. The fallback, and why it constrains scoring

`PLAYER-CONTRACT.md` §8 says an unanswered obligation means the traveller "falls back to documented degraded behaviour: continue on the current plan if one exists, otherwise the reference policy." Precisely:

1. If the traveller holds an itinerary that is still physically possible → continue on it.
2. Otherwise → P1 replan from current position.
3. Identical regardless of *why* the player failed — timeout, malformed body, `declined`, or crash.

### The declining exploit

This creates a real hazard, and it needs naming before the scoring function is written.

> If P1 produces tolerable outcomes and `declined` is scored gently, **the optimal strategy for a weak player is to decline everything** and let the simulator route its travellers for it.

That would be an absurd result, and it is not hypothetical — a half-built solution that answers badly could plausibly score worse than one that answers not at all.

**The structural fix, which Q20/Q22 must honour:**

* an unanswered or declined obligation carries a **fixed forgone-obligation penalty**, independent of how the traveller subsequently fared;
* **and** the resulting P1 passenger outcomes still count in full against the player's passenger metrics.

The player therefore absorbs P1's mediocre outcomes *plus* a penalty. Declining becomes strictly worse than a competent answer and roughly comparable to a poor one — which is the correct ordering. A player that declines only where it genuinely has no answer loses a little; one that declines everything loses everything.

This is the one place where Q29 hard-constrains the scoring design, and I would treat it as a requirement rather than a preference.

---

## 9. Ghost riders in open loop

An ambiguity the earlier documents leave open, resolved here.

In open loop the world's trajectory must be independent of the player. But the player plans journeys for scored travellers. If those travellers boarded vehicles, they would change loads, dwell times and crowding — and the trajectory would depend on the player after all.

**Resolution: scored travellers are ghost riders.** Their itineraries are simulated against the fixed trajectory — their vehicle really was cancelled, really was eight minutes late, really was full — and their outcomes are measured in full. But their boarding does not alter vehicle occupancy, dwell time or anything else in L2.

This is a small, deliberate fiction, and it is the exact price of reproducibility. It is also why closed loop exists: there, riders are real and the feedback effects are the point.

**OPEN:** whether denied boarding due to capacity should still apply to ghost riders. It should — a full bus is a fact of the fixed trajectory, and "your plan put someone on a bus that had no room" is a legitimate failure the player should own. But it means ghost riders are affected by the world while not affecting it, which is worth stating plainly rather than discovering later.

---

## 10. Calibration: what P1 is measured against

The validation gate in `DATA-MODEL.md` §7 item 5 requires the oracle-to-baseline gap to fall within the tier's declared band. With three policies that becomes concrete:

* **P0 − P1** = total headroom available to any player. Too small, and the world is not worth playing; too large, and it is probably broken or absurdly disconnected.
* **P0 − P2** = how much the world's declared conflicts cost a lazy integrator. This is the measure of whether the *conflicts* are doing work, as opposed to the topology.
* **P1 − P2** = whether a lazy integration is even better than not integrating. If P2 is worse than P1, the world's conflicts are punishing enough that a careless solution actively harms people — a legitimate and interesting property at Tier 4+, and a bug at Tier 1.

**This triple is the answer to Q25** (verifying two generated worlds are of equal difficulty): two worlds are comparable when all three gaps match within tolerance, not merely when they have the same conflict list.

---

## 11. What this closes

**Q29** — P1: RAPTOR restricted to publicly-obvious interchanges, planning on published schedules, reactive and never anticipatory, with per-traveller patience seeded into the demand table. Three competence levels as a difficulty dial.
**Q25** — sharpened: worlds are of equal difficulty when the P0−P1, P0−P2 and P1−P2 gaps all match, not when conflict lists match.

**Terminology fixed:** P0 oracle / P1 reference policy / P2 naive baseline, which earlier documents conflated.

**Constraint exported to Q20/Q22:** the forgone-obligation penalty (§8). Not optional.

**Open:** default competence level (§5); capacity denial for ghost riders (§9).

**Next:** Q20/Q22, the scoring function — now the last major undecided piece, and it inherits a hard requirement from §8 plus the three-gap calibration structure from §10.
