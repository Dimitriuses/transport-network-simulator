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
    with pytest.raises(ValueError, match="arms must be one of"):
        N.NetworkSpec(arms=5)
    # Ten is even, and its directions need cos 36 written as a surd — which is
    # possible and has not been needed. Refused rather than approximated: a
    # direction from `math.cos` is not the same bits on every machine, and the
    # content hash is compared across Python builds (`network.py`).
    with pytest.raises(ValueError, match="arms must be one of"):
        N.NetworkSpec(arms=10)
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
    small = _net(arms=4, sites_per_arm=3, chords=2)
    # Longer arms give the radial operator more stops, so the ring operator
    # needs more chords to stay under `max_reach_share`. That coupling is real
    # rather than an inconvenience: a bigger city needs a bigger tram network.
    large = _net(arms=8, sites_per_arm=5, chords=6)
    assert len(large.quays) > len(small.quays)
    assert len(large.lines) > len(small.lines)


def test_no_operator_covers_most_of_the_stops() -> None:
    """Real agencies cover their own region or their own role, not the city.

    A world where one operator serves most of the stops is unrealistic on its
    face, and it also breaks conflict placement: conflicts are weighted by
    reach, so the dominant operator collects most of them, its feed stops being
    usable, and a player who ignores it outscores one who tries
    (`KNOWN-ISSUES.md` #38).
    """
    for seed in SEEDS:
        net = _net(seed)
        reach = N.operator_reach(net)
        total = sum(reach.values())
        worst, served = max(reach.items(), key=lambda kv: kv[1])
        assert served / total <= N.NetworkSpec().max_reach_share, (
            f"seed {seed}: {worst} serves {served} of {total} line-stops "
            f"({100 * served / total:.0f} %)"
        )


def test_the_ring_belongs_to_the_operator_that_does_not_run_the_radials() -> None:
    """Connecting the ends without going through the centre is a different job.

    A star-shaped operator serves that journey badly, which is exactly why the
    ring exists and exactly why it is somebody else's line. Giving it to the
    radial operator is what pushed that operator to 67 % of the network.
    """
    for seed in SEEDS:
        net = _net(seed)
        ring = next(ln for ln in net.lines if ln.id == "line-orbital")
        radials = {
            ln.operator for ln in net.lines if ln.id.startswith("line-") and ln.name.isdigit()
        }
        assert ring.operator not in radials, (
            f"seed {seed}: the ring is run by {ring.operator}, which also runs the radials"
        )


def test_every_arm_count_makes_a_circle_rather_than_a_fan() -> None:
    """Opposite arms must actually be opposite.

    The directions were one tuple of eight and a six-arm city took the first
    six of them — N, NE, E, SE, S, SW, which is three quarters of a circle. The
    generator pairs arm `a` with arm `a + arms // 2` into a through line, so in
    that fan the line "through" the hub from the north came back out to the
    south-east. Every world ever built had eight arms, so nothing noticed until
    P1M6 gave the rungs different sizes.
    """
    for arms, dirs in N._DIRECTION_TABLE.items():
        assert len(dirs) == arms
        assert len(N._ARM_NAME_TABLE[arms]) == arms

        for north, east in dirs:
            # A unit vector, to the precision `sqrt` gives.
            assert abs(north * north + east * east - 1.0) < 1e-12

        half = arms // 2
        for a in range(half):
            north, east = dirs[a]
            onorth, oeast = dirs[a + half]
            assert abs(north + onorth) < 1e-12, f"{arms} arms: {a} and {a + half} are not opposite"
            assert abs(east + oeast) < 1e-12, f"{arms} arms: {a} and {a + half} are not opposite"


def test_a_region_is_towns_joined_by_rail() -> None:
    """The shape axis, asserted where it is built.

    Specification: `src/schema/src/shape.ts`, ROADMAP.md P1M7.

    A polycentric world is not a bigger city: it is several towns, each with its
    own operators, and a railway between them whose headway is the whole point.
    """
    spec = N.NetworkSpec(
        arms=12,
        sites_per_arm=4,
        chords=5,
        regional_lines=4,
        roster=("radial", "ring", "radial", "metro", "regional"),
        centres=3,
        max_reach_share=0.45,
    )
    net = N.generate_network(spec, 20260908)

    # Every town's ids are its own, or three towns all contain `site-hub`.
    for c in (1, 2, 3):
        assert any(s.id == f"c{c}-site-hub" for s in net.sites), f"town {c} has no hub"

    # Each town runs its own companies, and nobody runs two towns.
    roles = {o.id: o.role for o in net.operators}
    local = [o for o in net.operators if o.role in ("radial", "ring")]
    assert len(local) == 6, f"expected two local operators per town, got {sorted(roles)}"
    assert len(set(o.id for o in net.operators)) == len(net.operators), "an id is used twice"

    # **A metro belongs to a city**, so at most one town has one.
    assert sum(1 for o in net.operators if o.role == "metro") <= 1

    rail = [ln for ln in net.lines if ln.id.startswith("line-rail")]
    assert rail, "a region with no railway is three worlds in a trench coat"
    for line in rail:
        # It calls at every town.
        assert len(line.quays) == spec.centres
        # **The headway is the conflict.** A bus every ten minutes forgives a
        # bad plan; a train every forty does not, which is what puts the
        # interchange on the critical path.
        assert line.headway_s >= 30 * 60, f"{line.id} runs every {line.headway_s // 60} min"

    # And the invariant that is about the world rather than a part of it: no
    # operator serves most of the region, though each serves most of its town.
    reach = N.operator_reach(net)
    total = sum(reach.values())
    assert max(reach.values()) / total <= spec.max_reach_share
