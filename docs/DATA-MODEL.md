# Canonical Data Model — Draft v0.1

**Status: DRAFT.** **OPEN** marks what I did not decide.

**Closes:** `CORECONCEPT.md` §9.6 Q32 (canonical model), and Q33 (how a conflict is specified) in draft.
**Touches:** Q34 (world validation), Q35 (generated documentation).
**Constrained by:** `PLAYER-CONTRACT.md` §7 (operator-scoped references), `TIME-MODEL.md` §3 and §8 (snapshot rule, monotonic `τ`), `TECHNICAL-RESEARCH.md` §11 (TypeScript runtime / Python offline).

> **Refines `TECHNICAL-RESEARCH.md` §6.** That section recommended "a GTFS superset, OTP2-style". Working it through, that is half right and half wrong in a way worth stating plainly: GTFS is a *publication* format, not a state model, and its flat stop model cannot express the granularity mismatches that catalogue §2.1 A depends on. The canonical model should be **NeTEx-informed in its identity layer and simulation-native in shape, with GTFS as a first-class projection target rather than the internal form.**

---

## 1. Why one model is not enough

A single model is asked to do four incompatible jobs: describe what exists, track what is happening, be published in a dozen dialects, and be fast. Trying to satisfy all four at once is how this kind of project ossifies.

Three layers, with a strict dependency direction:

| Layer | What it holds | Mutability | Owner | Sees |
|---|---|---|---|---|
| **L1 — World** | what exists: places, quays, lines, patterns, scheduled journeys, calendars | immutable after build | Python (offline) | — |
| **L2 — State** | what is true at `τ`: vehicle positions, delays, loads, cancellations, traveller states | mutable, hot | TypeScript DES core | L1 |
| **L3 — Projections** | what each operator *publishes*, in its own dialect, with its own defects | derived, cached | TypeScript API servers | L1 + L2 |

**Nothing ever flows upward.** L3 cannot write to L2; L2 cannot write to L1. The player only ever sees L3.

This is the structure that makes the rest of the specifications implementable. `TIME-MODEL.md` §3's snapshot rule becomes a *type signature* rather than a discipline:

```
project_k : (L1, L2@τ, manifest_k, seed) → bytes
```

No wall clock, no call counter, no request history in the signature. A defect that cannot be expressed as a pure function of those four things is a defect we do not implement.

---

## 2. L1 — the canonical world

### Identity: two levels, because operators disagree about granularity

The single most consequential decision. GTFS has flat `stops` with an optional `parent_station`; NeTEx has `StopPlace` containing `Quay`s. **We need both levels as genuine first-class entities**, because catalogue §2.1 A requires that one operator publish a station as a single node while another publishes five platforms — and that mismatch must be a *projection choice*, not a hack.

```
Site        a station complex or interchange — "Central Square"
 └─ Quay    a specific boarding location with coordinates — platform 2, stand C
```

* Every boarding and alighting in the simulation happens at a **Quay**.
* A **Site** groups Quays that a traveller can walk between without leaving the interchange, and carries the in-site transfer times.
* Both have canonical IDs. **The player never sees either.**

### Services

NeTEx's decomposition, because it is what a simulator actually needs:

```
Line              the branded service — "Route 12"
 └─ JourneyPattern    an ordered sequence of Quays (one variant of the Line)
     └─ ScheduledJourney   a Pattern + start time + calendar
Vehicle           a physical unit that operates Journeys
```

GTFS's `route → trip → stop_times` collapses the pattern level, which forces either stop-time duplication across every trip or a reconstruction step. Keeping `JourneyPattern` explicit costs nothing and makes both the DES core and the oracle simpler.

`ScheduledJourney` holds **offsets from journey start, in integer seconds**, not absolute times. Absolute times are derived. This is what makes past-midnight service trivial rather than special-cased.

### Time in L1

Per `TIME-MODEL.md` §8:

* all instants are **monotonic integer seconds from the world epoch**;
* all durations are integer seconds;
* **there is no local time, no timezone, no offset and no calendar arithmetic anywhere in L1 or L2.**

Service calendars are stored as **explicit sets of service days** over the world's date range. Weekday bitmasks, exception dates and recurrence rules are *projection* concerns — they are catalogue §2.1 B defects, and they belong in L3 where they can be got wrong deliberately.

Local time, UTC offsets, DST transitions and `25:10:00` are **rendering**, and rendering happens exactly once, at the L3 boundary. This is not a stylistic preference: it is the reason a duplicated 02:30 during a DST fallback cannot corrupt event ordering in the core.

### Geometry

* Quay coordinates are stored once, canonically, as WGS84 doubles.
* **All distances the core needs are precomputed at build time into binary matrices**, because `TECHNICAL-RESEARCH.md` §11 forbids transcendental functions in the runtime core. Haversine is Python's job, once, offline.
* Shapes and polylines are L1 data used for rendering and for projection (some operators publish them, some do not, some publish them wrong).

