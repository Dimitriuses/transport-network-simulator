"""Generating per-operator projection manifests.

Specification: ROADMAP.md P1M1, CORECONCEPT.md §2.1 and §7.

The manifest shape is already declarative and already drives every projection,
so this generates configuration rather than inventing a mechanism. What it has
to get right is *which* operator publishes badly and *how* badly — and Phase 0
measured both the hard way.

**Placement matters more than strength.** The committed world put every conflict
on its two smallest operators and left the one running half the city
immaculate. Moving the same fifteen conflicts, at identical settings, onto the
operator that carries the network doubled what they cost. So conflicts are
placed in proportion to how much of the network an operator reaches, not
uniformly (`docs/BUILD-LOG.md`, P0M10).

**Strength has a ceiling that realism sets, not difficulty.** Every value here
comes from the catalogue's `generate` list, which contains only settings two
real operators could differ by. A coordinate offset past ~150 m is a broken map
rather than a disagreement, and no amount of gate pressure may reach for one.

**One operator publishes honestly.** Not for mercy — as a reference point. A
player with nothing to compare against is reading three feeds and cannot tell
which is the odd one out, and Phase 0's competent solution picked its coordinate
frame by consensus for exactly that reason.

Determinism: seeded, and threaded explicitly. Only `Random.random()` is used —
`choice`, `shuffle` and `sample` are helpers whose implementations have changed
between CPython releases, and a world that rebuilds differently on another
machine is worse than no generator at all.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from . import catalogue


@dataclass(frozen=True)
class OperatorSpec:
    """What the network already decided, before any conflict is placed."""

    id: str
    name: str
    dialect: str
    #: How much of the network this operator reaches — line-stops served.
    #: Not trips per day: Phase 0 found coverage, not frequency, decides
    #: whether a conflict lands on a journey's critical path.
    reach: int
    #: Sites where this operator serves more than one of its own quays. Zero
    #: means `A-granularity: site` would change nothing it publishes.
    collapsible_sites: int = 0


#: What the network has to offer before a conflict can show up in the data.
#:
#: **A conflict an operator cannot express is one the world declares and does
#: not have** — the defect audit calls it MISS and the world is quietly easier
#: than its tier says. Phase 0 met this as Sudbahn, whose conflicts expressed
#: nothing at any strength because it reached nine line-stops of fifty-eight;
#: P1M1 met it again as `A-granularity` on an operator that serves one platform
#: per station, where publishing at Site granularity is publishing the same
#: thing.
#:
#: Keyed by conflict, valued by the `OperatorSpec` field that must be non-zero.
REQUIRES: dict[str, str] = {"A-granularity": "collapsible_sites"}


def _expressible(setting: catalogue.Setting, value: object, cat: catalogue.Catalogue) -> bool:
    """Can this *value* show up in the data, given the rest of the world?

    The numeric cousin of `REQUIRES`, and the more insidious of the two.
    `REQUIRES` asks whether an operator can express a conflict at all; this asks
    whether a particular setting of it can, against parameters chosen somewhere
    else entirely.

    **`D-staleness` is the case that forced it.** A feed conceals a disruption
    only when its lag exceeds that disruption's announcement lead. The world
    draws leads from `noticeLeadS`, whose minimum is 300 s; the committed world
    declared staleness of 90 s and 300 s; so neither hid anything, on any
    operator, for the whole of Phase 0 — plausible, declared, audited present,
    and inert. Catalogue D was decorative and the Information family was blamed
    for it (`KNOWN-ISSUES.md` #19).

    Two numbers, each defensible alone, chosen in different files by people who
    never compared them. They are compared here, against one shared value.
    """
    if setting.conflict == "D-staleness":
        return int(value) > cat.policy.notice_lead_min_s
    return True


#: Roughly how many settings each operator departs on, by tier. A tier is a
#: claim about how hard a world is, and the count is the crudest lever on that;
#: `P1M4` replaces these with a measured band.
TIER_DENSITY: dict[int, float] = {0: 0.0, 1: 1.0, 2: 0.55, 3: 0.6, 4: 0.7, 5: 0.8}


def _pick(rng: random.Random, options: tuple[object, ...], bias: float) -> object:
    """Choose from `options`, weakest first, biased towards the stronger end.

    `bias` runs 0 (always the weakest) to 1 (always the strongest). Implemented
    with a single `random()` draw and integer arithmetic, deliberately: see the
    determinism note in the module docstring.
    """
    if not options:
        raise ValueError("no options to pick from")
    draw = rng.random()
    # Skew the uniform draw towards the top of the range as bias rises.
    skewed = draw ** (1.0 - 0.8 * bias) if bias > 0 else draw
    index = int(skewed * len(options))
    return options[min(index, len(options) - 1)]


def _excludes_of(cat: catalogue.Catalogue, conflict: str) -> tuple[str, ...]:
    for s in cat.settings:
        if s.conflict == conflict:
            return s.excludes
    return ()


def generate_manifests(
    operators: tuple[OperatorSpec, ...],
    tier: int,
    seed: int,
) -> tuple[dict, ...]:
    """One manifest per operator, for a world of the requested tier.

    The result is the same shape `city.OPERATORS` holds by hand, so everything
    downstream — the builder, the defect audit, the projections — is unchanged.
    """
    cat = catalogue.load()
    rng = random.Random(seed)
    settings = cat.for_tier(tier)
    density = TIER_DENSITY.get(tier, 0.0)

    # The honest one. Chosen as the *least*-reaching operator, because a clean
    # reference that also carries the network wastes the conflicts: they end up
    # on feeds too small to put them on anybody's critical path, which is
    # precisely the mistake the committed world made until P0M10.
    ranked = sorted(operators, key=lambda o: (-o.reach, o.id))
    reference = ranked[-1].id if len(ranked) > 1 else None

    total_reach = sum(o.reach for o in operators) or 1
    manifests: list[dict] = []

    for op in ranked:
        manifest: dict = {
            "id": op.id,
            "name": op.name,
            "dialect": op.dialect,
            **{group: dict(values) for group, values in cat.defaults().items()},
        }

        placed: set[str] = set()
        if op.id != reference and settings and density > 0:
            # Weighted by reach, so the operator carrying the network carries
            # the conflicts. Normalised against the mean so a two-operator world
            # and a six-operator one get comparable densities.
            share = (op.reach / total_reach) * len(operators)
            for setting in settings:
                if rng.random() > min(1.0, density * share):
                    continue
                # A conflict that masks another wastes it. Exclusion is
                # symmetric, so ask in both directions.
                blocked = any(
                    other in setting.excludes or setting.conflict in _excludes_of(cat, other)
                    for other in placed
                )
                if blocked:
                    continue
                need = REQUIRES.get(setting.conflict)
                if need is not None and getattr(op, need) == 0:
                    continue
                # A stronger world reaches further up each setting's range —
                # but the range itself never leaves what is plausible, and a
                # value that cannot express itself is not in the range at all.
                usable = tuple(v for v in setting.generate if _expressible(setting, v, cat))
                if not usable:
                    continue
                value = _pick(rng, usable, bias=min(1.0, tier / 5.0))
                manifest[setting.group][setting.key] = value
                placed.add(setting.conflict)

        # `prefixed` ids need a prefix, and a bare-int operator must not keep
        # one: the builder reads both, and an inconsistent pair publishes ids
        # that match neither scheme.
        if manifest["identity"]["id_scheme"] == "prefixed":
            manifest["identity"]["prefix"] = op.id[:2].upper()
        else:
            manifest["identity"]["prefix"] = ""

        manifests.append(manifest)

    # Restore the caller's order: downstream code and the content hash should
    # not depend on how this function happened to rank operators.
    by_id = {m["id"]: m for m in manifests}
    return tuple(by_id[o.id] for o in operators)


def describe(manifests: tuple[dict, ...]) -> list[str]:
    """Every departure from honest publishing, as catalogue names."""
    cat = catalogue.load()
    defaults = cat.defaults()
    names = cat.conflict_names()
    out: list[str] = []
    for m in manifests:
        for group, keys in defaults.items():
            for key, default in keys.items():
                if m.get(group, {}).get(key, default) != default:
                    out.append(f"{names[(group, key)]}:{m['id']}")
    return sorted(out)
