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


#: Metres per degree of latitude, for turning a published precision into the
#: size of the grid it rounds onto. Same constant the network generator and the
#: query selector use.
_M_PER_DEG = 111320.0


def _precision_quantum_m(precision: object) -> float:
    """How far apart the points a coordinate can land on are, at this precision.

    Three decimal places is a ~111 m grid, four is ~11 m, six is ~0.11 m.
    """
    return _M_PER_DEG / (10 ** int(precision))


#: How far a published site centroid typically sits from the quay it stands for.
#:
#: A property of how `network.py` places quays, measured rather than assumed:
#: the median across a generated city is ~35 m. Used as a *budget*, not a
#: prediction — the displacements are vectors in different directions and
#: partly cancel, so the composed total is smaller than the sum. A budget that
#: assumed the sum would reject combinations that measure fine.
_SITE_SOURCE_BUDGET_M = 40.0


def _geometry_over_budget(
    setting: catalogue.Setting, value: object, manifest: dict, cat: catalogue.Catalogue
) -> bool:
    """Would this setting push the operator's *composed* geometry past the ceiling?

    `C-coordinate-offset`'s plausibility ceiling is 150 m and describes the
    **total** displacement a published position may carry — "a station centroid
    published for a specific quay at a large interchange". The catalogue's
    `generate` list is the offset *alone*, so an operator that also publishes
    site centroids is already spending part of that budget before its offset is
    applied.

    Found at P1M3, when `npm run realism` reported a generated operator at
    **151 m against a 150 m ceiling** — over by a metre, with `source: site`,
    `offset_m: 130` and `precision: 3` all at once. Each inside its own bound;
    the total was not (`KNOWN-ISSUES.md` #29, again, at the margin).
    """
    ceiling = 150.0
    for s in cat.settings:
        if s.conflict == "C-coordinate-offset" and s.plausible_max is not None:
            ceiling = float(s.plausible_max)

    geometry = manifest.get("geometry", {})
    source = value if setting.conflict == "A-coordinate-source" else geometry.get("source", "quay")
    offset = (
        float(value)
        if setting.conflict == "C-coordinate-offset"
        else float(geometry.get("offset_m", 0))
    )
    if source != "site":
        return False
    return offset > ceiling - _SITE_SOURCE_BUDGET_M


def _masked(setting: catalogue.Setting, value: object, manifest: dict) -> bool:
    """Would this setting be invisible next to what the operator already does?

    `excludes` handles the categorical case — a lat/lon swap destroys geometry,
    so nothing subtler under it can be seen. **This is the numeric case**, and
    it is the same failure one level down: a coordinate offset smaller than the
    grid its own published precision rounds onto simply disappears.

    Found at P1M2 by the defect audit, on a world where rebalancing had put a
    60 m offset beside 3-decimal precision: 3 dp is a 111 m grid, the offset
    rounded away, and the audit reported `median 0 m` against a declared 60 m
    (`KNOWN-ISSUES.md` #39).
    """
    geometry = manifest.get("geometry", {})
    if setting.conflict == "C-coordinate-offset":
        return float(value) <= _precision_quantum_m(geometry.get("precision", 6))
    if setting.conflict == "A-coordinate-precision":
        offset = float(geometry.get("offset_m", 0))
        return offset > 0 and offset <= _precision_quantum_m(value)
    return False


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

#: The largest share of a world's conflicts any one operator may carry.
#:
#: **Placement is weighted by reach, and unbounded that becomes a wall.** P0M10
#: measured that moving conflicts onto the operator carrying the network doubled
#: their cost, and this generator turned that into "place them in proportion to
#: reach" — a stronger claim than the measurement supports. The result was one
#: operator holding three quarters of the conflicts: its feed stopped being
#: usable, and since it carried most of the network, a player who ignored it
#: outscored one who tried. `null` beat `naive`, and Gate 3 failed
#: (`KNOWN-ISSUES.md` #38).
#:
#: The hand-authored world, which passes every gate, splits its conflicts 46/46
#: between its largest and smallest operators. Half is that shape stated as a
#: rule rather than a number chosen to make a measurement pass.
#:
#: A conflict over the cap is **moved** to another operator that can express it,
#: not deleted — the tier's density is a separate claim and should not quietly
#: fall because placement was rebalanced.
MAX_CONFLICT_SHARE: float = 0.5


