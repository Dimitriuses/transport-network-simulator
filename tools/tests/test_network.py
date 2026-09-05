"""What a generated network must be, and what it must never be.

Specification: ROADMAP.md P1M2.

`PHASES.md` says the generator's specification is whatever we found ourselves
doing by hand, and each of these encodes something Phase 0 or P1M2 established
by measurement. Two of them are here because the first generated network
violated them and nothing else noticed until a calibration two steps later.
"""

from __future__ import annotations

import pytest

from worldbuild import network as N

SEEDS = (1, 7, 481516, 999_983)


def _net(seed: int = 481516, **kw: object) -> N.Network:
    return N.generate_network(N.NetworkSpec(**kw), seed)  # type: ignore[arg-type]


def test_the_same_seed_gives_the_same_city() -> None:
    """The whole project rests on this, and a generator is where it breaks."""
    for seed in SEEDS:
        assert _net(seed) == _net(seed)
    assert _net(1) != _net(2)


def test_coordinates_survive_a_round_trip_through_text() -> None:
    """No transcendental arithmetic may reach a stored coordinate.

    `math.sin` and `math.cos` differ in their last bits between platform libms,
    and a site placed one ULP differently changes a walk distance, which changes
    the transfer graph, which changes every score. Six-decimal rounding is what
    puts nine orders of magnitude between the stored value and that noise.
    """
    for seed in SEEDS:
        for q in _net(seed).quays:
            assert round(q.lat, 6) == q.lat, f"{q.id} latitude carries more than 6 decimals"
            assert round(q.lon, 6) == q.lon, f"{q.id} longitude carries more than 6 decimals"


def test_undeclared_interchanges_exist() -> None:
    """**This is the headroom.**

    Operator B's stops sit a short walk from operator A's but in separate Sites,
    so nobody has declared them to be the same place. `P0` may transfer there
    and the reference policy may not, and the difference between those two
    transfer sets is precisely what a player competes for
    (`REFERENCE-POLICY.md` §4.1). A network without them has zero headroom and
    no scored journey on it can reward integration.
    """
    for seed in SEEDS:
        net = _net(seed)
        pairs = N.undeclared_interchanges(net)
        assert len(pairs) >= 10, f"seed {seed} generated only {len(pairs)} undeclared interchanges"
        # And they must genuinely cross operators, not merely cross Sites.
        operator_of: dict[str, str] = {}
        for line in net.lines:
            for q in line.quays:
                operator_of.setdefault(q, line.operator)
        crossing = [
            (a, b) for a, b, _ in pairs if operator_of.get(a, "?") != operator_of.get(b, "?")
        ]
        assert crossing, f"seed {seed} has no interchange between two different operators"


def test_no_two_quays_sit_on_top_of_each_other() -> None:
    """The number that decides whether the lazy integrator can match anything.

    `naiveMatchThresholdM` derives P2's stop-matching tolerance from the closest
    genuine pair, strictly below it, so it can never fuse two quays that really
    are different places. The first generated network put two 7.1 m apart, the
    tolerance became 6 m, no operator's published position matched any other's,
    and `P1 - P2` came out negative on a network whose headroom was healthy.
    """
    for seed in SEEDS:
        net = _net(seed)
        closest, pair = N.closest_quays(net)
        assert closest >= N.NetworkSpec().min_quay_separation_m, (
            f"seed {seed}: {pair[0]} and {pair[1]} are {closest:.1f} m apart"
        )


def test_a_quay_is_never_exactly_its_site() -> None:
    """A Site is a station complex; a Quay is a boarding point within it.

    Placing them at identical coordinates makes `A-coordinate-source: site`
    publish exactly what `quay` publishes, and the defect audit reports MISS —
    a world declaring a conflict it does not contain (`KNOWN-ISSUES.md` #30).
    """
    for seed in SEEDS:
        net = _net(seed)
        by_id = {s.id: s for s in net.sites}
        for q in net.quays:
            site = by_id[q.site_id]
            assert N.flat_metres(q.lat, q.lon, site.lat, site.lon) > 1.0, (
                f"seed {seed}: quay {q.id} sits on its own site centroid"
            )


def test_the_hub_has_several_quays_one_operator_serves() -> None:
    """Otherwise `A-granularity` cannot be placed anywhere at all.

    Publishing at Site granularity means one stop where there are several quays.
    An operator serving a single quay at every station it calls at publishes the
    same thing either way (`KNOWN-ISSUES.md` #30).
    """
    for seed in SEEDS:
        collapsible = N.operator_collapsible_sites(_net(seed))
        assert any(v > 0 for v in collapsible.values()), (
            f"seed {seed} has no operator that could express A-granularity: {collapsible}"
        )


def test_one_operator_carries_the_network() -> None:
    """Placement matters more than strength, and reach is how it is decided.

    P0M10 moved the same fifteen conflicts onto the operator running half the
    city, at identical settings, and doubled what they cost.
    """
    for seed in SEEDS:
        reach = N.operator_reach(_net(seed))
        assert len(reach) >= 3, f"seed {seed} generated fewer than three operators"
        biggest = max(reach.values())
        assert biggest >= 2 * min(reach.values()), (
            f"seed {seed} spread reach evenly across operators: {reach} — "
            f"no operator carries the network, so no conflict can land on a critical path"
        )


def test_every_line_calls_at_three_stops_and_repeats_none() -> None:
    for seed in SEEDS:
        for line in _net(seed).lines:
            assert len(line.quays) >= 3, f"{line.id} is not a line"
            assert len(set(line.quays)) == len(line.quays), f"{line.id} calls at a quay twice"


def test_every_line_calls_only_at_quays_that_exist() -> None:
    for seed in SEEDS:
        net = _net(seed)
        known = {q.id for q in net.quays}
        for line in net.lines:
            missing = [q for q in line.quays if q not in known]
            assert not missing, f"{line.id} calls at {missing}, which do not exist"


def test_a_spec_that_cannot_work_is_refused() -> None:
    """Loudly, and where the cause is, rather than in a calibration later."""
    with pytest.raises(ValueError, match="even and at least 4"):
        N.NetworkSpec(arms=5)
    with pytest.raises(ValueError, match="A-granularity unplaceable"):
        N.NetworkSpec(hub_quays=1)
    with pytest.raises(ValueError, match="needs a middle"):
        N.NetworkSpec(sites_per_arm=2)
    # And the invariant that is checked after construction rather than before.
    with pytest.raises(ValueError, match="minimum"):
        N.generate_network(N.NetworkSpec(min_quay_separation_m=5000.0), 481516)


def test_the_shape_responds_to_its_spec() -> None:
    """The levers are levers, not decoration.

    `KNOWN-ISSUES.md` #32 needs difficulty levers the conflict catalogue cannot
    supply, and network shape is where they come from.
    """
    small = _net(arms=4, sites_per_arm=3)
    large = _net(arms=8, sites_per_arm=5)
    assert len(large.quays) > len(small.quays)
    assert len(large.lines) > len(small.lines)
