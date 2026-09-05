"""The world bundle must rebuild to identical content.

Every score in this project is addressed by seed x engine_version, so a world
that does not rebuild identically makes runs incomparable across machines.

Note what is *not* asserted: byte-equality of the file. SQLite stamps its own
version number into the database header, so two machines with different Python
builds produce byte-different files from identical worlds. CI discovered this
the hard way. The invariant is over content.
"""

from __future__ import annotations

import json
import sqlite3
import tempfile
from pathlib import Path

from worldbuild.build import build
from worldbuild.content_hash import TABLES, content_hash_of


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


def test_every_table_in_the_bundle_is_hashed() -> None:
    """A table nobody hashes is a table whose reproducibility nobody checks.

    `content_hash.py` says exactly that above its table list, and the
    `operators` table — every conflict the world declares, and therefore the
    whole of what makes it hard — was added later without being added there.
    Two generated worlds of different declared difficulty hashed the same, and
    `--verify` could not have seen a change to the generator's output
    (`KNOWN-ISSUES.md` #33).

    Asserted against the bundle's actual schema rather than a checked-in list,
    so the next table to be added fails this instead of being forgotten.
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = build(Path(tmp) / "w.db")
        db = sqlite3.connect(path)
        try:
            actual = {
                r[0]
                for r in db.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
                )
            }
        finally:
            db.close()

    hashed = {t for t, _ in TABLES}
    assert actual - hashed == set(), (
        f"tables in the bundle but not in the content hash: {sorted(actual - hashed)}. "
        f"Add them to content_hash.TABLES, deliberately."
    )
    assert hashed - actual == set(), (
        f"content hash names tables the bundle does not have: {sorted(hashed - actual)}"
    )


def test_the_hash_notices_a_changed_conflict() -> None:
    """The property #33 was missing, stated directly.

    Two worlds that differ only in an operator's declared conflicts must not
    share an identifier — that identifier is what names a world unambiguously
    (`DATA-MODEL.md` §6).
    """
    with tempfile.TemporaryDirectory() as tmp:
        path = build(Path(tmp) / "w.db")
        before = content_hash_of(str(path))

        db = sqlite3.connect(path)
        try:
            row = db.execute("SELECT id, manifest FROM operators ORDER BY id").fetchone()
            manifest = json.loads(row[1])
            # A different declared conflict, whatever this operator started with.
            manifest["realtime"]["staleness_s"] = manifest["realtime"]["staleness_s"] + 611
            changed = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
            assert changed != row[1], "the mutation did not change the manifest"
            db.execute("UPDATE operators SET manifest = ? WHERE id = ?", (changed, row[0]))
            db.commit()
        finally:
            db.close()

        assert content_hash_of(str(path)) != before, (
            "changing an operator's declared conflicts did not change the content hash"
        )