def _quota_for(count: int, share: float) -> int:
    """This operator's share of a section's quota.

    Scaled by reach and rounded, so the operator carrying most of the network
    carries most of the conflicts (P0M10) while the tier's *composition* stays
    fixed. At least one wherever the tier asks for any: a section that the tier
    declares and no operator expresses is a tier that does not mean what it says.
    """
    if count <= 0:
        return 0
    return max(1, int(count * min(1.0, share) + 0.5))


def _in_quota_order(
    settings: tuple[catalogue.Setting, ...],
    wanted: dict[str, int],
    rng: random.Random,
) -> list[catalogue.Setting]:
    """Settings grouped by section, each group in a seeded order.

    The *order within a section* is where the seed still has its say — which
    identity conflict this world uses, rather than how many. Fisher-Yates over a
    single `random()` stream, for the reason `network.py` gives.

    **Semantic settings come before cosmetic ones, and the reason is measured.**
    A tier's quota says how much *difficulty* a world carries, but it counts
    settings and a setting is a setting: when `#43` added two cosmetic entries
    to section A so the bottom rung had something to choose, tiers 2 and 3 lost
    **1.1 and 1.2 semantic conflicts per world** — texture spending a budget
    meant for difficulty, and nothing would have reported it. Ordering the
    section puts the quota on the conflicts that carry the tier and leaves
    texture to `_cosmetic_floor`, which does not draw on the quota at all.

    The consequence worth stating: **the size of the cosmetic pool no longer
    affects difficulty**, so the honest fix for a rung with no variety — more
    texture — can never again make that rung easier.
    """
    by_section: dict[str, list[catalogue.Setting]] = {}
    for setting in settings:
        by_section.setdefault(setting.section, []).append(setting)

    out: list[catalogue.Setting] = []
    for section in sorted(by_section):
        if wanted.get(section, 0) <= 0:
            continue
        pool = by_section[section]
        for i in range(len(pool) - 1, 0, -1):
            j = int(rng.random() * (i + 1))
            pool[i], pool[j] = pool[j], pool[i]
        out.extend(s for s in pool if not s.cosmetic)
        out.extend(s for s in pool if s.cosmetic)
    return out


def _pick(rng: random.Random, options: tuple[object, ...], bias: float) -> object:
    """Choose from `options`, weakest first, biased towards the stronger end.

    `bias` runs 0 (always the weakest) to 1 (always the strongest). Implemented
    with a single `random()` draw and integer arithmetic, deliberately: see the
    determinism note in the module docstring.

    **Pass `bias=0` for a categorical setting**, whose `generate` list holds
    kinds rather than severities. At Tier 5 the bias picks the last entry 92 %
    of the time, which is right for a ladder and wrong for a list of traps: it
    made every top-rung world publish the same time encoding and the same
    cancellation token, and a memorised answer key transferred between two
    Tier-5 worlds because of it (`KNOWN-ISSUES.md` #48). The draw is one
    `random()` either way, so the stream is the same length and a seed still
    reproduces.
    """
    if not options:
        raise ValueError("no options to pick from")
    draw = rng.random()
    # Skew the uniform draw towards the top of the range as bias rises.
    skewed = draw ** (1.0 - 0.8 * bias) if bias > 0 else draw
    index = int(skewed * len(options))
    return options[min(index, len(options) - 1)]


