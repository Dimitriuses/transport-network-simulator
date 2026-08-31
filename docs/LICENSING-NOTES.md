# Licensing Notes

Closes `CORECONCEPT.md` §9.7 Q40.

**Not legal advice.** This records the reasoning behind a decision so it can be revisited, and flags where the reasoning is uncertain.

---

## Decision

**MIT for the software and documentation.** `LICENSE` at the repository root.

MIT is right for this project: the agent-benchmark and assessment positioning both depend on other people running the thing without friction, and a permissive licence removes every question about whether a player's own solution is affected by ours. It is not.

### Scope of the MIT licence

The MIT licence covers **the software and documentation in this repository** — everything under `src/`, `tools/`, `docs/`, `benchmarks/` and `contract/`.

**World bundles under `worlds/` are data, not software**, and may carry their own terms. Bundles built from OpenStreetMap extracts would be subject to ODbL — see below.

**No world bundle in this repository currently contains OpenStreetMap-derived data.** Phase 0 uses a hand-authored city, and OSM extracts are gitignored.

> `LICENSE` itself deliberately contains **nothing but the canonical MIT text**. GitHub's licence detector (`licensee`) matches against known licence texts, and appended notes can push the match below its confidence threshold — at which point the repository displays no licence at all. Scope notes belong here and in the README, never in `LICENSE`.

---

## The OpenStreetMap question

The initial reading was that anything we build from OSM counts as a **Produced Work** under ODbL, and can therefore be licensed freely. **That is right for the code and probably wrong for the world bundle**, and the distinction matters enough to write down.

### What ODbL actually distinguishes

ODbL separates:

* **Derivative Database** — you adapted, modified, enhanced, corrected or extended the data. Share-alike applies: if you distribute it, it goes out under ODbL.
* **Produced Work** — a work *created from* the database rather than being a database. A rendered map image is the canonical example. You may licence a Produced Work however you like, subject to attribution.

The line is *whether the output is itself a database*. A picture of a map is a Produced Work. A queryable store of coordinates and geometry is a Derivative Database.

### Where that leaves us

**The code is unambiguously fine.** ODbL is a database licence; it does not reach the software that processes the data. MIT applies to everything in `src/` and `tools/` regardless of what data ever passes through them. OSMF guidance is explicit that share-alike may be satisfied by publishing the derived database *or* the method used to produce it — the code is never itself encumbered.

**The world bundle is the exposed artefact.** `DATA-MODEL.md` §6 specifies a world bundle as a SQLite database containing quays with coordinates, geometry and precomputed distance matrices. If those are derived from an OSM extract, that bundle is a *database* containing a substantial part of OSM content in structured, queryable form. Calling it a Produced Work would be a stretch — it is much closer to the Derivative Database side of the line than to the rendered-map side.

Consequence, if we ever ship such a bundle: it would need to be distributed under ODbL, with attribution. **This would not affect the MIT licence on the code, and would not affect players' own solutions.** The blast radius is one directory.

### The clean way out, which we get for free

The project's own staging already avoids the problem:

* **Phase 0** — hand-authored city. No OSM data at all.
* **Phase 1–4** — OSM import is a *development convenience* for testing against realistic topology.
* **Phase 5** — procedural generation. No OSM data again.

So OSM is never a shipped dependency, only a middle-stage tool. **If no committed world bundle contains OSM-derived geometry, ODbL never binds anything in this repository.**

### The one recommendation that changes

`TECHNICAL-RESEARCH.md` §8 recommends committing a pre-downloaded OSM extract as a build artefact, for determinism and to avoid Overpass rate limits. That reasoning is still sound *technically*, but it is precisely the thing that would create an obligation.

Options, in order of preference:

1. **Keep OSM out of `worlds/`.** Use extracts locally, in a gitignored directory, and commit only hand-authored or procedurally generated bundles. Costs nothing at Phase 0, which is hand-authored anyway.
2. **Commit the extract but dual-license the directory** — `worlds/` under ODbL with attribution, everything else MIT. Legitimate and common, but it means every world bundle carries share-alike, which complicates the assessment use case where worlds may want to be private.
3. Ship a build script that fetches the extract rather than the extract itself. Reintroduces the network dependency §8 wanted to remove, though only at world-build time, never at run time.

**Recommendation: option 1**, revisited if Phase 1 finds that real-city topology is genuinely necessary rather than convenient.

---

## Attribution

If any distributed artefact ever contains OSM-derived data, ODbL requires attribution that makes users aware the content came from OpenStreetMap and is available under ODbL. The conventional form is "© OpenStreetMap contributors". This would belong in the world bundle's manifest and in the run brief, not only in a README.

Not currently applicable.

---

## Open

* Whether generated world bundles distributed for assessment need any licence statement at all, given they contain no third-party data. Probably not, but worth settling before Phase 4 distributes anything.
* Whether the specifications in `docs/` should carry a documentation licence (CC BY) separate from MIT. MIT covers them adequately; a separate licence would only matter if the specs were expected to be reused independently of the code.
