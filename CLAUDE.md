# CLAUDE.md

Guidance for Claude Code and for anyone else working in this repository.

## What this is

A simulation game about integration engineering. A generated city, several independent transport operators whose data disagrees in deliberate and specific ways, and a player who must unify them. See [`README.md`](README.md).

**Current state: Phase 0 complete. Phase 1 reopened on 2026-09-08; Phase 2 paused behind it.**

P0M0–P0M6 delivered one hand-built Tier-2 world and were recorded as passing all three gates. P1M0 found that result had been measured with a blind instrument, Phase 0 was reopened, and P0M7–P0M10 rebuilt the instruments, the world and the references. `npm run gates` reports **all gates pass**: 1a solvable, 1b not trivial, 1c PASS *by decision*, 2 discriminating, 3 at **35 % of headroom** against a ratified 20 % bar — 36 % until P2M0, where closing `#40`'s walk-chaining gap raised headroom from 8.37m to 8.48m and so shrank the conflicts' share of it. Re-measured at P1M2, when `KNOWN-ISSUES.md` #19 was fixed in the world itself — both staleness settings had been below the shortest announcement lead and so concealed nothing, leaving catalogue D decorative.

**Two things that PASS does not say.** Gate 1c is scope rather than evidence — nothing is known about whether a stranger can discover this world's conflicts (`docs/KNOWN-ISSUES.md` #3), and the playtest is still owed. And the competent reference solution is a **regression detector, not a gate instrument**: it was written by people who had seen the world.

**Phase 1 closed on 2026-09-07** — worlds are generated rather than authored, and two calibrated worlds of one tier match on every reference while a solution memorised from either collapses on the other. `docs/BUILD-LOG.md` carries the record under *Phase 1 — closed*, including the milestone plans the roadmap used to hold.