def _bias_for(setting: catalogue.Setting, tier: int) -> float:
    """How hard to lean on the strong end of this setting's values.

    A tier is a claim about *how much* a world departs from publishing honestly,
    so a higher tier reaches further up a ladder — `C-coordinate-offset` runs
    30, 60, 130 metres and 130 is unambiguously worse. A categorical setting has
    no such end to reach for, and pretending otherwise costs variety at exactly
    the rung that has least of it (`KNOWN-ISSUES.md` #48).
    """
    return 0.0 if setting.categorical else min(1.0, tier / 5.0)


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
            # **Exactly the tier's quota from each section, not a coin per
            # setting.** A density controls how *many* conflicts land and not
            # *which*, so two worlds of one tier could differ by the most
            # expensive conflict in the catalogue — one Tier 3 drew a 130 m
            # coordinate offset, another drew no offset at all, and the
            # reference solutions differed by five times the seed-to-seed noise
            # (`KNOWN-ISSUES.md` #42).
            #
            # Reach still decides *who* carries more: the quota is scaled by
            # this operator's share of the network, so the operator running most
            # of the city still takes most of the conflicts — the P0M10 finding
            # this generator was built on — but the *composition* of a tier is
            # now fixed rather than sampled.
            share = (op.reach / total_reach) * len(operators)
            quota = cat.tier_quota.get(tier, {})
            wanted = {section: _quota_for(count, share) for section, count in quota.items()}
            for setting in _in_quota_order(settings, wanted, rng):
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
                usable = tuple(
                    v
                    for v in setting.generate
                    if _expressible(setting, v, cat)
                    and not _masked(setting, v, manifest)
                    and not _geometry_over_budget(setting, v, manifest, cat)
                )
                if not usable:
                    continue
                if wanted.get(setting.section, 0) <= 0:
                    continue
                value = _pick(rng, usable, bias=_bias_for(setting, tier))
                manifest[setting.group][setting.key] = value
                placed.add(setting.conflict)
                wanted[setting.section] = wanted.get(setting.section, 0) - 1

            _cosmetic_floor(manifest, settings, placed, op, cat, rng, tier)

        # `prefixed` ids need a prefix, and a bare-int operator must not keep
        # one: the builder reads both, and an inconsistent pair publishes ids
        # that match neither scheme.
        if manifest["identity"]["id_scheme"] == "prefixed":
            manifest["identity"]["prefix"] = op.id[:2].upper()
        else:
            manifest["identity"]["prefix"] = ""

        manifests.append(manifest)

    _rebalance(manifests, settings, cat, reference, {o.id: o for o in operators})

    # Restore the caller's order: downstream code and the content hash should
    # not depend on how this function happened to rank operators.
    by_id = {m["id"]: m for m in manifests}
    return tuple(by_id[o.id] for o in operators)


def _cosmetic_floor(
    manifest: dict,
    settings: tuple[catalogue.Setting, ...],
    placed: set[str],
    op: OperatorSpec,
    cat: catalogue.Catalogue,
    rng: random.Random,
    tier: int,
) -> None:
    """Every operator that carries conflicts also carries some texture.

    **Texture is not difficulty and must not be paid for out of the difficulty
    budget** — `_in_quota_order` spends the quota on semantic settings first,
    which on its own would leave the higher tiers with no cosmetic variation at
    all: section A's semantic pool is exactly Tier 2's quota. A world where
    every operator formats identifiers alike and spells every place the same way
    is not recognisable as the problem this game is about (`CORECONCEPT.md`
    §2.1), so one cosmetic setting is added outside the quota.

    At most one, and only if the quota did not already place one: this is a
    floor, not a second budget. The reference operator is left alone, because a
    world needs a feed that departs from nothing (`_rebalance`).
    """
    if any(s.cosmetic and s.conflict in placed for s in settings):
        return
    pool = [s for s in settings if s.cosmetic]
    if not pool:
        return
    for i in range(len(pool) - 1, 0, -1):
        j = int(rng.random() * (i + 1))
        pool[i], pool[j] = pool[j], pool[i]
    for setting in pool:
        blocked = any(
            other in setting.excludes or setting.conflict in _excludes_of(cat, other)
            for other in placed
        )
        if blocked:
            continue
        need = REQUIRES.get(setting.conflict)
        if need is not None and getattr(op, need) == 0:
            continue
        usable = tuple(
            v
            for v in setting.generate
            if _expressible(setting, v, cat)
            and not _masked(setting, v, manifest)
            and not _geometry_over_budget(setting, v, manifest, cat)
        )
        if not usable:
            continue
        manifest[setting.group][setting.key] = _pick(rng, usable, bias=_bias_for(setting, tier))
        placed.add(setting.conflict)
        return


