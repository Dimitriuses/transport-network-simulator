"""CLI: python -m worldbuild [out_path]"""

from __future__ import annotations

import sys
from pathlib import Path

from .build import build

DEFAULT_OUT = Path(__file__).resolve().parents[2] / "worlds" / "m1.world.db"


def main() -> int:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    path = build(out)
    print(f"built {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
