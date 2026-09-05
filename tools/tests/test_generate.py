"""What a generated projection manifest is not allowed to do.

Specification: ROADMAP.md P1M1.

Each of these encodes something Phase 0 established by measurement, and each
would be easy to lose the next time the generator is touched.
"""

from __future__ import annotations

import collections

from worldbuild import catalogue, city, generate


def _specs() -> tuple[generate.OperatorSpec, ...]:
    reach: collections.Counter[str] = collections.Counter()
    for line in city.LINES:
        reach[line.operator] += len(line.quays)
    collapsible = city.operator_collapsible_sites()
    return tuple(
        generate.OperatorSpec(
            o["id"], o["name"], o["dialect"], reach[o["id"]], collapsible.get(o["id"], 0)
        )
        for o in city.OPERATORS
    )


def test_every_generated_setting_is_plausible() -> None:
    """No generated world may describe a broken map.

    Every failing-gate pressure in this project has pointed at "make the
    conflict bigger". The catalogue's `generate` list contains only settings two
    real operators could differ by, and the generator may not reach past it.
    """
    cat = catalogue.load()
    by_key = {(s.group, s.key): s for s in cat.settings}
    for tier in range(6):
        for seed in (1, 481516, 999_983):
            for manifest in generate.generate_manifests(_specs(), tier, seed):
                for group, values in manifest.items():
                    if not isinstance(values, dict):
                        continue
                    for key, value in values.items():
                        setting = by_key.get((group, key))
                        if setting is None:
                            continue
                        assert setting.is_plausible(value), (
                            f"tier {tier} seed {seed} gave {manifest['id']} "
                            f"{group}.{key}={value!r}, past what two real operators "
                            f"could differ by ({setting.plausible_because})"
                        )


def test_one_operator_publishes_honestly() -> None:
    """A player with nothing to compare against cannot tell which feed is odd.

    Phase 0's competent solution picks its coordinate frame by consensus, which
    needs at least one operator worth agreeing with.
    """
    for tier in (2, 3, 5):
        declared = generate.describe(generate.generate_manifests(_specs(), tier, 481516))
        dirty = {name.split(":")[1] for name in declared}
        assert len(dirty) < len(_specs()), f"tier {tier} left no honest operator"


def test_conflicts_land_where_the_traffic_is() -> None:
    """Placement matters more than strength, and this is why.

    The committed world put every conflict on its two smallest operators and
    left the one running half the city immaculate. Moving them, at identical
    settings, doubled what they cost (BUILD-LOG.md, P0M10).
    """
    specs = _specs()
    biggest = max(specs, key=lambda s: s.reach)
    for seed in (1, 481516, 999_983):
        declared = generate.describe(generate.generate_manifests(specs, 3, seed))
        per = collections.Counter(name.split(":")[1] for name in declared)
        assert per[biggest.id] == max(per.values()), (
            f"seed {seed} placed most conflicts on {per.most_common(1)}, not on "
            f"{biggest.id}, which reaches {biggest.reach} line-stops"
        )


def test_tier_one_is_texture_only() -> None:
    """Tier 1 provides cosmetically different schemas and a stop mapping.

    Nothing there should require reconciling what is *true* — `CORECONCEPT.md`
    §7 gives it "A (cosmetic only)".
    """
    cat = catalogue.load()
    cosmetic = {s.conflict for s in cat.settings if s.cosmetic}
    for seed in (1, 481516):
        for name in generate.describe(generate.generate_manifests(_specs(), 1, seed)):
            assert name.split(":")[0] in cosmetic, f"tier 1 generated {name}, which is semantic"


def test_tier_zero_is_clean() -> None:
    for seed in (1, 481516):
        assert generate.describe(generate.generate_manifests(_specs(), 0, seed)) == []


def test_realtime_conflicts_wait_for_tier_three() -> None:
    """Catalogue D is what makes a world *live*; Tier 2 is static plus delays."""
    for seed in (1, 481516, 999_983):
        for name in generate.describe(generate.generate_manifests(_specs(), 2, seed)):
            assert not name.startswith("D-"), f"tier 2 generated {name}"
        assert any(
            name.startswith("D-")
            for name in generate.describe(generate.generate_manifests(_specs(), 3, seed))
        ), f"tier 3 seed {seed} generated no realtime conflict at all"