def _conflicts_of(
    manifest: dict, settings: tuple[catalogue.Setting, ...]
) -> list[catalogue.Setting]:
    """The settings this operator departs from the default on, in catalogue order."""
    return [s for s in settings if manifest.get(s.group, {}).get(s.key, s.off) != s.off]


def _rebalance(
    manifests: list[dict],
    settings: tuple[catalogue.Setting, ...],
    cat: catalogue.Catalogue,
    reference: str | None,
    specs: dict[str, OperatorSpec],
) -> None:
    """Move conflicts off any operator carrying more than its share.

    See `MAX_CONFLICT_SHARE`. Deterministic throughout: the overloaded operator
    is chosen by count then id, the conflict to move is the first in catalogue
    order that another operator can take, and the receiving operator is the one
    with the fewest conflicts, ties broken by id. No `Random` is consulted —
    rebalancing is a correction, and a correction that depended on the draw
    would make the same world rebalance differently on a different day.
    """
    by_id = {m["id"]: m for m in manifests}

    for _ in range(len(settings) * len(manifests)):
        counts = {m["id"]: len(_conflicts_of(m, settings)) for m in manifests}
        total = sum(counts.values())
        if total == 0:
            return
        worst_id = max(sorted(counts), key=lambda k: counts[k])
        if counts[worst_id] / total <= MAX_CONFLICT_SHARE:
            return

        donor = by_id[worst_id]
        moved = False
        for setting in _conflicts_of(donor, settings):
            value = donor[setting.group][setting.key]
            takers = sorted(
                (
                    m
                    for m in manifests
                    if m["id"] != worst_id
                    and m["id"] != reference
                    and m.get(setting.group, {}).get(setting.key, setting.off) == setting.off
                    and _can_take(m, setting, value, settings, cat, specs)
                ),
                key=lambda m: (counts[m["id"]], m["id"]),
            )
            if not takers:
                continue
            donor[setting.group][setting.key] = setting.off
            takers[0][setting.group][setting.key] = value
            _fix_prefix(donor)
            _fix_prefix(takers[0])
            moved = True
            break

        # Nothing can be moved — every remaining conflict is one no other
        # operator can express or already has. Dropping it would be the wrong
        # trade: an unbalanced world is a worse problem than a slightly thinner
        # one, but a *silently* thinner one is worse than both, so this stops
        # and lets the audit and `npm run fallback` report what is there.
        if not moved:
            return


def _can_take(
    manifest: dict,
    setting: catalogue.Setting,
    value: object,
    settings: tuple[catalogue.Setting, ...],
    cat: catalogue.Catalogue,
    specs: dict[str, OperatorSpec],
) -> bool:
    """Could this operator express this conflict, at this value?

    The same three rules placement obeys — capability, exclusion, and whether
    the value can express itself against the world's other parameters. A
    rebalance that ignored them would move a conflict somewhere it does nothing,
    which is exactly what `KNOWN-ISSUES.md` #30 and #19 are about.
    """
    need = REQUIRES.get(setting.conflict)
    if need is not None and getattr(specs[manifest["id"]], need) == 0:
        return False
    if not _expressible(setting, value, cat):
        return False
    if _masked(setting, value, manifest):
        return False
    if _geometry_over_budget(setting, value, manifest, cat):
        return False
    held = {s.conflict for s in _conflicts_of(manifest, settings)}
    return not any(
        other in setting.excludes or setting.conflict in _excludes_of(cat, other) for other in held
    )


def _fix_prefix(manifest: dict) -> None:
    """`prefixed` ids need a prefix; a bare-int operator must not keep one."""
    if manifest["identity"]["id_scheme"] == "prefixed":
        manifest["identity"]["prefix"] = manifest["id"][:2].upper()
    else:
        manifest["identity"]["prefix"] = ""


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