### Demand

Travellers are generated into L1 as a **demand table**: origin, destination, desired departure or arrival, and traveller attributes. Being part of the seeded world rather than of the run is what lets open-loop mode replay identically, and lets the app-user fraction (`PLAYER-CONTRACT.md` §11) be chosen deterministically.

Attributes include everything the reference policy needs drawn ahead of time rather than during the run (`REFERENCE-POLICY.md` §7): patience thresholds, maximum tolerated delay, replan budget, and — at the `habitual` competence level — the traveller's personal repertoire of known lines and quays.

---

## 3. L2 — simulation state

Owned by the DES core. Struct-of-arrays over TypedArrays, per the benchmark in `TECHNICAL-RESEARCH.md` §11.

Holds, per entity and indexed by canonical id: vehicle position along a pattern, current delay, occupancy, journey status (`scheduled | running | completed | cancelled`), quay closures, traveller status and current itinerary, and the event log.

Two properties matter more than the field list:

1. **L2 is reconstructible.** `L1 + seed + event log → L2@τ` for any `τ`. This is what makes the golden-trajectory test in `TECHNICAL-RESEARCH.md` §4 possible, and what lets a run be replayed for debugging.
2. **L2 is the only mutable thing in the system.** Everything else is either immutable input or a pure function.

---

## 4. L3 — operator projections

### A projection is a manifest, not a program

Per operator, a declarative manifest selects from the catalogue in `CORECONCEPT.md` §2.1. Sketch:

```jsonc
{
  "id": "bus_a",
  "name": "Nordline",
  "dialect": "gtfs_like",              // gtfs_like | netex_like | proprietary
  "identity": {
    "granularity": "quay",             // quay | site  ← catalogue A
    "id_scheme": "S{n}",
    "id_stability": "stable",          // stable | renumbering | reuse
    "collides_with": ["bus_b"]         // deliberately overlapping ID space
  },
  "naming": { "variant": "colloquial", "abbreviate": true, "transliterate": false },
  "geometry": { "precision": 5, "offset_m": { "dist": "normal", "sigma": 25 },
                "latlon_order": "lat_lon", "shapes": "omitted" },
  "schedule": { "form": "stop_times", "calendar": "weekday_mask_with_exceptions" },
  "time":     { "encoding": "epoch_s", "zone": "local_naive", "past_midnight": "wrap" },
  "realtime": { "staleness_s": 90, "publishes": ["positions", "delays"],
                "cancellations": "silent_drop",        // ← catalogue D, the good one
                "prediction_noise": { "regressive": true } },
  "protocol": { "pagination": "offset", "page_size": 100, "rate_limit_rpm": 60,
                "auth": "header_key", "errors": "200_with_body" },
  "coverage": { "network_fraction": 0.85, "transfers": "none" }
}
```

Every key traces to a lettered catalogue section, which is what lets the scorer explain a loss in terms of the conflict that caused it (`CORECONCEPT.md` §2.1, design rule).

**Q33 — manifest first, code where necessary.** Most defects are pure data transforms and belong in the manifest, because the evaluator must be able to *read* them. A minority are stateful — regressive predictions, ghost trips — and need a plugin implementing the same `project_k` signature. The manifest still declares that the plugin is active, so the world's difficulty declaration stays complete.

### Non-atomic pagination is not implemented — it emerges

Worth calling out, because it validates the whole design. Catalogue §2.1 D wants "paginated results assembled from different moments, internally inconsistent." Under the pure-function rule we write no special case: page 1 requested at `τ₁` reflects state at `τ₁`, page 2 at `τ₂` reflects `τ₂`. With offset pagination over a shifting collection, the player misses and duplicates records naturally.

One caveat that ties back to the time model: during an automatic pause with `latency: none`, all pages share one `τ` and the defect vanishes. It bites properly only across ticks, or with `latency: sim` (`TIME-MODEL.md` §2.1), where each call advances the connection cursor. **So `latency: sim` is not merely fidelity — it is load-bearing for a catalogue D defect.** Worth knowing before deciding it is optional forever.

### The resolution table

`PLAYER-CONTRACT.md` §7 requires `(operator, published_id) → canonical entity`. Each projection emits that mapping into the world bundle as a **private artefact**: used by the simulator to resolve itineraries and by the oracle and scorer, never served over any API.

It is naturally many-to-many, which is exactly the point: `metro:M-CENTRAL-P1` and `metro:M-CENTRAL-P2` both resolve to Quays under Site `Central Square`, while `bus_a:S49` resolves to the Site itself. A player that has correctly matched them has reconstructed part of this table by inference — which *is* the game.

---

## 5. Schema source of truth, and the language seam

This is what TypeScript was chosen for, so it should be used deliberately.

