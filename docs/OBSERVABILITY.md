# Observability and Causal Tracing — Draft v0.1

**Status: DRAFT.** **OPEN** marks what I did not decide.

**Purpose:** make a completed run explainable at the level of a single traveller — *this request was issued, the player fetched these things while answering it, it replied this, and that is why this traveller went that way and arrived when it did.*

**Serves:** teaching, diagnostics, and forensics on the `capture > 1` invariant (`SCORING.md` §2, §11).
**Requires:** a small additive amendment to `PLAYER-CONTRACT.md` — §6.
**Depends on:** the snapshot rule (`PLAYER-CONTRACT.md` §6.4), which turns out to solve the size problem before it is asked.

---

## 1. The increment is edges, not data

`SCORING.md` §1 already requires the run log to carry every obligation and response, every notification with its arrival stamp, every operator API call with endpoint and timestamp, every traveller outcome, the ground-truth event stream and the declared conflict set.

Those are the **nodes**. What is missing for the narrative above is the **edges** — which API calls belong to the handling of which obligation, and which traveller decision followed from which answer.

Edges are correlation identifiers. They are almost free. The expensive-sounding part of this idea is already a requirement.

---

## 2. The trace model

Borrow the shape of distributed tracing rather than inventing one. Each scored traveller's history is a tree of spans:

```
traveller trv-88431
└─ plan  req-000123            τ 08:12:00 → 08:12:20   [obligation]
   ├─ ingestion attributed to this handler
   │  ├─ bus_a  GET /timetable      τ 08:12:00  200  hash 4f21…  12.4 KB
   │  ├─ bus_b  GET /stops?page=2   τ 08:12:00  200  hash 91ac…   8.1 KB
   │  └─ metro  GET /realtime       τ 08:12:00  200  hash 77de…  41.0 KB
   ├─ response  status ok, 4 legs, applied at deadline 08:12:20
   └─ world consequences
      ├─ 08:15:00  departs on plan
      ├─ 08:24:00  boards bus_a T447 at S12          (scheduled 08:24, actual 08:24)
      ├─ 08:31:00  metro B-1142 CANCELLED            ← ground truth
      ├─ 08:31:30  player polls metro, sₖ=90s        ← could not have known sooner
      ├─ 08:31:42  notify delivered, latency 42 s    [SCORED: information]
      ├─ 08:39:00  alights S49, follows revised plan
      └─ 08:58:00  ARRIVES.  P0 08:51 · P1 09:26 · capture 0.80
```

Every line is already logged or derivable. The tree is what makes it legible.

---

## 3. Attribution: how the simulator knows which calls belong to which handler

Two mechanisms, and the important property is that the first works **without any player cooperation**.

### 3.1 Temporal attribution (always available)

In `virtual` mode the simulated clock is paused for the duration of an obligation handler (`TIME-MODEL.md` §3). Every operator call the player makes is served *by the simulator*, and is therefore logged with its own `τ` regardless of what the player does or declares.

A call whose `τ` falls inside a paused interval is **provably** part of that handler. The player cannot conceal it, cannot forge it, and cannot opt out — because the simulator sits on both sides of the interaction.

This matters most for the forensic use case in §5: a player attempting to hide where its knowledge came from simply cannot.

### 3.2 Trace-context propagation (better, and optional)

Temporal attribution degrades when handlers overlap — batched obligations, concurrent players, or `realtime` mode where the clock never pauses. For those, the standard mechanism already exists: **W3C Trace Context**.

* The simulator sends `traceparent` on every obligation.
* A cooperating player echoes it on the operator calls it makes while handling that obligation.
* The player declares a `tracing` capability in `/v1/identity`.

Using the W3C header rather than a bespoke one matters: every mainstream HTTP library already emits and propagates it, so for most players this is configuration rather than code, and for an agent it is a recognisable standard rather than a project quirk.

**Optional, not mandatory.** Incentives already align — a player that propagates gets a far more useful diagnostic report about its own behaviour — and §3.1 means the forensic guarantee never depends on it.

---

## 4. Log size — the concern, and why it evaporates

