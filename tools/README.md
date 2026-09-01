# tools/

The **offline** half of the project. Python, because its numeric and geospatial ecosystem is far stronger than anything on the runtime side (`TECHNICAL-RESEARCH.md` §11).

| Package | Does |
|---|---|
| `worldbuild/` | city → L1 canonical world → SQLite world bundle |
| `validate/` | the five world-validation gates (`DATA-MODEL.md` §7) |
| `analysis/` | difficulty calibration, scoring analysis |

## The seam

World building is the boundary between the two languages, and it is clean because it emits a **data artefact**: a SQLite world bundle addressed by `seed × engine_version`.

`src/schema` is the source of truth for both sides. It emits JSON Schema, which these packages consume and validate against **on write**; the TypeScript runtime validates the same bundle **on read**. Belt and braces at the one place two languages meet.

## Working here

```
uv sync                  # install, including dev group
uv run pytest            # tests
uv run ruff check .      # lint
uv run ruff format .     # format
```

## What does *not* belong here

Anything that runs during a simulation. The determinism rules in `CLAUDE.md` apply to the runtime core, and the seam exists precisely so that the messy, dependency-heavy, floating-point-approximate work happens once, offline, and is frozen into a bundle.

Geodesic distances are the clearest example: `TECHNICAL-RESEARCH.md` §11 forbids transcendental functions in the runtime core because V8 changes them across versions. Haversine is this side's job, computed once and shipped as a binary matrix.
