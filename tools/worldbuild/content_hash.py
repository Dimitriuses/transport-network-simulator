"""Canonical content hash of a world bundle.

Why this exists, and why hashing the file does not work:

  * **SQLite stamps its own version number into the database header** (offset
    96). Two runs on different Python builds produce byte-different files from
    byte-identical content. CI found this immediately: Python 3.13 locally,
    3.12 on the runner.
  * What the project actually needs to guarantee is that *the world* is
    reproducible, not that two SQLite libraries agree on a container format.

So the invariant is stated over the logical rows instead. This hash is what CI
compares, what goes into the run identity, and what a player-facing brief could
quote to name a world unambiguously (DATA-MODEL.md §6).
"""

from __future__ import annotations

import hashlib
import sqlite3

# Fixed order. Adding a table means adding it here, deliberately — a table that
# is not hashed is a table whose reproducibility nobody is checking.
TABLES: tuple[tuple[str, str], ...] = (
    ("manifest", "key"),
    ("sites", "id"),
    ("quays", "id"),
    ("lines", "id"),
    ("patterns", "id"),
    ("pattern_stops", "pattern_id, seq"),
    ("journeys", "id"),
    ("quay_distances", "from_quay, to_quay"),
    ("queries", "id"),
    ("query_access", "query_id, endpoint, quay_id"),
)

# The hash cannot cover itself.
EXCLUDED_MANIFEST_KEYS = frozenset({"content_hash"})


def _cell(value: object) -> str:
    if value is None:
        return "\\N"
    if isinstance(value, float):
        # repr() is the shortest round-tripping form and is a deterministic
        # function of the double, so it is identical on every platform for the
        # same value. Coordinates reach here; they are source literals, and
        # every derived distance is an integer by construction.
        return repr(value)
    return str(value)


def canonical_rows(db: sqlite3.Connection) -> list[str]:
    out: list[str] = []
    for table, order in TABLES:
        cols = [r[1] for r in db.execute(f"PRAGMA table_info({table})")]
        out.append(f"# {table}: {','.join(cols)}")
        for row in db.execute(f"SELECT * FROM {table} ORDER BY {order}"):
            if table == "manifest" and row[0] in EXCLUDED_MANIFEST_KEYS:
                continue
            out.append("\t".join(_cell(v) for v in row))
    return out


def content_hash(db: sqlite3.Connection) -> str:
    h = hashlib.sha256()
    for line in canonical_rows(db):
        h.update(line.encode("utf-8"))
        h.update(b"\n")
    return h.hexdigest()


def content_hash_of(path: str) -> str:
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        return content_hash(db)
    finally:
        db.close()