This was the right thing to worry about. The naive version really is unmanageable, and the fix is a consequence of a rule already adopted for entirely different reasons.

### The naive approach

Store operator API **response bodies** verbatim. For a Tier-3 open-loop run — 18-hour simulated day, 30-second tick cadence, 4 operators, 2 endpoints each, ~5 000 scored travellers:

| | |
|---|---|
| ingestion calls | 17 280 |
| verbatim bodies at ~200 KB | **3 375 MB** |

Unusable, exactly as suspected.

### The snapshot rule makes bodies redundant

`PLAYER-CONTRACT.md` §6.4 guarantees that **every operator response is a pure function of `(operator, endpoint, params, τ)`**. It was adopted to stop the paused clock being exploitable. It has a second consequence nobody was looking for:

> **A response body never needs to be stored, because it can be regenerated exactly.**

The log records the request coordinates plus a hash and a size. The analysis tool replays the projection to reconstruct the body byte-for-byte when a human actually wants to look at it. The hash verifies the reconstruction — and doubles as a drift detector, catching any engine change that silently altered a projection.

| Component | Size |
|---|---|
| ingestion trace, 17 280 calls × ~120 B metadata | 1.98 MB |
| obligations, 6 500 × ~1.5 KB | 9.30 MB |
| notifications, 2 000 × ~0.5 KB | 0.95 MB |
| traveller outcomes, 5 000 × ~300 B | 1.43 MB |
| **total** | **13.7 MB** — ~1.4 MB gzipped |

**A 248× reduction, with no loss of information.**

### The same trick removes the two largest remaining items

The background population and the world event stream look far worse than the ingestion trace:

| | Naive | Actually |
|---|---|---|
| background population, 10⁵ travellers × ~10 events | 57 MB | **not stored** |
| world event stream, ~10⁷ events | 382 MB | **not stored** |

In open loop the trajectory is player-independent by definition, so it is `f(seed, engine_version)` and regenerates. In closed loop it is player-dependent — but `SCORING.md` §12 already requires recording every player response for replay, and `L1 + seed + player responses → the entire trajectory` (`DATA-MODEL.md` §3).

### The principle

> **Log inputs and decisions. Never log derived state.**

Everything else regenerates, because the system was already designed to be deterministic. The observability design is essentially free — it is a dividend of the determinism work rather than a new cost.

---

## 5. Forensics: locating a `capture > 1`

`SCORING.md` §2 established that capture above 1.0 is impossible and signals a leak. Tracing makes the diagnosis mechanical, and the sharpest tool is narrower than a full trace.

**The information-set audit.** At the moment the player answered obligation *X*, the set of facts legitimately available to it is the union of every response the simulator served it up to that `τ`. That set is exactly computable from the ingestion trace — and, thanks to §3.1, it is complete regardless of the player's cooperation.

Then ask: **does the answer depend on anything outside that set?** Concretely —

* an itinerary using a stop pairing that appears in no data the player was served;
* a departure time more accurate than any feed had published at that `τ`;
* correct behaviour around a disruption before the relevant operator's lag `sₖ` had elapsed.

Any of these is a leak. The audit narrows a suspicious run to a specific obligation and a specific fact, which is usually enough to identify the mechanism — and in practice it will more often catch **our** bug, a projection accidentally serving fresher data than its manifest declares, than a cheating player. That is the more valuable outcome.

This is also the natural home for the resolution of `SCORING.md` §11's OPEN item: flag and quarantine on `capture > 1`, run the audit, then decide.

---

## 6. Contract amendment — v0.3

Small and additive:

* `tracing` capability in `GET /v1/identity`;
* `traceparent` (W3C Trace Context) sent by the simulator on every obligation, and echoed by a cooperating player on operator API calls;
* no change to any payload schema, and no obligation on a player that does not declare the capability.

Applied to `PLAYER-CONTRACT.md`.

---

## 7. Logging levels