```
     TypeScript schema definitions  (Zod or TypeBox)
                    │
     ┌──────────────┼───────────────┬────────────────┐
     ▼              ▼               ▼                ▼
  TS types    JSON Schema      OpenAPI 3.1     runtime validators
                    │           (per operator)
                    ▼
          Python models (generated)
                    │
                    ▼
        world builder writes L1, validating on write
```

**TypeScript is the source; Python consumes generated artefacts.** The world builder validates on write and the runtime validates on read — belt and braces at the one seam where two languages meet.

The same schema definitions generate each operator's OpenAPI document and its human-readable documentation (Q35) — including, at higher tiers, documentation that is deliberately incomplete or subtly wrong, since the *divergence* between generated docs and generated behaviour is itself catalogue §2.1 F. Generating both from one source is what makes that divergence controllable rather than accidental.

---

## 6. The world bundle

A world is one addressable artefact, identified by `seed × engine_version`.

**Recommendation: SQLite.** One file, queryable from Python for validation and analysis and from TypeScript at load, compact, and trivially hashable for the golden-trajectory test.

Node 22 ships `node:sqlite` built in — verified working on the dev machine, though it still emits an `ExperimentalWarning`, so `better-sqlite3` is the fallback if that matters. Python has `sqlite3` in the standard library. Zero required dependencies on either side is a genuinely unusual property for a cross-language artefact.

Contents:

| | |
|---|---|
| `manifest` | seed, engine version, tier, active conflicts, operator manifests, **content hash** |
| L1 tables | sites, quays, lines, patterns, journeys, calendars, demand |
| `resolution` | `(operator, published_id) → canonical` — private |
| distances | precomputed walking distances as **integer metres** |
| `queries` | the fixed open-loop scored query set |

### A bundle is named by its content, not its bytes

*Found at M2, in CI, on the first run against a different machine.*

**SQLite stamps its own version number into the database header** (offset 96). Two machines with different Python builds therefore produce byte-different files from byte-identical worlds. A CI job asserting `sha256sum` equality of the file fails immediately and says nothing useful.

The invariant that matters is over the **logical rows**, so the bundle carries a `content_hash`: a SHA-256 over a canonical serialisation of every table, in fixed table order, rows sorted by primary key, floats rendered by shortest-round-trip repr. It is verified by `python -m worldbuild --verify`, which rebuilds into a temporary file and compares hashes.

Two consequences worth keeping:

* **The hash names a world independently of its container.** It belongs in the run identity alongside `world_seed`, and a `VACUUM` — which rewrites every page — leaves it unchanged. That is the property being asserted, and there is a test for exactly that.
* **Distances are integers.** See `TECHNICAL-RESEARCH.md` §11: the offline haversine goes through the platform libm, which is not identical across operating systems. Rounding to whole metres removes every libm-produced float from the bundle, leaving only source-literal coordinates and derived integers.

**OPEN:** whether the pre-recorded open-loop trajectory lives in the bundle or is regenerated from the seed. `TECHNICAL-RESEARCH.md` §4 recommended seed-as-canonical with the trajectory as a cache; that still seems right, but bundle size has not been estimated.

---

## 7. Validation (Q34)

The builder emits nothing that has not passed:

1. **Referential integrity** — every published id resolves; every pattern references live quays.
2. **Reachability** — the canonical network is connected for the intended trip set.
3. **Oracle solvability** — RAPTOR over L1 with perfect information serves every scored query. A world it cannot serve is broken, not hard.
4. **Defect audit** — every conflict the manifest declares is *actually present*, detected by inspecting L3 output. This is the one that will catch real bugs: a manifest claiming `staleness_s: 90` against a projection that is in fact fresh produces a world that is easier than it claims, silently, and would corrupt difficulty calibration.
5. **Difficulty calibration** — the three-gap test in `REFERENCE-POLICY.md` §10: P0−P1, P0−P2 and P1−P2 all within the tier's declared bands. Matching conflict lists is not sufficient.

---

## 8. What this closes

**Q32** — three layers. L1 canonical and simulation-native with NeTEx-style `Site`/`Quay` and `Line`/`Pattern`/`Journey`; L2 mutable struct-of-arrays state; L3 per-operator projections as pure functions. **GTFS is a projection target, not the internal shape.**
**Q33** — declarative manifest, plugin escape hatch for stateful defects, manifest always declares which is in play.
**Q34** — five validation gates, of which the defect audit is the one that protects difficulty calibration.
**Q35** — operator documentation generated from the same schema source as behaviour, so divergence between them is deliberate.

**Open:** trajectory in-bundle vs regenerated (§6); whether `latency: sim` should be promoted from optional to required, given §4's finding that a catalogue D defect depends on it.

**Next:** `PLAYER-CONTRACT.md` v0.2 has landed and publishes the snapshot rule as a player-facing guarantee (contract §6.4). L3 is where that rule is actually *enforced* — via the projection signature in §1 — and the operator API implementation is the first code that could violate it.
