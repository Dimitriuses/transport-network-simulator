"""A rung declares its radial headways, and the city seed no longer chooses them.

Specification: KNOWN-ISSUES.md #61, decided 2026-09-11.

The generator drew each radial line's headway from the city seed, and that draw
set a rung's difficulty more than its conflicts did: how often the buses run
decides how well a traveller does without integration, which sizes the prize
every score is a share of.

**The declaration changes the timetable and nothing else.** The draw is still
spent, so every position, name, operator and later draw in the city is what it
was — which is what makes a world built before the change and one built after it
comparable at all.
"""

from __future__ import annotations

import dataclasses

from worldbuild import build, catalogue, network

CITIES = (481516, 20260911, 1234567)


def _radials(net: network.Network) -> list:
    # Radials are the numbered lines; the orbital, chords, metro, regional and
    # inter-town links all carry letters.
    return [ln for ln in net.lines if ln.name.isdigit()]


def _cycled(pattern: tuple[int, ...], n: int) -> list[int]:
    return [pattern[i % len(pattern)] for i in range(n)]


def test_every_rung_declares_the_decided_headways() -> None:
    declared = {r.id: r.world.radial_headways_s for r in catalogue.load().rungs}
    assert set(declared.values()) == {(1200, 1500)}, declared


def test_a_generated_city_runs_exactly_what_its_rung_declares() -> None:
    for tier, rung in enumerate(catalogue.load().rungs):
        spec = build.spec_for_tier(tier, "single-centre")
        for city in CITIES:
            radials = _radials(network.generate_network(spec, city))
            assert radials, f"{rung.id} has no radial lines to check"
            got = [ln.headway_s for ln in radials]
            want = _cycled(rung.world.radial_headways_s, len(radials))
            assert got == want, f"{rung.id}, city {city}: runs {got}, declares {want}"


def test_two_cities_of_a_rung_share_a_timetable_and_not_their_streets() -> None:
    tier = len(catalogue.load().rungs) - 1
    spec = build.spec_for_tier(tier, "single-centre")
    a, b = (network.generate_network(spec, city) for city in CITIES[:2])
    assert [(ln.id, ln.headway_s) for ln in a.lines] == [(ln.id, ln.headway_s) for ln in b.lines]
    assert [(q.lat, q.lon) for q in a.quays] != [(q.lat, q.lon) for q in b.quays]


def test_declaring_headways_changes_nothing_else() -> None:
    """Against the same city with the draw left to decide, only radial headways differ.

    And some must differ, or this proves nothing.
    """
    changed = 0
    for tier in range(len(catalogue.load().rungs)):
        declared = build.spec_for_tier(tier, "single-centre")
        drawn_spec = dataclasses.replace(declared, radial_headways_s=None)
        for city in CITIES:
            fixed = network.generate_network(declared, city)
            drawn = network.generate_network(drawn_spec, city)
            assert fixed.sites == drawn.sites
            assert fixed.quays == drawn.quays
            assert fixed.names == drawn.names
            assert fixed.operators == drawn.operators
            for f, d in zip(fixed.lines, drawn.lines, strict=True):
                assert dataclasses.replace(f, headway_s=0) == dataclasses.replace(d, headway_s=0)
                if f.headway_s != d.headway_s:
                    assert f.name.isdigit(), f"{f.id} is not a radial and its headway moved"
                    changed += 1
    assert changed > 0, "no drawn headway differed from the declared one"


def test_every_town_of_a_region_cycles_the_same_headways() -> None:
    cat = catalogue.load()
    tier = len(cat.rungs) - 1
    pattern = cat.rungs[tier].world.radial_headways_s
    for shape in (s.id for s in cat.shapes if s.id != "single-centre"):
        net = network.generate_network(build.spec_for_tier(tier, shape), CITIES[0])
        towns: dict[str, list[int]] = {}
        for ln in _radials(net):
            towns.setdefault(ln.id.split("-")[0], []).append(ln.headway_s)
        assert len(towns) > 1, f"{shape}: expected several towns' radials, found {sorted(towns)}"
        for town, got in towns.items():
            assert got == _cycled(pattern, len(got)), f"{shape} {town}: runs {got}"
