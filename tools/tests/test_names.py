"""What a generated city's names must be.

Specification: ROADMAP.md P1M3, CORECONCEPT.md §1 and §2.1 A.

The milestone exists because `KNOWN-ISSUES.md` #39 found `publishedName`
deriving the colloquial variant from a hard-coded lookup of the hand-authored
city's five best-known places. On a generated city it rewrote one name in
thirty-three and the defect audit reported MISS.

**A variant is a fact about a place, not a function of its official name.** An
abbreviation follows by rule; a transliteration does not.
"""

from __future__ import annotations

from worldbuild import names, network

SEEDS = (1, 7, 481516, 999_983)


def test_the_same_seed_names_the_same_city() -> None:
    for seed in SEEDS:
        assert names.generate_place_names(40, seed) == names.generate_place_names(40, seed)
    assert names.generate_place_names(40, 1) != names.generate_place_names(40, 2)


def test_official_names_are_unique() -> None:
    """Two places may be *called* the same thing; they are not *named* it.

    The official name is the one on the sign, and a city does not have two of
    them. The collisions live in the colloquial form, which is the point.
    """
    for seed in SEEDS:
        for count in (12, 40, 90):
            place_names = names.generate_place_names(count, seed)
            official = [p.official for p in place_names]
            assert len(set(official)) == len(official), (
                f"seed {seed}, {count} places: duplicate official names"
            )


def test_colloquial_names_collide_on_purpose() -> None:
    """A name is a poor identifier, and that is what makes it interesting.

    `CORECONCEPT.md` §2.1 A asks for "a stop that two operators both name
    identically but which is physically two different stops". If every
    colloquial name were unique, `A-naming` would be a second identifier rather
    than a reconciliation problem.
    """
    place_names = names.generate_place_names(90, 481516)
    colloquial = [p.colloquial for p in place_names]
    assert len(set(colloquial)) < len(colloquial), "no colloquial name is shared by two places"


def test_a_transliteration_is_not_derivable_from_the_official_name() -> None:
    """The property that forced the variants into the world bundle.

    If every colloquial form were a substring of its official name, a rule in
    the projection layer could produce it and none of P1M3 would be needed.
    """
    place_names = names.generate_place_names(40, 481516)
    derivable = [p for p in place_names if p.colloquial.lower() in p.official.lower()]
    assert not derivable, (
        f"{len(derivable)} colloquial names are substrings of their official form, "
        f"e.g. {derivable[0].official!r} -> {derivable[0].colloquial!r}. A rule could "
        f"derive those, and the point of storing them is that it cannot."
    )


def test_former_names_are_unique_where_they_exist() -> None:
    """No two streets in one city were previously called the same thing."""
    for seed in SEEDS:
        formers = [p.former for p in names.generate_place_names(90, seed) if p.former]
        assert len(set(formers)) == len(formers), f"seed {seed}: a former name is shared"
        assert formers, f"seed {seed}: no place was ever renamed"


def test_every_entity_of_a_generated_city_is_named() -> None:
    """A projection that finds no names falls back to deriving them.

    The fallback exists so a missing row degrades rather than blanks, and it
    should never fire. This is what makes that true.
    """
    for seed in SEEDS:
        net = network.generate_network(network.NetworkSpec(), seed)
        for site in net.sites:
            assert site.id in net.names, f"seed {seed}: site {site.id} has no names"
        for quay in net.quays:
            assert quay.id in net.names, f"seed {seed}: quay {quay.id} has no names"
        for line in net.lines:
            assert line.id in net.names, f"seed {seed}: line {line.id} has no names"


def test_a_stop_and_the_stop_beside_it_share_a_colloquial_name() -> None:
    """The undeclared interchange, in words rather than in metres.

    Operator B's stop sits a short walk from operator A's in a separate Site,
    and locals call both by the street's name. So an operator publishing
    colloquially gives two undeclared-interchange quays the *same* published
    name — a clue a good player uses and a trap a careless one falls into.
    """
    for seed in SEEDS:
        net = network.generate_network(network.NetworkSpec(), seed)
        shared = 0
        for quay in net.quays:
            if not quay.id.startswith("t-") or quay.id == "t-hub":
                continue
            twin = f"q-{quay.id[2:]}"
            if twin in net.names and net.names[twin].colloquial == net.names[quay.id].colloquial:
                shared += 1
        assert shared > 0, f"seed {seed}: no tram stop shares a name with the stop beside it"


def test_the_hand_city_keeps_its_own_phrasebook() -> None:
    """Derivation is the fallback; the city's own names win.

    "Central Square" is "Tsentralna" because somebody wrote that down, and no
    rule over the string produces it.
    """
    assert names.derive_variants("Central Square").colloquial == "Tsentralna"
    assert names.derive_variants("West Terminus").colloquial == "Zakhidnyi"
    # A place beside a named one answers to the same word.
    assert names.derive_variants("Foundry Gate tram stop").colloquial == "Lyvarna"
    # And one nobody wrote down falls back to the rule locals follow.
    assert names.derive_variants("Quarry Lane").colloquial == "Kamianka"
    assert names.derive_variants("Nowhere Bridge").colloquial == "Nowhere"


def test_abbreviation_is_mechanical() -> None:
    """The variant that *is* a function of the official name."""
    assert names.derive_variants("Mill Street").abbreviated == "Mill St"
    assert names.derive_variants("West Terminus").abbreviated == "West Term"
    assert names.derive_variants("Linden Park").abbreviated == "Linden Pk"
