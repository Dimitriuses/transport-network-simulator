"""CLI.

    python -m worldbuild [out_path]     build the world bundle
    python -m worldbuild [out] --tier N  generate the projection manifests
    python -m worldbuild [out] --network generate the city as well
    python -m worldbuild [out] --seed N   which world to generate
    python -m worldbuild --verify       rebuild and check the content is unchanged

`--verify` is what CI runs. It deliberately compares *content*, not file bytes:
SQLite stamps its own version into the database header, so two machines with
different Python builds produce byte-different files from identical worlds.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

from .build import build
from .content_hash import content_hash_of

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "worlds" / "m1.world.db"


def verify(committed: Path) -> int:
    if not committed.exists():
        print(f"no world bundle at {committed}", file=sys.stderr)
        return 1

    before = content_hash_of(str(committed))

    with tempfile.TemporaryDirectory() as tmp:
        rebuilt = build(Path(tmp) / "rebuilt.world.db")
        after = content_hash_of(str(rebuilt))

    if before == after:
        print(f"content hash matches: {before[:16]}")
        return 0

    print("WORLD BUNDLE IS NOT REPRODUCIBLE", file=sys.stderr)
    print(f"  committed : {before}", file=sys.stderr)
    print(f"  rebuilt   : {after}", file=sys.stderr)
    print("", file=sys.stderr)
    print("  The builder produced different content from the same source.", file=sys.stderr)
    print("  Every score in this project is addressed by seed x engine_version,", file=sys.stderr)
    print("  so a world that does not rebuild identically makes runs", file=sys.stderr)
    print("  incomparable across machines. See DATA-MODEL.md §6.", file=sys.stderr)
    return 1


def main() -> int:
    args = sys.argv[1:]
    if args and args[0] == "--verify":
        return verify(Path(args[1]) if len(args) > 1 else DEFAULT_OUT)

    # `--tier N` generates the per-operator manifests instead of using the
    # hand-authored ones (ROADMAP.md P1M1). Absent, the committed world is
    # built exactly as Phase 0 measured it.
    tier: int | None = None
    if "--tier" in args:
        i = args.index("--tier")
        tier = int(args[i + 1])
        args = args[:i] + args[i + 2 :]

    # `--network` generates the city itself — sites, quays, lines and the
    # candidate query set (ROADMAP.md P1M2). Independent of `--tier`, which
    # generates what the operators *say* about it.
    generate_network = "--network" in args
    if generate_network:
        args = [a for a in args if a != "--network"]

    # `--scored <file>` narrows a generated world's candidate pool to the
    # journeys integration can actually improve. The classification comes from
    # `npm run headroom --json`, which needs the router — see
    # `scripts/generate-world.mjs`, which drives both phases.
    scored_ids: frozenset[str] | None = None
    if "--scored" in args:
        i = args.index("--scored")
        scored_ids = frozenset(json.loads(Path(args[i + 1]).read_text(encoding="utf-8")))
        args = args[:i] + args[i + 2 :]

    # `--seed N` picks the world. The generator needs it; the hand-authored
    # city ignores everything but the disruption draw.
    seed = 481516
    if "--seed" in args:
        i = args.index("--seed")
        seed = int(args[i + 1])
        args = args[:i] + args[i + 2 :]

    # An unrecognised flag is a mistake, not a filename. Silently treating
    # `--out foo` as "build a world called --out" is how this milestone spent a
    # rebuild writing to the wrong path and auditing the stale bundle; the same
    # silent default cost `refplayer/serve.ts` a whole measurement in Phase 0.
    unknown = [a for a in args if a.startswith("-")]
    if unknown:
        print(f"unknown option: {unknown[0]}", file=sys.stderr)
        print(
            "usage: python -m worldbuild [out_path] [--tier N] [--network] [--seed N] | --verify",
            file=sys.stderr,
        )
        return 2
    if len(args) > 1:
        print(f"expected at most one output path, got {len(args)}", file=sys.stderr)
        return 2

    out = Path(args[0]) if args else DEFAULT_OUT
    path = build(
        out,
        seed=seed,
        tier=tier,
        generate_network=generate_network,
        scored_ids=scored_ids,
    )
    print(f"built {path}  content {content_hash_of(str(path))[:16]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
