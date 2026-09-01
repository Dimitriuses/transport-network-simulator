# Known issues

Defects and gaps we know about and have not fixed. Kept because an unrecorded known problem is indistinguishable from an unknown one, and because several of these are things a player would otherwise report as bugs.

**Statuses:** `open` — will be fixed, owner named. `deferred` — will be fixed, but not yet, and the milestone that owns it is named. `by design` — understood, not a defect, recorded so nobody re-discovers it. `wontfix` — decided against.

Design questions that have never been settled live as **OPEN** markers inside the specification that owns them, not here. This file is for things that are *wrong*, not things that are *undecided*.

---

## 1. `replan` is specified but never issued — `open`

`PLAYER-CONTRACT.md` §5.5 defines a `replan` obligation in full: triggers, positions, response statuses. The harness never sends one. A traveller whose plan collapses mid-journey is simply not asked.

**Why it matters more than it looks.** It is why `blind` and `naive` score identically on Service (−0.023 each): realtime knowledge cannot affect a journey once it has begun, so polling can only ever improve the Information family. Half of what a live integration layer is *for* — noticing trouble and rerouting somebody around it — is currently unmeasurable.

**Owner:** Phase 2, with closed loop, where a traveller reacting to an answer is the point. Worth pulling earlier if the Service family starts looking insensitive to anything but planning quality.

---

## 2. Fourteen of fifteen conflicts cost a solver nothing measurable — `open`

Ablation at P0M6 attributes the entire conflict-caused shortfall to `C-coordinate-offset`. The rest are declared, verified present by the defect audit, and individually worth nothing.

This is the most important open item in the project. It is not a code defect — every conflict does what its manifest says — but it means the catalogue in `CORECONCEPT.md` §2.1 is currently one conflict deep, and a generator built on it would mostly generate ornaments.

**Owner:** P1M0 (measure which can be made to bite) and P1M1 (make them, or retire them).

---

## 3. Gate 1 has no external evidence — `open`

The competent solution used to measure Gate 1 was written by someone who had already seen the world, the conflicts and the scoring. It establishes that the world is *solvable*. It says nothing about whether it is *discoverable*, how steep the first hour is, or whether solving it is interesting.

No internal work can close this. The gate output says so in its own text so the caveat travels with the number.

**Owner:** P1M0, part A.

---

## 4. Gap estimates are noisy at this world size — `open`

22 scored queries means each is about 4.5 % of the score, and a single traveller changing outcome moves a gap noticeably. Fine for detecting the large effects Phase 0 was looking for; not fine for P1M5's claim that two generated worlds match "within tolerance".

**Owner:** P1M3, which must generate a query set large enough for the gaps to be stable across seeds.

---

## 5. The coordinate offset is not fully recoverable — `by design`

`estimateOffset` recovers ~223 m for a 130 m displacement. It is not a bug in the estimator, and a better estimator will not fix it: the displacement and the genuine ~80 m separation between neighbouring quays are the same order of magnitude, and proximity cannot decompose them.

This is a true property of the problem and arguably the most interesting single thing in the world. The engineering response — implemented in the competent solution — is to stop trusting the corrected geometry and put a floor under transfer times.

Recorded here because it looks exactly like a bug in the estimator until you work out why it is not.

---

## 6. Ablation reports a negative cost for `A-coordinate-precision` — `by design`

Leave-one-in ablation scores it at −0.34 min: adding coordinate truncation *on its own* helps a lazy integrator, because truncation partially cancels the systematic offset.

A real interaction, not a measurement error. It is also a useful warning that a difficulty model treating conflicts as independent and additive would be wrong here.

---

## 7. Leave-one-out ablation attributes nothing — `by design`

Removing any single conflict changes the lazy integrator's shortfall by roughly zero, because the defects are jointly sufficient and individually unnecessary: take away the coordinate offset and it still trips over colliding identifiers; take those away and it still misreads timestamps.

`ablate()` therefore uses leave-*one-in*. The shares over-sum, and that overlap is the redundancy itself — worth seeing rather than hiding.

---

## 8. `node:sqlite` prints an experimental warning on every run — `open`

Node 22 ships `node:sqlite` as experimental, so every command that opens a world bundle emits `ExperimentalWarning: SQLite is an experimental feature`. Harmless, and noisy enough that it is routinely filtered out of output — which is exactly the habit that hides a real warning later.

**Fix when convenient:** either `--disable-warning=ExperimentalWarning` on the scripts that load worlds, or `better-sqlite3` if the API stabilises differently. Not urgent, but worth doing before anyone outside the project runs it and wonders.

---

## 9. `verbatim` logging is specified but not implemented — `deferred`

`OBSERVABILITY.md` §7 defines four logging levels. The run log is written at `trace` in practice; `score`, `replay` and `verbatim` are not selectable, and the 250 MB cap decided at P0M6 has nothing to enforce.

**Owner:** Phase 2, alongside closed-loop replay, which is the first thing that genuinely needs `replay`.

---

## 10. Trace disclosure levels are decided but not implemented — `deferred`

`OBSERVABILITY.md` §8 settles on three levels — `full`, `attributed`, `outcome` — with `attributed` as the default. Nothing reads that setting; the scorecard currently reports full attribution to whoever runs it.

Harmless while the only players are ours. It becomes real the first time a world is used for assessment, because full attribution is close to an answer key.

**Owner:** Phase 4, with assessment mode. Pull earlier if anyone uses a world to evaluate a person.

---

## 11. Operator API documentation is not generated — `open`

`PLAYER-CONTRACT.md` §6.1 has every operator advertise a `docs_url`, and `DATA-MODEL.md` §5 specifies that operator documentation is generated from the same schema source as behaviour — so that divergence between them is deliberate rather than accidental (catalogue §2.1 F). The brief advertises the URL; nothing serves it.

A player currently has to discover each operator's schema by fetching and reading. That is *harder* than intended and hard in the wrong way — endpoint archaeology rather than reconciliation.

**Owner:** P1M2, which is where generated projections and their documentation should arrive together.
