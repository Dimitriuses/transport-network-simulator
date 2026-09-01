# contract/

**Generated files. Do not edit by hand.**

OpenAPI 3.1 documents for the two interfaces that are stable across every world:

| File | Interface |
|---|---|
| `player-api.yaml` | endpoints the **simulator calls on the player** — `PLAYER-CONTRACT.md` §5 |
| `control-api.yaml` | endpoints the **player calls on the simulator** — `PLAYER-CONTRACT.md` §6 |

Generated from the Zod definitions in [`src/schema`](../src/schema):

```
npm run contract:generate    # write
npm run contract:check       # verify, non-zero exit on drift
```

CI runs the check, so these files are always browsable *and* always true.

## Why these are committed and operator documents are not

These two are one-per-contract-version and identical for every world, so players and agents need a stable URL to point at.

**Operator API documents are deliberately absent.** They vary per world with the projection manifest, and at higher tiers they are *deliberately imperfect* — documentation that disagrees with behaviour is catalogue §2.1 F, not a defect in our tooling. There is no single correct version to commit. They are emitted into the world bundle and served at each operator's `docs_url` (`PLAYER-CONTRACT.md` §6.1).

## Coverage

M0 defines only `/identity` and `/health` — the smallest fully-specified shapes in the contract, enough to prove the schema → JSON Schema → OpenAPI pipeline end to end. The remaining endpoints arrive with the milestones that need them.
