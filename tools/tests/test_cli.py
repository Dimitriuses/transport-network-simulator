"""The build CLI must refuse what it does not understand.

Specification: KNOWN-ISSUES.md #31.

`python -m worldbuild --out ../worlds/gen-t2.world.db --tier 2` took `--out` as
the output path and discarded the rest. It printed a plausible content hash
while writing a junk file into `tools/`, and the audit that ran next read a
*stale* bundle and was believed.

**A silent default is indistinguishable from a working experiment**, which this
project learned once already when `refplayer/scripts/serve.ts` treated an
unrecognised player mode as `naive` and ran a whole diagnostic as the wrong
player (`KNOWN-ISSUES.md` #17).
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def _run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "worldbuild", *args],
        cwd=REPO / "tools",
        capture_output=True,
        text=True,
    )


def test_an_unknown_option_is_refused() -> None:
    result = _run("--out", "somewhere.db", "--tier", "2")
    assert result.returncode == 2, result.stdout + result.stderr
    assert "unknown option" in result.stderr
    assert not (REPO / "tools" / "--out").exists(), "built a world named after the flag"
    assert not (REPO / "tools" / "somewhere.db").exists()


def test_surplus_arguments_are_refused() -> None:
    result = _run("one.db", "two.db")
    assert result.returncode == 2, result.stdout + result.stderr
    assert "at most one output path" in result.stderr
    assert not (REPO / "tools" / "one.db").exists()
    assert not (REPO / "tools" / "two.db").exists()


def test_the_documented_form_still_works() -> None:
    """The refusals must not have made the CLI refuse its own usage."""
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "w.world.db"
        result = _run(str(out), "--tier", "2")
        assert result.returncode == 0, result.stdout + result.stderr
        assert out.exists(), "the documented invocation built nothing"
        assert "content" in result.stdout
