"""The world bundle must rebuild to identical content.

Every score in this project is addressed by seed x engine_version, so a world
that does not rebuild identically makes runs incomparable across machines.

Note what is *not* asserted: byte-equality of the file. SQLite stamps its own
version number into the database header, so two machines with different Python
builds produce byte-different files from identical worlds. CI discovered this
the hard way. The invariant is over content.
"""

from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from worldbuild.build import build
from worldbuild.content_hash import content_hash_of


def test_two_builds_have_identical_content() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        a = build(Path(tmp) / "a.db")
        b = build(Path(tmp) / "b.db")
        assert content_hash_of(str(a)) == content_hash_of(str(b))


def test_content_hash_ignores_the_sqlite_container() -> None:
    """A VACUUM rewrites the whole file without changing a single row."""
    with tempfile.TemporaryDirectory() as tmp:
        path = build(Path(tmp) / "w.db")
        before = content_hash_of(str(path))

        db = sqlite3.connect(path)
        db.execute("VACUUM")
        db.close()

        assert content_hash_of(str(path)) == before


def test_derived_distances_are_integers() -> None:
    """Floats from the platform libm must not reach the bundle.

    haversine_m goes through the platform's math library, which differs
    between operating systems in the last ULP -- the same hazard
    TECHNICAL-RESEARCH.md section 11 documents for V8. Rounding to whole metres
    puts nine orders of magnitude between that noise and the stored value.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = build(Path(tmp) / "w.db")
        db = sqlite3.connect(path)
        try:
            for table in ("quay_distances", "query_access"):
                for (value,) in db.execute(f"SELECT metres FROM {table}"):
                    assert isinstance(value, int), f"{table}.metres is {type(value)}"
        finally:
            db.close()