**Phase 1 reopened on 2026-09-08** (`KNOWN-ISSUES.md` #48). **A tier declares which conflicts a world holds and nothing else** — every generated world at every tier is the same 59 sites, 60 quays, 13 lines and the same three operators under the same hard-coded names, because `NetworkSpec()` is constructed with its defaults everywhere outside the tests. That is the root of `#43`, `#47` and `#48` alike, and it is why a memorised answer key always resolves.

**The ladder is one ordered list, and a tier is an index into it** (`src/schema/src/ladder.ts`, P1M5). Sections, quota, cosmetic-only, density and the clearance bar are views over that list on both sides of the language seam — `contract/catalogue.json` emits the rungs, not the tables. **Inserting a rung is one entry**, and a test inserts one to prove it. **Quote a rung's id, never its number:** the numbering is expected to move, every bundle records `rung_id` and `ladder_version` beside the tier, and a result recorded against "tier 4" is uninterpretable once tier 4 has become tier 6 — `KNOWN-ISSUES.md` #20's mistake, already made twice here with thresholds.

**The gates ask only the rungs that carry conflict, and Gate 3 states its precondition** (`KNOWN-ISSUES.md` #52, #53). A texture-only rung has no semantic conflict, so a lazy integrator doing well there is the rung working and 1b and 3 report `n/a`. And **Gate 3 is decidable only while the lazy integrator is still integrating**: past half the scored set falling back to `P1` it has stopped, the honest-values run it is compared against has not, and the two no longer share an opportunity set. Holding the entity set fixed is not enough when what changed is the player's ability to use it.

**The −108 % that guard was written for did not exist** (`#53`, withdrawn; `#55`). The honest-values world it subtracted still carried `B-dst-offset` on three operators, so "conflicts off" meant "most of the damage still on". Corrected, the same world reads **+476 %**. The story recorded for the negative sign — *honest data gives a lazy reader more rope, it over-reaches and reality takes the plan apart* — was coherent, consistent with `#14`, and an explanation of an artefact. **A surprising number that a good story makes unsurprising is where to check the instrument**, and two instruments disagreeing in sign about one world is a defect until proven otherwise, not a finding about the world.

**A tier that is easier than the tier below it is not a rung** (`#51`). `region` measured 0.075 easier than `towns-and-rail`, so the ladder ends at four rungs and what the top one was *for* — a region rather than a city — became a shape: `polycentric-rail`, `polycentric-bus`, `polycentric-mixed`. The last is two ways between the same two towns run by two operators, which is this whole game at the scale of a region.

**The gates were ratified against one world and are now asked of several** (`KNOWN-ISSUES.md` #52, #53). **The P1M8 sweep is withdrawn**: every rung from `metro-city` upwards was measured against a floor that still carried four conflicts, and the sweep is owed again on the merged ladder. What survives is the bottom of it — a texture-only rung let a lazy integrator capture 0.796, which is what such a rung is *for*.

**And a wall passes every gate** (`#56`, open). Re-gated with the floor corrected, `towns-and-rail` passes 1a, 1b, 2 and 3 while `competent` — our own answer key — captures 0.099 against the 0.277 bar `npm run clearance` computes for that rung. Gate 3 asks the conflicts to cost *at least* 20 % of the headroom and asks for at most nothing; these cost 476 %. The realism ceiling is per setting and holds — `B-dst-offset` at ±3600 s is something real agencies really do — but **three operators doing it at once, one of them backwards, is a world a lazy reader cannot plan in at all.** Composed *measurable* consequence has no ceiling the way composed *plausible* consequence does.

**A rung carries its city, and its operators are generated** (P1M6). `LADDER` declares arms, sites per arm, hub quays, chords, regional and metro lines, the operator roster by *role*, and the reach cap — which scales with the roster, because two operators cannot both be under a half. Worlds run from 32 sites and 2 operators at `small-town` to about 105 sites and 5 at `towns-and-rail`. **The ids are generated from the world's seed**, so two worlds of a rung share none of them, and `tuned` drops a feed its key has no entry for rather than falling back to inference.

**A metro is an operator kind, not a bus company with a different name**: its own alignment, stations 90 m from the kerb in their own Sites, **two platforms each**, a train every four minutes. The platforms are what make `A-granularity` worth declaring — a station and the platform a train leaves from are different things.

**A world is a `(tier, shape)` pair** (P1M7). `npm run world:generate -- <out> --tier 4 --shape polycentric-rail` builds a region: three towns, each with its own bus company and tram, joined by a railway every forty minutes whose station sits in its own Site beside each town's hub. **The shape is not a rung field** — `src/schema/src/shape.ts` says why — and every bundle records it beside `tier` and `rung_id`.

**The invariants are about the world, not a part of it.** `max_reach_share` checked while each town was still being built refused every region: a town of two operators has one serving 58 % of *that town*, and 19 % of the region. `check_reach` runs once, on the finished thing.

**The ladder gains a second dimension**: scale is the ordered axis and is the tier; **shape** — single-centre against polycentric — is declared and unordered, because they are different problems rather than different amounts of one. `P1M5`–`P1M8` in [`ROADMAP.md`](ROADMAP.md), and `P1M5` first makes the ladder *data* so that renumbering it later is one entry rather than six tables.

**Phase 2 pauses behind it** — the closed loop, `realtime`, the monitoring UI and the playtest all build on the ladder, and a playtest run against a world whose tier changes meaning afterwards is spent twice.

**The constraint that shapes all of it:** a conflict must stay realistic. Two operators can disagree about where a stop is; at 500 m apart that is a broken map, not a disagreement, and it teaches something other than integration. Every route to a passing gate that runs through "make the conflict bigger" is closed.

Milestones are numbered `P<phase>M<milestone>`. [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md) records what each completed milestone delivered and, more usefully, what it corrected. [`docs/KNOWN-ISSUES.md`](docs/KNOWN-ISSUES.md) lists defects we know about — check it before reporting one, and add to it rather than leaving a problem undocumented.

**Gate 1 and Gate 3 were both restructured on 2026-09-03**, and for the same reason: *a gate measured by running a solution we wrote is a gate about that solution.* Gate 1 splits into solvable / not-trivial / discoverable, of which only the first two are gates; the competent reference solution is a **regression detector, not a gate instrument**. Gate 3 measures `P2rt` on journey time against headroom — the ratified metric — because `P2rt` is specified in `REFERENCE-POLICY.md` while the naive player is an implementation that could change and take the gate with it. See `docs/PHASES.md`.

**The lesson worth carrying into Phase 1** is `docs/KNOWN-ISSUES.md` #26, now fixed: a scored journey must be able to *reward* integration. Where the restricted and unrestricted transfer graphs agree there is nothing to win, and every extra leg a player takes is exposure to a cancellation nobody announced. P0M9's generated query set was 88 % such journeys and the competent solution scored below the naive one because of it. `npm run headroom` selects for this; **a generator must do the same, and must not "fix" it by lowering the cancellation rate**, which would delete the point of realtime integration.

**Conflict strengths have enforced ceilings.** Each catalogue setting in `SWEEPS` carries the strongest value two real operators could differ by and the cause that produces it — a coordinate offset past ~150 m is a broken map rather than a disagreement. Tests enforce it. Every failing-gate pressure in this project has pointed at "make the conflict bigger"; that route is closed deliberately.

**And ceilings are per setting, which P1M1 found is not sufficient.** The generator drew three geometry conflicts for one operator, each inside its ceiling, and published stops 2,200 km from their quays — declaring three geometry conflicts and containing one, because nothing subtler survives underneath a lat/lon swap. **Realism and measurability are properties of the combination.** The catalogue now carries an `excludes` relation, and `npm run realism` measures the composed consequence on the world itself, which is the only defence that works against combinations nobody anticipated.

**The catalogue is one source of truth for three consumers** — `src/schema/src/catalogue.ts`, emitted to `contract/catalogue.json` (CI drift-checked) and read by `tools/worldbuild/catalogue.py`. Add a setting there, never in the probe or the builder.

**There was a fourth, and it was not in that list** (`KNOWN-ISSUES.md` #55). The ablation instruments held their own hand-written map of twelve conflicts against the catalogue's sixteen, and switching off a conflict it had never heard of was written `?? out` — *keep the world as it is*. So "a clean world plus one conflict" meant "four conflicts plus one", `npm run fallback` returned seventeen unrelated conflicts on one figure to two decimal places, and a **cosmetic** setting appeared to cost nine minutes. **The tell was an evidence line that stopped changing** — the same tell as P1M1's two dead audit checks. Every table keyed by a catalogue name is now derived from `CATALOGUE`, and `withNoConflicts` **throws** rather than silently keeping a conflict the caller believes is gone: a conflict with no switch of its own must be *named* (`A-id-collision`, which two operators make together), because silence about it was indistinguishable from silence about a stale entry.

**And a comparison's two sides must share a floor as well as an information set.** `fallback.ts` built its rows over the world with the entity set held as declared and its baseline row over `cleanWorld`, whose own doc-comment opens *"Not a valid floor for attribution"*. A constant offset caused by no conflict at all then sat in every row's delta.

`npm run demo` runs the whole loop; `npm run calibrate` reports the three-gap difficulty calibration; `npm run audit` checks every declared conflict is actually present; `npm run world:build` regenerates the world bundle (content-hashed, and CI checks it). `npm run gates` runs the three proof gates; `npm run probe` sweeps each conflict's strength on each operator; `npm run horizon` separates what a lazy integrator loses to conflicts from what it loses to not knowing yet; `npm run stability` recalibrates across seeds and reports the spread.

**`npm run calibrate:tier` selects a world rather than narrowing the generator** (`KNOWN-ISSUES.md` #42). A tier declares a density, the generator samples against it, and what comes out is a *distribution of difficulties rather than a difficulty* — two Tier-3 worlds had `naive` differ by six times their own noise. The search draws several conflict sets over **one fixed city** (the scored query set is selected on the network, so re-drawing conflicts leaves it valid), screens them on the sensitive reference, and ships the draw nearest the median. **The tier's difficulty is then the generator's central tendency, not whichever seed was tried first.**

**It is a build-time search and has nothing to do with "closed loop"**, which in this project means passengers bound to the player's endpoint so a player's advice changes the world (`CORECONCEPT.md` §370, Phase 2, outside the MVP). Scoring is untouched and the MVP stays open loop; the reference solutions appear here as measuring instruments, not as players.

**Screening on one reference is not calibrating to one reference** — `--verify` profiles the winner against all four, and a world selected only for `naive` would be tuned for `naive`, which is #24's trap wearing a new hat.

**Added at P1M4:** `npm run clearance` decides whether a score clears its tier. **A tier's bar is a position between named reference solutions, not a decimal** — "beat a lazy integrator" rather than `0.25` — so it survives a change of denominator, world size, penalty or profile, and it states its intent. That means it needs the references' scores *on that world*, so clearance left `scoreRun` (which is a pure function of one run log) and became an instrument. `npm run leak` runs the information-set audit that a quarantined scorecard tells you to run.

**Also at P1M4 — two solutions that must disagree.** `npm run calibrate:tier` selects a world near the generator's median instead of shipping whichever seed came first (`KNOWN-ISSUES.md` #42), and `npm run transfer` asks whether two worlds ask the same thing without asking it the same way. It needs an answer key: `npm run tune <world.db>` bakes one world's operator displacements and time encodings into `<world>.tuning.json`, and `TNS_PLAYER_MODE=tuned` is `competent` with those two inferences replaced by it. **The point is a solution that should *fail*.** "A solution built for one world performs comparably on the other" is satisfiable by making the worlds nearly identical, so the test runs a generalising solution that should transfer *and* a memorised one that should collapse. Measured on the calibrated tier-3 pair: `competent` 0.441 -> 0.441, `tuned` 0.430 -> -0.665.

**A relaxation whose termination depends on its edge weights must check them.** Two defects (`KNOWN-ISSUES.md` #44, #45): a negative edge from a unit error, and `NaN` arrival times from a deliberately wrong answer key. `NaN` fails every comparison, so the guard that keeps a label set acyclic never fires, and the predecessor walk that reads the answer out never terminates — 21 minutes of CPU and 1.5 GB before it was killed. A time that is not a number is not a time: drop the leg.

**A delay can make a journey faster, and `#40` cost a milestone to establish it.** A held service is one a slightly late traveller catches, so a disrupted day can beat a clean one — measured, 14 of 98 queries on the committed world. The router was accused of non-optimality on that basis for the whole of Phase 1; **cancellations alone never improve a route** (0 of 98, 0 of 200), which is the half that is true and is now asserted. The information-set audit's bound had the same premise and sat above an achievable outcome on 12 of 98 journeys; it now takes every delay and only the cancellations a player could know, which makes it sound and, deliberately, weaker than the `P0` quarantine — **the leak detector is the blind-hit statistic**.

**Added at P1M2:** `npm run fallback` attributes *which conflict* makes the lazy integrator give up, by switching each one on alone over a clean world. A conflict adding a handful of fallbacks is doing its job; one that removes most of the query set has become a wall, and the aggregate calibration cannot tell you which is which. It found `KNOWN-ISSUES.md` #35 immediately.

**Added at P1M1**, and all of them take a world path so they can be pointed at a *generated* bundle: `npm run realism` measures each operator's composed published geometry against the plausibility ceiling; `npm run docs` prints what a player reads at an operator's `docs_url`; `npm run information` scores the four candidate Information formulas side by side against the declared and honest worlds. Generated worlds are built with `python -m worldbuild <path> --tier N`.

**A world carries its own names** (`place_names`, bundle schema 2, P1M3). A name variant is *data about a place*, not a function of its official name: an abbreviation follows by rule, a transliteration does not. Deriving the colloquial form meant a hard-coded lookup of one city's places, which rewrote one name in thirty-three on a generated city (`KNOWN-ISSUES.md` #39). **Colloquial names collide on purpose** — a stop and the tram stop beside it answer to the same word, which is the clue that finds an undeclared interchange and the trap that fuses two genuinely different places.

**A generated world passes all three gates**, re-measured at P1M4 on the current generator — 1a solvable, 1b not trivial at 0.393, 2 discriminating in the right order, 3 at **31 %** of headroom (10.53m reachable of 12.12m). The older figures of 28 % (P1M2) and 22 % (P1M3) were measured before a tier's quota stopped being spent on texture (`KNOWN-ISSUES.md` #43), which raised semantic content at tiers 2–3 by about two conflicts per world. One diagnostic is not clean: the information-set audit flags every solution that plans (`KNOWN-ISSUES.md` #40), which is a bound problem rather than a gate.

**A `generate` list is either a ladder or a list of kinds, and the catalogue now says which** (`KNOWN-ISSUES.md` #48). `_pick` skews towards the strongest listed value by `tier / 5` — right for `C-coordinate-offset`'s `[30, 60, 130]`, wrong for `B-time-encoding`'s `epoch_s | epoch_ms | local_naive`, which are three *traps* rather than three severities. Marked `categorical: true`, a setting is drawn **uniformly**: which trap varies, the difficulty does not. **The test is not whether a list can be ordered but whether a harder world should prefer its later entries** — if the ordering ranks how a particular reader fails, it is categorical.

**A conflict can be new in cause and identical in effect.** `B-dst-offset` publishes a correct local time under a wrong zone; `B-time-encoding: local_naive` publishes the same local time with no zone at all. They are different conflicts, distinguishable in the manifest and by the audit, and **they decode identically for any reader that ignores a false claim** — which is what a correct reader does. `excludes` stops one conflict masking another *within* a world; nothing stops two coinciding *across* worlds, and the transfer test is what notices.

**Two settings were added at the strong end at P2M0** — `B-dst-offset` (the local reading is right, the offset it claims is wrong) and `C-cancellation-token` (`CANCELLED`, `C`, `3` — the row is there under another name). Both are answerable, and the answers are the point: check one published fact against another, and read a feed's vocabulary rather than assuming it. **A conflict with no answer makes a world unfair rather than hard**, so a new setting owes `competent` a competence.

**A tier's quota buys difficulty, and texture is drawn outside it.** Cosmetic settings measure exactly zero, so a quota that counts them does not fix composition — which is what `#42`'s quota exists to do. `_in_quota_order` spends each section on its semantic settings first and `_cosmetic_floor` gives every non-reference operator one cosmetic setting for free. **The size of the cosmetic pool therefore cannot affect difficulty**, which is what makes "add more texture" a safe answer to a rung with no variety (`#43`, and `#47` for the two rungs that still rest on a choice of values rather than of settings).

**No operator may cover most of the stops, and none may carry more than half the conflicts** (`KNOWN-ISSUES.md` #38). Reach-weighting with no bound put three quarters of the conflicts on the operator carrying two thirds of the network; its feed stopped being usable, and since it carried most of the city a player who ignored it outscored one who tried — `null` beat `naive` and Gate 3 failed. The roles are a division of labour: one operator runs the radials from the centre outwards, **another runs the ring and the chords that connect the ends without passing through the centre**, and a third is regional. Giving the ring to the radial operator is what caused it.

**Every per-world instrument must run against every generated world**, not as a release check. The audit, the realism check, the identifiability audit and the symptom check each caught something on a generated world that nobody had thought to look for — see `KNOWN-ISSUES.md` #28–#33.

**A test that cannot fail is not a test, and the tell is an evidence line whose value never changes.** Both of P1M1's audit defects had that shape: `C-coordinate-offset` compared a stop with an unrelated quay, and `D-staleness` passed on a condition that is true whenever staleness is non-zero, printing `hides 0 disruption(s)` on a world where it hid nothing *and* on one where it hid a third of them. Neither was caught by asserting the audit passes, because both did. When you add a check, construct the case it should reject and require a different answer.

**The audit has three verdicts.** `ok`, `MISS`, and `INRT` — present in the data and incapable of changing any outcome. Absent and inert are different problems needing different fixes, and inert does not fail the audit: it means two of the world's parameters do not fit together, not that a projection misbehaved.

**Two numbers that decide something together must live in one place.** `noticeLeadS` and `D-staleness` sat in different packages, and their relationship decided whether catalogue D existed at all — it did not, for the whole of Phase 0 (`KNOWN-ISSUES.md` #19). The disruption policy is now in `@tns/schema` and ships in `contract/catalogue.json`. Before adding a threshold, ask what else it is implicitly compared against.

**The committed world is 38 sites, 50 quays, 10 lines and 98 scored journeys, and the instruments take minutes.** `npm run probe` is the slowest — several hundred calibrations.

**A whole city can be generated too, since P1M2**: `npm run world:generate -- worlds/scratch/x.world.db --tier 3 --seed N`. It builds twice on purpose — once with every candidate journey so the headroom criterion has something to judge, once with the journeys it selected — because **the scored query set is not a by-product** and the criterion needs the router. The selected ids are written beside the bundle as `<name>.scored.json`, which is what makes a generated world reproducible.

**The slow instruments report progress on stderr**, with a bar and an estimate of the time left. Progress never goes to stdout, so redirecting a report keeps it clean and still shows the bar on screen:

```
npm run probe > probe.txt        # bar on screen, report in the file
```

Without a terminal — piped, in CI, or a background job — it prints a plain line every fifteen seconds instead of a carriage-return bar, which is what makes a backgrounded run legible. `TNS_PROGRESS=off` silences it.

**Never quote a single calibration as a world's difficulty.** `npm run probe` and `npm run stability` average over seeds and report the spread; `npm run gates` does not yet. One run is a draw from a distribution, not a measurement of the city.

Measured over six seeds with only the disruptions changing, as of P1M2:

| | hand-built, 98 queries | generated, 200 queries |
|---|---|---|
| P0-P1 headroom | 7.66m, sd 10 % | 10.85m, sd 7 % |
| P0-P2 | 4.99m, sd 15 % | 8.89m, sd 8 % |
| P1-P2 | 2.67m, sd 17 % | 1.96m, sd 11 % |
| conflict cost | 2.97m, sd 19 % | 2.07m, sd 23 % |

**The often-quoted "31 % of its mean and conflict cost 36 %" is superseded.** It was measured at P0M9 on the 132-journey set, 88 % of which could not reward integration at all (`KNOWN-ISSUES.md` #26). Fixing the query set halved the scatter; doubling the traveller count halved it again, which is what P0M9 predicted — resolution scales with the number of travellers.

**When you add a measurement, check both sides of the comparison for matched information — and for a matched opportunity set.** Seven times now this project has credited something with an advantage the world does not owe it: five flattering a player, once flattering the reference, once a skipped leg in a replanned itinerary. `docs/BUILD-LOG.md` lists them. The generalisation that keeps recurring: *a baseline that suddenly beats its reference has been given something, and it is almost always a movement nobody was charged for.*

**And the corollary found at P0M8:** varying data quality also varies how much data there is. A comparison that changes both cannot attribute to either.

Run `npm run check` before proposing changes: lint, typecheck, contract-drift and tests. The Python side is `cd tools && uv run ruff check . && uv run ruff format --check . && uv run pytest`.

**`ruff format --check` is not optional and is easy to forget** — `ruff check` is the linter and passes on code the formatter would rewrite. CI runs both, and a formatting-only failure has broken the build once.

## The specifications are the source of truth

Nine documents in [`docs/`](docs/) describe the system. They are heavily cross-referenced and have been corrected several times as later work invalidated earlier assumptions.

* **Read the relevant spec before writing code that touches its area.** They contain reasoning, not just decisions, and the reasoning is usually why the obvious implementation is wrong.
* **If code and spec disagree, that is a bug in one of them.** Say which, and fix that one. Do not silently make the code match a spec you think is wrong, and do not silently diverge.
* **Each milestone ends by reconciling the specs it touched.** Part of the milestone, not cleanup afterwards.
* Items marked **OPEN** are genuinely undecided. Do not resolve one by implementing a guess — raise it. Things that are *wrong* rather than undecided belong in `docs/KNOWN-ISSUES.md`.

## Hard rules — determinism

The entire project rests on runs being reproducible from a seed. Open-loop scoring, the golden-trajectory test, and cross-machine comparability all depend on it. These are not style preferences, and violating one breaks the project in ways that surface much later as unexplainable score differences.

**In `src/core` and `src/router`, never:**

| Forbidden | Why | Instead |
|---|---|---|
| `async` / `await` / Promises | non-deterministic ordering; I/O in the model | keep the core synchronous; I/O lives at the boundary |
| `Date.now()`, `performance.now()`, `new Date()` | wall clock is not part of the model | the injected virtual clock |
| `Math.random()` | not seedable | the injected seeded PRNG |
| `Math.sin/cos/tan/exp/pow/log/atan2` | V8 changes these across versions; results stop reproducing | precompute offline in Python; `+ - * / sqrt` are IEEE-exact and safe |

All four are enforced by lint. If a rule blocks you, the design is probably wrong — raise it rather than adding an exception.

**Related invariants that lint cannot catch:**

* One seed, threaded explicitly. Never a module-level default RNG.
* Simulated time is a **monotonic integer** count from the world epoch. Local time, offsets, DST and `25:10:00` are *rendering*, and rendering happens exactly once, at the operator API boundary.
* Operator responses are pure functions of `(operator, endpoint, params, τ)` — never of wall time, never of call count. This is the snapshot rule (`PLAYER-CONTRACT.md` §6.4) and a great deal depends on it, including log size.
* Iteration order must never come from a hash container in a way that affects results. Break ties explicitly.
* Never parallelise the simulation core. Parallelise across seeds instead.

## Language split

**TypeScript at runtime** — simulation core, router, projections, servers, scoring. Chosen for the type system, not for speed: this project's content is schemas and their mutations.

**Python offline** — OSM extraction, world building, validation, scoring analysis. Its numeric and geospatial ecosystem is far stronger.

The seam is world building, which emits a SQLite bundle. `src/schema` is the source of truth for both sides: Zod definitions generate TypeScript types, JSON Schema, OpenAPI documents and validators, and Python consumes the generated JSON Schema.

## Conventions

* **Erasable TypeScript syntax only.** No `enum`, `namespace`, parameter properties or decorators — they break `node file.ts` direct execution. Use `const` declarations plus union types. Enforced by `erasableSyntaxOnly`.
* **Struct-of-arrays over TypedArrays in the hot path** — the event queue and per-entity state, not everywhere. Measured at roughly 3× objects, and it degrades far more gracefully under load ([`benchmarks/`](benchmarks/)).
* Dependency direction: `src/core` may depend on `src/schema`; never the reverse.
* `node:test` and `node:sqlite` are built in — prefer them to adding dependencies.
* British spelling in prose, to match the specifications.

## Vocabulary

Full terminology in [`docs/GLOSSARY.md`](docs/GLOSSARY.md). The essentials:

Two words are easy to confuse:

* **Tier** — how hard a *world* is for the player (0–5, `CORECONCEPT.md` §7). Appears in the run brief.
* **Phase** — how far the *project* has been built (0–5, `docs/PHASES.md`). Phase 0 delivers a Tier-2 world.

Others worth knowing before reading code:

* **P0 / P1 / P2** — the oracle (perfect information), the reference policy (how travellers behave with no integration layer), and a lazy-integration baseline. `REFERENCE-POLICY.md` §2.
* **Capture** — the score. `(P1 − player) / (P1 − P0a)` since 2026-09-04. 1.0 means as well as anyone could have done *knowing what could be known*; 0.0 is no better than no integration at all; negative is actively harmful. **Above 1.0 is legitimate** — `P0a` is a strategy, not a bound — and triggers `captureVsOracle` against clairvoyant `P0`, where above 1.0 *is* impossible and quarantines the run. Scores recorded before that date used `P0` and are not comparable. `SCORING.md` §2.
* **L1 / L2 / L3** — canonical world (immutable), simulation state (mutable), operator projections (derived). `DATA-MODEL.md`.
* **Site / Quay** — a station complex, and a specific boarding point within it. Operators publish at different granularities, and that mismatch is a core challenge rather than an inconvenience.
* **Obligation** — something the simulator asks the player: `plan`, `replan`, `tick`.
* **τ** — simulated time.

## Working style here

* Prefer raising a design concern over implementing around it. This project has repeatedly found that the obvious implementation breaks something three documents away.
* When something surprises you in a spec, it is usually deliberate and usually explained a paragraph later.
* Measure before optimising, and put the measurement in [`benchmarks/`](benchmarks/) with a note on what decision it informed.