def test_the_same_seed_gives_the_same_world() -> None:
    """The whole project rests on this, and a generator is where it would break."""
    specs = _specs()
    for tier in (1, 2, 3, 5):
        first = generate.generate_manifests(specs, tier, 4242)
        again = generate.generate_manifests(specs, tier, 4242)
        assert first == again
        assert first != generate.generate_manifests(specs, tier, 4243)


def test_a_masking_conflict_is_never_generated_beside_what_it_masks() -> None:
    """A conflict that hides another wastes it, and the world declares two.

    P1M1 found both of these the same way — by auditing a generated world and
    finding a declared conflict absent from the data:

      * a lat/lon swap moves stops 2,200 km, past which a 130 m offset and a
        110 m truncation on the same operator are not subtle, they are invisible;
      * an operator that publishes no delays has no delay unit to get wrong.

    Realism and measurability are properties of the *combination*, which
    per-setting ceilings cannot express.
    """
    cat = catalogue.load()
    by_conflict = {s.conflict: s for s in cat.settings}
    for tier in range(6):
        for seed in (1, 7, 481516, 999_983):
            manifests = generate.generate_manifests(_specs(), tier, seed)
            for operator, names in _by_operator(generate.describe(manifests)).items():
                for name in names:
                    setting = by_conflict.get(name)
                    if setting is None:
                        continue
                    clash = set(setting.excludes) & names
                    assert not clash, (
                        f"tier {tier} seed {seed} gave {operator} {name} together with "
                        f"{sorted(clash)}, which it makes unmeasurable"
                    )


def test_a_conflict_is_never_placed_where_it_cannot_show() -> None:
    """Declared and absent is a world quietly easier than its tier claims.

    `A-granularity: site` publishes one stop per station; an operator serving a
    single quay at every station it calls at publishes exactly that already, and
    the defect audit reports MISS. Phase 0 met this as Sudbahn.
    """
    specs = _specs()
    incapable = {s.id for s in specs if s.collapsible_sites == 0}
    assert incapable, "no operator in this city would exercise the rule"
    for tier in range(6):
        for seed in (1, 7, 481516, 999_983):
            for name in generate.describe(generate.generate_manifests(specs, tier, seed)):
                conflict, operator = name.split(":")
                assert not (conflict == "A-granularity" and operator in incapable), (
                    f"tier {tier} seed {seed} declared {name}, but {operator} serves no "
                    f"station where it calls at more than one quay"
                )


def _by_operator(declared: list[str]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for name in declared:
        conflict, operator = name.split(":")
        out.setdefault(operator, set()).add(conflict)
    return out


def test_a_setting_that_cannot_express_itself_is_never_generated() -> None:
    """The numeric cousin of the rule above, and the more insidious one.

    A feed conceals a disruption only when its lag exceeds that disruption's
    announcement lead. The world draws leads from `noticeLeadS`, minimum 300 s;
    the committed world declared staleness of 90 s and 300 s; neither hid
    anything, on any operator, for the whole of Phase 0 (`KNOWN-ISSUES.md` #19).

    Both numbers now come from `contract/catalogue.json`, so this compares one
    value against itself rather than two copies of it.
    """
    cat = catalogue.load()
    floor = cat.policy.notice_lead_min_s
    for tier in range(6):
        for seed in (1, 7, 481516, 999_983):
            for manifest in generate.generate_manifests(_specs(), tier, seed):
                stale = manifest["realtime"]["staleness_s"]
                assert stale == 0 or stale > floor, (
                    f"tier {tier} seed {seed} gave {manifest['id']} staleness {stale}s "
                    f"against a minimum announcement lead of {floor}s — plausible, "
                    f"declared, and incapable of hiding anything"
                )


def test_the_staleness_ladder_has_not_collapsed_silently() -> None:
    """A guard on the flag raised at P1M1, not an assertion that it is fine.

    Filtering inexpressible values leaves `D-staleness` with exactly one usable
    setting, so it is on or off with nothing between. That is more honest than
    generating a conflict that does nothing, and it is still a narrower ladder
    than the catalogue appears to offer. If someone widens `generate` or lowers
    `noticeLeadS`, this test should start passing for a better reason.
    """
    cat = catalogue.load()
    stale = next(s for s in cat.settings if s.conflict == "D-staleness")
    usable = [v for v in stale.generate if generate._expressible(stale, v, cat)]
    assert usable, (
        "no staleness setting in the catalogue can conceal anything against "
        f"a minimum announcement lead of {cat.policy.notice_lead_min_s}s"
    )
