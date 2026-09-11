"""What a generated projection manifest is not allowed to do.

Specification: ROADMAP.md P1M1.

Each of these encodes something Phase 0 established by measurement, and each
would be easy to lose the next time the generator is touched.
"""

from __future__ import annotations

import collections

from worldbuild import catalogue, city, generate


def _top_tier() -> int:
    """The top rung's index.

    `5` in four places until the top two rungs merged (`KNOWN-ISSUES.md` #51).
    A test that names a tier by its number is a test that stops meaning what it
    meant the moment the ladder is re-cut — which is the whole reason `P1M5`
    made the ladder a list.
    """
    return len(catalogue.load().rungs) - 1


def _drawing_tiers() -> tuple[int, ...]:
    """Every rung that draws at least one setting."""
    return tuple(i for i, r in enumerate(catalogue.load().rungs) if r.sections)


def _semantic_tiers() -> tuple[int, ...]:
    """Every rung that declares a semantic conflict."""
    return tuple(
        i for i, r in enumerate(catalogue.load().rungs) if r.sections and not r.cosmetic_only
    )


def _tiers() -> range:
    """Every tier the ladder declares.

    `range(6)` in four places, until P1M5 made the ladder a list: a rung
    inserted in `src/schema/src/ladder.ts` reaches these loops without anyone
    remembering they exist (`ROADMAP.md` P1M5).
    """
    return range(len(catalogue.load().rungs))


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
    for tier in _tiers():
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
    for tier in _semantic_tiers():
        declared = generate.describe(generate.generate_manifests(_specs(), tier, 481516))
        dirty = {name.split(":")[1] for name in declared}
        assert len(dirty) < len(_specs()), f"tier {tier} left no honest operator"


def test_no_operator_carries_most_of_the_conflicts() -> None:
    """Placement is weighted by reach, and **bounded**.

    P0M10 measured that moving conflicts onto the operator carrying the network
    doubled their cost, and this generator turned that into "place them in
    proportion to reach" — a stronger claim than the measurement supports.
    Unbounded it became a wall: one operator held three quarters of the
    conflicts, its feed stopped being usable, and because it carried most of the
    network a player who ignored it outscored one who tried. `null` beat
    `naive` and Gate 3 failed (`KNOWN-ISSUES.md` #38).

    **This test asserted the unbounded rule until P1M2**, and passed throughout.
    A test that encodes the behaviour rather than the intent cannot notice when
    the behaviour turns out to be wrong.
    """
    specs = _specs()
    for tier in _semantic_tiers():
        for seed in (1, 7, 481516, 999_983):
            declared = generate.describe(generate.generate_manifests(specs, tier, seed))
            if not declared:
                continue
            per = collections.Counter(name.split(":")[1] for name in declared)
            total = sum(per.values())
            worst, held = per.most_common(1)[0]
            # The rebalance stops when nothing further can move, so it lands at
            # or near the cap rather than always under it.
            assert held / total <= generate.MAX_CONFLICT_SHARE + 0.1, (
                f"tier {tier} seed {seed} gave {worst} {held} of {total} conflicts "
                f"({100 * held / total:.0f} %), past the "
                f"{100 * generate.MAX_CONFLICT_SHARE:.0f} % cap"
            )


