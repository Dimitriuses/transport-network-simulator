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

**Every endpoint of both APIs, since P2M7** — `/identity`, `/health`, `/plan`, `/replan`, `/tick`, `/run-start` and `/run-end` on the player; `/brief`, `/clock` and `/notify` on the control API. Until then these files described only the first two (`KNOWN-ISSUES.md` #74).

**What the simulator does, not what it one day will.** A field the contract specifies and the simulator does not honour yet is left out of the schema and listed in each document's description instead (`KNOWN-ISSUES.md` #72).

**Resolvable, and tested so.** `src/schema/test/openapi.test.ts` follows every `$ref` from the document root. `contract:check` cannot: it compares these files with the generator's output, and the generator's output was unresolvable from P0M0 until P2M7.

The same documents are rendered as pages by `npm run portal`.