| Level | Contains | Size (Tier-3 run) | Default |
|---|---|---|---|
| **`score`** | what `SCORING.md` §1 requires | ~12 MB | — |
| **`trace`** | + causal edges and ingestion metadata | ~14 MB | **on** |
| **`replay`** | + every player response verbatim | ~20 MB | closed loop |
| **`verbatim`** | + reconstructed response bodies inline | GBs | opt-in, short runs only |

`trace` is the default because it costs about 2 MB over the minimum and provides the entire narrative in §2.

**`verbatim` is capped at 250 MB, and the cap is enforced rather than advised.** *Decided at M6.* On reaching it the run keeps writing at `trace` level and records that it downgraded, rather than truncating — a truncated verbatim log is worse than a complete trace log, because it looks complete until the moment you need the part that is missing.

The number is chosen to be roughly a short demo run and unambiguously not a full day: at ~200 KB per operator response, 250 MB is around 1,250 fetches. If you are hitting it, `verbatim` is the wrong level for what you are doing — the whole point of the snapshot rule is that bodies are regenerable, so `trace` plus a replay gives you the same bytes on demand (§4).

**Format:** newline-delimited JSON while running — append-only, streamable, and a crashed run still leaves a usable log — compacted to SQLite at run end for analysis. SQLite matches the world-bundle choice in `DATA-MODEL.md` §6, so one query tool serves both.

---

## 8. Disclosure policy — the part that needs a decision

A trace contains ground truth: which conflicts fired, what the world's real state was, when the player could first have known things.

* **Training / sandbox** — disclose fully. This is precisely the feedback that makes the project educational, and it is the strongest argument for building tracing at all.
* **Assessment / benchmark** — a full trace of one run leaks a great deal about the world. Across several runs on the same seed it would substantially reconstruct the answer key.

**Decided at M6.** Disclosure is a run-configuration setting with three levels, because a binary was the wrong shape — the attribution report genuinely sits on both sides of the line.

| Level | The player sees | For |
|---|---|---|
| `full` | everything: ground truth, the disruption stream, per-conflict attribution | sandbox, learning |
| `attributed` *(default)* | its own actions and outcomes, plus **which catalogue sections** cost it capture — `A: identity`, `D: realtime truthfulness` — but not which operator or which setting | most runs |
| `outcome` | its own actions and outcomes only | assessment, benchmark |

The middle level is the one that took working out. Naming *"stop-matching errors cost you 0.19"* tells a player what kind of problem they have without telling them the answer: they still have to find which operator, which stops, and why. Naming *"`A-granularity:sudbahn`"* hands over the answer key.

That distinction is exactly the difference between a hint and a solution, and it is also why `attributed` is the default rather than `full`: a player who is told the section learns the lesson, and one who is told the setting learns nothing except how to patch one world.

---

## 9. Visualisation

The map-and-timeline viewer is a natural artefact and the data model already supports it: `DATA-MODEL.md` §2 precomputes geometry, and the trace in §2 carries everything a per-traveller replay needs — position over time, decision points, what was known when.

Two views worth building first:

1. **Traveller timeline** — the §2 tree rendered as a horizontal time axis, with the player's knowledge state as a band underneath, so the gap between *the world changed* and *the player knew* is visible as a shaded region. That single visual explains the information metric better than any prose.
2. **Map replay** — vehicles and the selected traveller animating over the network, with disruptions firing and notifications landing.

Tooling, not specification. Worth deferring until the simulator runs, then worth building early, because it will find bugs in the simulator faster than tests will.

---

## 10. What this closes

* Per-traveller causal narrative, as a span tree over data already required.
* Attribution without player cooperation in `virtual` mode; W3C Trace Context for the harder cases.
* **The size concern: 13.7 MB rather than 3.4 GB**, because the snapshot rule makes response bodies regenerable and determinism makes trajectories regenerable. *Log inputs and decisions, never derived state.*
* A mechanical procedure for diagnosing `capture > 1` — the information-set audit — that most often catches our own projection bugs.

**Open:** none. Both closed at M6 — three disclosure levels rather than two (§8), and a 250 MB enforced cap that downgrades rather than truncates (§7).

**Contract impact:** v0.3, additive, applied.
