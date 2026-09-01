"""CLI.

    python -m worldbuild [out_path]     build the world bundle
    python -m worldbuild --verify       rebuild and check the content is unchanged

`--verify` is what CI runs. It deliberately compares *content*, not file bytes:
SQLite stamps its own version into the database header, so two machines with
different Python builds produce byte-different files from identical worlds.
"""

from __future__ import annotations

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

    out = Path(args[0]) if args else DEFAULT_OUT
    path = build(out)
    print(f"built {path}  content {content_hash_of(str(path))[:16]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
