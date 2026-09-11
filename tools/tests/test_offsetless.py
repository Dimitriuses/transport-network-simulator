"""A rung declares how many operators publish time with no offset, and gets exactly that.

Specification: KNOWN-ISSUES.md #58 and #48, decided 2026-09-11.

`B-time-encoding` was drawn uniformly on the premise that its values are equal
traps. Measured, they are not: `local_naive` costs a lazy reader three hours and
the epoch encodings cost it almost nothing, and across twelve draws of two rungs
the number of operators publishing `local_naive` decided whether a world was a
rung or easy — with no exceptions, and in the direction each calibrated pair
disagreed. So the count is a strength, and a rung fixes it (#42's principle: a
rung's composition is fixed, not sampled).

**The fix changes only the value of the time encoding, and as little of it as it
can.** A draw that already has the declared count is left exactly as drawn; one
that does not has only the difference moved, chosen on its own random stream so
nothing else in the world is re-drawn.
"""

from __future__ import annotations

import copy
import dataclasses

import pytest

from worldbuild import build, catalogue, network

CITY = 481516
CONFLICT_SEEDS = [CITY + i * 7919 for i in range(6)]


def _declaring(cat: catalogue.Catalogue) -> list[tuple[int, catalogue.Rung]]:
    return [(i, r) for i, r in enumerate(cat.rungs) if r.offsetless is not None]


def _naive(manifests: tuple[dict, ...]) -> int:
    return sum(1 for m in manifests if m["time"]["encoding"] == "local_naive")


def _network(tier: int) -> network.Network:
    return network.generate_network(build.spec_for_tier(tier, "single-centre"), CITY)


def test_the_ladder_declares_the_counts_that_were_decided() -> None:
    declared = {r.id: r.offsetless for _, r in _declaring(catalogue.load())}
    assert declared == {"metro-town": 1, "metro-city": 2, "towns-and-rail": 3}


def test_every_declaring_rung_gets_exactly_its_count() -> None:
    """A declaration the generator cannot deliver is `#54` again."""
    for tier, rung in _declaring(catalogue.load()):
        net = _network(tier)
        for seed in CONFLICT_SEEDS:
            got = _naive(build.operators_for(tier, seed, net))
            assert got == rung.offsetless, (
                f"{rung.id}, conflict seed {seed}: {got} operators publish local_naive "
                f"where the rung declares {rung.offsetless}"
            )


def test_fixing_the_count_changes_only_the_encoding(monkeypatch: pytest.MonkeyPatch) -> None:
    """Against the same draw with no count declared, only encodings may differ.

    And a draw that already had the declared count must be untouched. Both
    kinds must occur, or one half of this proves nothing.
    """
    real = catalogue.load()
    cases = [
        (tier, rung, seed, _network(tier))
        for tier, rung in _declaring(real)
        for seed in CONFLICT_SEEDS
    ]
    now = {(tier, seed): build.operators_for(tier, seed, net) for tier, _, seed, net in cases}

    undeclared = dataclasses.replace(
        real, rungs=tuple(dataclasses.replace(r, offsetless=None) for r in real.rungs)
    )
    monkeypatch.setattr(catalogue, "load", lambda: undeclared)

    adjusted = 0
    untouched = 0
    for tier, rung, seed, net in cases:
        drawn = build.operators_for(tier, seed, net)
        fixed = now[(tier, seed)]
        if _naive(drawn) == rung.offsetless:
            untouched += 1
            assert fixed == drawn, f"{rung.id} seed {seed} already had its count and was changed"
            continue
        adjusted += 1
        for before, after in zip(drawn, fixed, strict=True):
            a = copy.deepcopy(before)
            b = copy.deepcopy(after)
            a["time"]["encoding"] = b["time"]["encoding"] = None
            assert a == b, f"{rung.id} seed {seed}: {after['id']} changed beyond its encoding"
            if before["time"]["encoding"] != after["time"]["encoding"]:
                # Only an operator that drew the setting may have its value moved.
                assert before["time"]["encoding"] != "iso_offset"

    assert adjusted > 0, "no draw needed adjusting, so the adjustment was never exercised"
    assert untouched > 0, "no draw already had its count, so leaving one alone was never checked"


def test_every_kind_still_appears_at_the_top_rung() -> None:
    # Fixing the count must not collapse the draw onto one kind, which was #48.
    # The top rung carries local_naive on a fixed number of operators; the rest,
    # and which operators carry it, are still drawn, so across seeds every value
    # of the setting must show up and the carriers must vary.
    cat = catalogue.load()
    tier = len(cat.rungs) - 1
    net = _network(tier)
    seen: set[str] = set()
    carriers: set[tuple[str, ...]] = set()
    for i in range(24):
        manifests = build.operators_for(tier, CITY + i * 7919, net)
        seen.update(
            m["time"]["encoding"] for m in manifests if m["time"]["encoding"] != "iso_offset"
        )
        carriers.add(
            tuple(sorted(m["id"] for m in manifests if m["time"]["encoding"] == "local_naive"))
        )
    assert seen == {"epoch_s", "epoch_ms", "local_naive"}, f"the top rung drew only {sorted(seen)}"
    assert len(carriers) > 1, "the same operators carried local_naive in every draw"