def test_conflicts_still_reach_the_operators_that_carry_traffic() -> None:
    """The cap must not have turned placement into an even sprinkle.

    The finding it bounds is still true: a conflict on an operator nobody rides
    expresses nothing (P0M10's Sudbahn). The clean reference is the
    least-reaching operator, so what this checks is that the operators actually
    carrying the network are the ones carrying the conflicts.
    """
    specs = _specs()
    by_reach = sorted(specs, key=lambda s: -s.reach)
    carriers = {s.id for s in by_reach[:2]}
    for seed in (1, 481516, 999_983):
        declared = generate.describe(generate.generate_manifests(specs, 3, seed))
        per = collections.Counter(name.split(":")[1] for name in declared)
        on_carriers = sum(n for op, n in per.items() if op in carriers)
        assert on_carriers == sum(per.values()), (
            f"seed {seed} placed conflicts outside the two operators that carry "
            f"the network: {dict(per)}"
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
    for tier in _tiers():
        first = generate.generate_manifests(specs, tier, 4242)
        again = generate.generate_manifests(specs, tier, 4242)
        assert first == again, f"tier {tier} is not reproducible from its seed"


def test_every_tier_produces_different_worlds_from_different_seeds() -> None:
    """Different seeds must give different worlds. **Tier 1 included.**

    It used not to. Tier 1 is cosmetic-only, its quota asks for two settings
    from section A, and the catalogue held exactly two cosmetic ones — so every
    Tier 1 world drew both and the only freedom left was which naming variant
    (`KNOWN-ISSUES.md` #43). A tier that produces one world satisfies "two
    worlds of a tier are different worlds of comparable difficulty" by making
    the first half vacuous, which is the shape of `#32`.

    Fixed by giving the cosmetic end of section A room — `A-route-label` and
    `A-headsign` — rather than by lowering the quota, which would have bought
    variety by making the bottom rung thinner still.
    """
    specs = _specs()
    # Every rung that draws anything. The `clean` rung draws nothing by
    # definition, so two seeds give it the same empty manifest — which is the
    # rung working rather than a failure of variety.
    for tier in _drawing_tiers():
        first = generate.generate_manifests(specs, tier, 4242)
        assert first != generate.generate_manifests(specs, tier, 4243), (
            f"tier {tier} produced the same world from two different seeds"
        )


def test_tier_one_has_more_settings_than_its_quota_asks_for() -> None:
    """The condition behind `#43`, stated as the invariant rather than a symptom.

    A rung whose pool is exactly its quota has nothing to choose, however many
    seeds it is given — and the variety test above would then be passing on the
    naming variant alone. This one fails the moment a quota grows to meet its
    section, which is the change that would silently reintroduce the defect.
    """
    #: Sections known to hold exactly as many settings as some tier asks for.
    #:
    #: **Empty, and it emptied itself twice.** Section B held one setting
    #: against a quota of one until `B-dst-offset` was added at P2M0. Section D
    #: held three against a quota of three until `#54` found that quota was
    #: undeliverable and lowered it to two — so D gained room to choose without
    #: gaining a setting, which is a fix and an admission at once.
    #:
    #: This assertion is what said so both times: it fails the moment an
    #: exemption stops being true, which is the only thing that keeps a list of
    #: known exceptions from becoming a list of forgotten ones.
    #:
    #: `#43` is the record of why that is weaker than a choice of settings: the
    #: value is drawn with a tier-scaled bias that lands on the same rung most
    #: of the time, which is how Tier 1 produced one world from every seed.
    #:
    #: **Refilled 2026-09-11.** `B-dst-offset` left the draw (`#57`), so section
    #: B again offers one drawable setting against a quota of one. Counting the
    #: catalogue rather than what the generator may place would have kept this
    #: passing, and reported room that does not exist.
    NARROW: dict[str, str] = {
        "B": "KNOWN-ISSUES.md #47: one drawable setting once B-dst-offset left the draw",
    }

    cat = catalogue.load()
    for tier, quota in cat.tier_quota.items():
        pool: dict[str, int] = {}
        for setting in cat.for_tier(tier):
            if not setting.drawn:
                continue
            pool[setting.section] = pool.get(setting.section, 0) + 1
        for section, wanted in quota.items():
            if wanted <= 0 or section in NARROW:
                continue
            assert pool.get(section, 0) > wanted, (
                f"tier {tier} asks for {wanted} of section {section} and only "
                f"{pool.get(section, 0)} are available to it - nothing to choose"
            )

    # And the exemptions must still be true, or they are stale comments.
    for section, issue in NARROW.items():
        widest = max(
            (q.get(section, 0) for q in cat.tier_quota.values()),
            default=0,
        )
        available = max(
            (
                sum(1 for s in cat.for_tier(tier) if s.section == section and s.drawn)
                for tier in cat.tier_quota
            ),
            default=0,
        )
        assert available <= widest, (
            f"section {section} now holds {available} settings against a widest "
            f"quota of {widest}; it has room to choose, so remove the exemption "
            f"and close {issue}"
        )


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
    for tier in _tiers():
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
    for tier in _tiers():
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
    for tier in _tiers():
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


def test_a_ladder_is_climbed_by_tier_and_a_list_of_kinds_is_not() -> None:
    """The two halves of `#48`'s fix, asserted against each other.

    A tier is a claim about how far a world departs from publishing honestly, so
    an *ordinal* setting must reach further up its values as the tier rises —
    `C-coordinate-offset` runs 30, 60, 130 metres and 130 is worse. A
    *categorical* one has no end to reach for: `epoch_s`, `epoch_ms` and
    `local_naive` are three traps, and drawing them with a strength bias made
    Tier 5 publish `local_naive` 92 % of the time, which is how two Tier-5
    worlds came to share a memorisable answer key.

    **Both directions are asserted**, because either alone passes on a
    generator that ignores the tier entirely, or on one that ignores the flag.
    """
    cat = catalogue.load()
    by_key = {(x.group, x.key): x for x in cat.settings}
    seeds = [3000 + i for i in range(24)]

    def drawn(tier: int, conflict: str) -> list[object]:
        out: list[object] = []
        for seed in seeds:
            for m in generate.generate_manifests(_specs(), tier, seed):
                for (group, key), setting in by_key.items():
                    if setting.conflict != conflict:
                        continue
                    v = m.get(group, {}).get(key, setting.off)
                    if v != setting.off:
                        out.append(v)
        return out

    # Categorical: the top rung used to collapse B-time-encoding onto one kind.
    # Since 2026-09-11 the rung fixes how many operators publish local_naive, and
    # this hand-built city has fewer dirty operators than the top rung declares,
    # so the check that every kind still appears lives in tests/test_offsetless.py,
    # on the network the rung actually generates (KNOWN-ISSUES.md #48, #58).

    # Ordinal: the strongest rung must still be reached for more often at the
    # top of the ladder than at the bottom.
    strongest = by_key[("realtime", "staleness_s")].generate[-1]
    low = drawn(max(1, _top_tier() - 1), "D-staleness")
    high = drawn(_top_tier(), "D-staleness")
    share_low = sum(1 for v in low if v == strongest) / max(1, len(low))
    share_high = sum(1 for v in high if v == strongest) / max(1, len(high))
    assert share_high > share_low, (
        f"D-staleness reached its strongest value {share_high:.0%} of the time at "
        f"Tier 5 and {share_low:.0%} at Tier 3 — a ladder must be climbed by tier"
    )


def test_the_python_side_reads_the_ladder_rather_than_restating_it() -> None:
    """Every tier-keyed view is derived, and the contract is the only source.

    Six tables held the ladder before P1M5 — three in `catalogue.ts`, one in
    `clearance.ts`, one in `generate.py`, and the numbering itself scattered
    through loops. The Python half now reads one list.
    """
    cat = catalogue.load()

    assert cat.rungs, "the contract carries no ladder"
    assert cat.ladder_version >= 1

    ids = [r.id for r in cat.rungs]
    assert len(set(ids)) == len(ids), f"two rungs share an id: {ids}"

    # The views are derived, so they must agree with the list they come from.
    for tier, rung in enumerate(cat.rungs):
        assert cat.tier_sections[tier] == rung.sections
        assert cat.tier_quota[tier] == rung.quota
        assert cat.tier_density[tier] == rung.density
        assert (tier in cat.tier_cosmetic_only) == rung.cosmetic_only
        assert cat.rung_at(tier) is rung

    # Off the end is nothing, not the nearest rung: a world declaring a tier
    # the ladder does not have must not be graded against a plausible guess.
    assert cat.rung_at(len(cat.rungs)) is None
    assert cat.rung_at(-1) is None


def test_a_generated_world_records_which_rung_it_was() -> None:
    """The id travels with the world, because the number will move.

    A bundle that recorded only `tier: 4` becomes uninterpretable the moment an
    intermediate rung is inserted below it — `KNOWN-ISSUES.md` #20's mistake,
    which this project has already made twice with thresholds.
    """
    import sqlite3
    import tempfile
    from pathlib import Path

    from worldbuild.build import build

    cat = catalogue.load()
    with tempfile.TemporaryDirectory() as tmp:
        out = build(Path(tmp) / "w.world.db", seed=4242, tier=3)
        con = sqlite3.connect(out)
        rows = dict(con.execute("select key, value from manifest").fetchall())
        con.close()

    assert rows["tier"] == "3"
    assert rows["rung_id"] == cat.rungs[3].id
    assert rows["ladder_version"] == str(cat.ladder_version)


def test_no_rung_declares_a_quota_the_catalogue_cannot_deliver() -> None:
    """A quota that cannot be met is a declaration that is false.

    `towns-and-rail` declared `D: 3` and delivered 2 on every operator of every
    draw: section D holds three settings, `D-no-delays` excludes
    `C-delay-unit`, and that rung's `C: 2` draws the delay unit every time
    (`KNOWN-ISSUES.md` #54). Nothing noticed, because the tier still *looked*
    like the harder one in the ladder.

    This is `#30` one level up — *declared and undeliverable* rather than
    declared and absent — and it is the same failure mode either way: a world
    quietly easier than the number it advertises.

    **Delivered may exceed declared**, and does: `_cosmetic_floor` gives every
    dirty operator a texture setting from outside the quota. Only the shortfall
    is a defect.
    """
    cat = catalogue.load()
    by_key = {(x.group, x.key): x for x in cat.settings}

    for tier, rung in enumerate(cat.rungs):
        if not rung.sections:
            continue
        for seed in (505273, 4242):
            manifests = generate.generate_manifests(_specs(), tier, seed)
            for section, declared in rung.quota.items():
                if declared == 0:
                    continue
                # The most-loaded operator: `_quota_for` scales by reach, so a
                # small operator is *meant* to carry less.
                delivered = max(
                    sum(
                        1
                        for (group, key), setting in by_key.items()
                        if setting.section == section
                        and m.get(group, {}).get(key, setting.off) != setting.off
                    )
                    for m in manifests
                )
                assert delivered >= declared, (
                    f"{rung.id} declares {declared} of section {section} and delivers "
                    f"{delivered} at seed {seed} — the rung advertises a difficulty the "
                    f"catalogue cannot give it (KNOWN-ISSUES.md #54)"
                )
