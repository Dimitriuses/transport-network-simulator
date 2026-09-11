"""A setting the catalogue keeps and the generator does not draw.

Specification: KNOWN-ISSUES.md #57, decided 2026-09-11.

`B-dst-offset` is realistic, audited and answerable, and `competent` answers it.
It is also in every wall the structural ladder produced, while the top rung
drawn without it was a healthy rung. So it stays in the catalogue — the audit,
the probe and a world built around it on purpose still know it — and leaves the
draw.

**Where the skip sits is the part worth testing.** The generator shuffles each
section's whole pool before placing anything. Filtering the setting out of the
pool would shrink the shuffle, spend less randomness, and re-draw every world
after it; skipping it at placement spends nothing, so a world that drew it gets
the next setting in its section instead, one `random()` for one `random()`.
The last two tests hold the generator to that, on the hand-built city and on
the top rung as the generator really builds it.
"""

from __future__ import annotations

import collections
import dataclasses

import pytest

from worldbuild import catalogue, city, generate

SEEDS = range(40)


def _drawing_tiers() -> tuple[int, ...]:
    """Every rung that draws at least one setting — see `test_generate.py`."""
    return tuple(i for i, r in enumerate(catalogue.load().rungs) if r.sections)


def _specs() -> tuple[generate.OperatorSpec, ...]:
    """The hand-built city's operators, as `test_generate.py` builds them."""
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


def _undrawn(cat: catalogue.Catalogue) -> set[str]:
    return {s.conflict for s in cat.settings if not s.drawn}


def test_the_catalogue_still_holds_what_the_generator_does_not_draw() -> None:
    cat = catalogue.load()
    assert "B-dst-offset" in _undrawn(cat), "the decision of 2026-09-11, stated"
    setting = next(s for s in cat.settings if s.conflict == "B-dst-offset")
    # Undrawn is not the same as empty: the probe still sweeps it and a world
    # built around it still has real values to use.
    assert setting.generate, "an undrawn setting must keep the values it would draw"


def test_an_undrawn_setting_is_never_placed() -> None:
    cat = catalogue.load()
    undrawn = _undrawn(cat)
    for tier in _drawing_tiers():
        for seed in SEEDS:
            for name in generate.describe(generate.generate_manifests(_specs(), tier, seed)):
                assert name.split(":")[0] not in undrawn, (
                    f"tier {tier}, seed {seed} placed {name}, which the catalogue marks "
                    f"drawn: false (KNOWN-ISSUES.md #57)"
                )


def test_switching_the_flag_back_on_changes_only_that_slot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every world differs from its reopened twin only where the setting landed.

    Fails if the skip moves into the pool, because the shuffle would then spend
    different randomness and re-draw unrelated conflicts. And fails if the
    reopened catalogue never draws the setting at all, since a substitution that
    never happens would prove nothing — which is the check that keeps this from
    being a test that cannot fail.
    """
    real = catalogue.load()
    reopened = dataclasses.replace(
        real,
        settings=tuple(
            dataclasses.replace(s, drawn=True) if not s.drawn else s for s in real.settings
        ),
    )
    cases = [(tier, seed) for tier in _drawing_tiers() for seed in SEEDS]

    now = {
        case: sorted(generate.describe(generate.generate_manifests(_specs(), *case)))
        for case in cases
    }

    monkeypatch.setattr(catalogue, "load", lambda: reopened)
    swapped = 0
    for case in cases:
        before = generate.describe(generate.generate_manifests(_specs(), *case))
        expected = sorted(n.replace("B-dst-offset:", "B-time-encoding:") for n in before)
        if expected != sorted(before):
            swapped += 1
        assert now[case] == expected, (
            f"tier {case[0]}, seed {case[1]}: taking B-dst-offset out of the draw changed "
            f"more than its own slot.\n  reopened {sorted(before)}\n  now      {now[case]}"
        )

    assert swapped > 0, (
        "the reopened catalogue never drew B-dst-offset in any case, so the "
        "substitution was never exercised and this comparison proved nothing"
    )


def test_the_substitution_holds_on_a_generated_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """The same claim on the top rung as the generator really builds it.

    The test above runs on the hand-built city, three operators. A generated top
    rung has five, with their own reach and roles, and `_rebalance` moves
    conflicts between them. So the claim is also checked where calibration
    draws it: the city `npm run calibrate:tier` holds fixed, at the six conflict
    seeds it screens. Checked by hand on 2026-09-11, and it held for all six.
    """
    from worldbuild import build, network

    real = catalogue.load()
    reopened = dataclasses.replace(
        real,
        settings=tuple(
            dataclasses.replace(s, drawn=True) if not s.drawn else s for s in real.settings
        ),
    )
    tier = len(real.rungs) - 1
    city_seed = 481516
    net = network.generate_network(build.spec_for_tier(tier, "single-centre"), city_seed)
    seeds = [city_seed + i * 7919 for i in range(6)]

    now = {s: sorted(generate.describe(build.operators_for(tier, s, net))) for s in seeds}
    monkeypatch.setattr(catalogue, "load", lambda: reopened)
    swapped = 0
    for s in seeds:
        before = generate.describe(build.operators_for(tier, s, net))
        expected = sorted(n.replace("B-dst-offset:", "B-time-encoding:") for n in before)
        if expected != sorted(before):
            swapped += 1
        assert now[s] == expected, f"conflict seed {s} changed beyond its B-dst-offset slot"
    assert swapped > 0, "no generated draw carried B-dst-offset, so nothing was compared"
