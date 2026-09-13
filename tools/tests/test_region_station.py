"""Every town of a region has a declared way onto its railway.

Specification: KNOWN-ISSUES.md #64, decided 2026-09-13.

A traveller with no integration layer may change only between quays of one Site.
A region's station was a Site holding its platform alone, so that traveller could
never board a train, and every journey between towns fell out of the scored set
as unroutable. The city generator met the same problem for its tram with line
`T0`. A region now gives each station a bus stop inside the station's own Site,
served by one town line, and keeps the faster walk from the hub stands
undeclared: that walk is the headroom, and it must survive the fix.
"""

from __future__ import annotations

from worldbuild import build, catalogue, network

SEEDS = (481516, 20260911, 20260908)


def _regions():
    cat = catalogue.load()
    tier = len(cat.rungs) - 1
    for shape in (s.id for s in cat.shapes if s.id != "single-centre"):
        spec = build.spec_for_tier(tier, shape)
        for seed in SEEDS:
            yield shape, seed, spec, network.generate_network(spec, seed)


def test_every_station_is_served_by_a_town_line_inside_its_own_site() -> None:
    for shape, seed, spec, net in _regions():
        site_of = {q.id: q.site_id for q in net.quays}
        for n in range(1, spec.centres + 1):
            station = f"site-rail-{n}"
            served = [
                ln.id
                for ln in net.lines
                if ln.id.startswith(f"c{n}-") and any(site_of[q] == station for q in ln.quays)
            ]
            assert served, (
                f"{shape} seed {seed}: no line of town {n} calls inside {station}, so a traveller "
                "who may only change within a Site can never reach its platform"
            )


def test_the_walk_from_the_hub_stays_undeclared() -> None:
    # The fix must not declare the interchange it is there to make worth finding.
    for shape, seed, spec, net in _regions():
        site_of = {q.id: q.site_id for q in net.quays}
        for n in range(1, spec.centres + 1):
            hubs = {site_of[q.id] for q in net.quays if q.id.startswith(f"c{n}-q-hub-")}
            assert hubs, f"{shape} seed {seed}: town {n} has no hub stands"
            assert f"site-rail-{n}" not in hubs, (
                f"{shape} seed {seed}: town {n}'s hub stands share the station Site, "
                "which declares the interchange whose discovery is the headroom"
            )


def test_a_station_stop_keeps_its_distance() -> None:
    # `_polycentric` does not run the closest-quay check the single-centre
    # generator runs, so the separation the lazy matching tolerance is derived
    # from is asserted here for the quays this change adds.
    for shape, seed, spec, net in _regions():
        for q in net.quays:
            if not q.site_id.startswith("site-rail-"):
                continue
            for other in net.quays:
                if other.id == q.id:
                    continue
                gap = network.flat_metres(q.lat, q.lon, other.lat, other.lon)
                assert gap >= spec.min_quay_separation_m, (
                    f"{shape} seed {seed}: {q.id} is {gap:.1f} m from {other.id}, "
                    f"under the {spec.min_quay_separation_m:.0f} m minimum"
                )
