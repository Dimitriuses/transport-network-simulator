"""Generating a transport network: sites, quays, lines and demand.

Specification: ROADMAP.md P1M2, CORECONCEPT.md §2, PHASES.md.

`PHASES.md` says the generator's specification is *whatever we find ourselves
doing by hand*, and Phase 0 spent ten milestones finding out. The hand-built
city is not an arbitrary graph that happened to work; it is six structural roles
that each exist for a measured reason, and this generates those roles rather
than a graph:

  hub with several quays   Site/Quay granularity has to be real from the start
                           (DATA-MODEL.md §2), and it is what makes some
                           transfers free and others a walk. It is also the only
                           thing that lets `A-granularity` be placed at all
                           (KNOWN-ISSUES.md #30).
  radial lines             through the hub, alternating stands, so a transfer
                           between two of them is free or a walk depending on
                           which pair.
  an orbital               that never touches the hub, and is the only link
                           between two arms. Journeys between them either wait
                           for it or cross the city. **It belongs to operator B,
                           not to the operator running the radials.**
  chords on operator B     bypassing the hub entirely. **This is the headroom.**
  undeclared interchanges  operator B's stops sit a short walk from operator A's
                           but in *separate Sites*, so nobody has declared them
                           to be the same place. P0 may transfer there, P1 may
                           not, and the difference between those transfer sets
                           is precisely what a player competes for
                           (REFERENCE-POLICY.md §4.1).
  a regional operator      fast, infrequent, terminus to terminus, low reach.

**Remove the fifth and the headroom goes to zero**, and with it any possibility
of a scored journey rewarding integration. That is not a tuning parameter; it is
the reason the world exists.

## Who runs what, and why no operator may dominate

The roles above are a division of labour, not a partition of a single company:

  operator A   star-shaped. Carries people from the centre to the outskirts and
               back, on radials through the hub.
  operator B   the ring and the chords. Connects the ends to each other *without
               going through the centre*, which is exactly the journey operator
               A serves badly.
  operator C   regional, fast, infrequent, terminus to terminus.

**No operator may serve most of the stops.** Real agencies cover their own
region or their own role; none of them covers the city. The first generated
network gave operator A the radials *and* the ring — 44 of 66 line-stops, 67 %
of the network — and the consequence was not merely unrealistic. Conflicts are
placed in proportion to reach, so operator A also collected three quarters of
them, its feed became unusable, and a player who ignored it outscored one who
tried: `null` beat `naive` and Gate 3 failed (`KNOWN-ISSUES.md` #38).

The ring moved to operator B, which is where the role description always put it,
and `max_reach_share` now states the rule and checks it.

---

## Determinism

Coordinates end up in the bundle and the bundle is content-hashed, so the same
rule as `city._flat_metres` applies with more force: **only `+ - * / sqrt`.**
`math.sin` and `math.cos` differ in their last bits between platform libms, and
a site placed one ULP differently changes a walk distance, which changes the
transfer graph, which changes every score.

So arms point along the eight compass directions, whose unit vectors are
`0`, `±1` and `±1/sqrt(2)` — all exactly representable, `sqrt` being IEEE-exact.
Metres become degrees through the same flat-earth constants `city` already uses.
Every coordinate is rounded to six decimals before it is stored, which is the
finest an operator publishes anyway, and puts nine orders of magnitude between
the stored value and any float noise.

Draws come from `Random.random()` alone. `choice`, `shuffle` and `sample` are
helpers whose implementations have changed between CPython releases.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field, replace

from . import names as names_mod
from .city import Line, Quay, Site

#: Degrees of latitude per metre, and the longitude correction at this city's
#: latitude. Identical to `city._flat_metres`, deliberately: a generator that
#: measured distance differently from the query selector would place stops one
#: side of a walking threshold and select journeys on the other.
_M_PER_DEG = 111320.0
_LON_SCALE = 0.64

#: Compass directions as unit vectors, north-first and clockwise.
#:
#: **Built from `sqrt` and nothing else**, so they are the same bits on every
#: machine — which `math.cos(math.radians(45))` would not be, and the content
#: hash is compared across Python builds in CI.
#:
#: **A fan is not a prefix of a compass.** These used to be one tuple of eight
#: and a city of six arms took `_DIRECTIONS[:6]` — N, NE, E, SE, S, SW, which is
#: three quarters of a circle with the west side missing. Worse, the generator
#: pairs arm `a` with arm `a + arms // 2` to make a through line, and in that
#: fan the "opposite" of north is south-east. Nothing noticed because every
#: world ever built had eight arms; `P1M6` gives the rungs different sizes and
#: would have quietly shipped bent cities.
_DIAG = math.sqrt(0.5)  # cos 45
_HALF_ROOT3 = math.sqrt(3.0) / 2.0  # cos 30

_DIRECTION_TABLE: dict[int, tuple[tuple[float, float], ...]] = {
    4: ((1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0)),
    6: (
        (1.0, 0.0),
        (0.5, _HALF_ROOT3),
        (-0.5, _HALF_ROOT3),
        (-1.0, 0.0),
        (-0.5, -_HALF_ROOT3),
        (0.5, -_HALF_ROOT3),
    ),
    8: (
        (1.0, 0.0),
        (_DIAG, _DIAG),
        (0.0, 1.0),
        (-_DIAG, _DIAG),
        (-1.0, 0.0),
        (-_DIAG, -_DIAG),
        (0.0, -1.0),
        (_DIAG, -_DIAG),
    ),
    12: (
        (1.0, 0.0),
        (_HALF_ROOT3, 0.5),
        (0.5, _HALF_ROOT3),
        (0.0, 1.0),
        (-0.5, _HALF_ROOT3),
        (-_HALF_ROOT3, 0.5),
        (-1.0, 0.0),
        (-_HALF_ROOT3, -0.5),
        (-0.5, -_HALF_ROOT3),
        (0.0, -1.0),
        (0.5, -_HALF_ROOT3),
        (_HALF_ROOT3, -0.5),
    ),
}

#: Arm names, one per direction, matching the tables above.
_ARM_NAME_TABLE: dict[int, tuple[str, ...]] = {
    4: ("n", "e", "s", "w"),
    6: ("n", "ne", "se", "s", "sw", "nw"),
    8: ("n", "ne", "e", "se", "s", "sw", "w", "nw"),
    12: (
        "n",
        "nne",
        "ene",
        "e",
        "ese",
        "sse",
        "s",
        "ssw",
        "wsw",
        "w",
        "wnw",
        "nnw",
    ),
}

#: The arm counts a city may have: those whose evenly spaced directions come out
#: of `sqrt` exactly. Adding 10 means writing cos 36 as a surd, which is
#: possible and has not been needed.
_ARM_COUNTS: tuple[int, ...] = tuple(sorted(_DIRECTION_TABLE))

#: Where the centres of a polycentric world sit, relative to each other. Same
#: rule as the arms: `sqrt` only, so the layout is the same bits everywhere.
_CENTRE_DIRECTIONS: dict[int, tuple[tuple[float, float], ...]] = {
    1: ((0.0, 0.0),),
    2: ((1.0, 0.0), (-1.0, 0.0)),
    3: ((1.0, 0.0), (-0.5, _HALF_ROOT3), (-0.5, -_HALF_ROOT3)),
    4: ((1.0, 0.0), (0.0, 1.0), (-1.0, 0.0), (0.0, -1.0)),
}


#: What an operator is for. The roles are a division of labour, not a partition
#: of one company, and the network is built out of them (`KNOWN-ISSUES.md` #38).
#:
#:   radial    the star: centre to outskirts and back, through the hub.
#:   ring      the orbital and the chords, connecting the ends to each other
#:             *without* passing through the centre — and its own stops, a short
#:             walk from the radial operator's. **That walk is the headroom.**
#:   regional  fast, infrequent, terminus to terminus, deliberately low reach.
#:   metro     its own alignment and its own stations, several platforms each,
#:             every few minutes. **Not a bus company with a different name**:
#:             a metro station is a Site with platforms in it, which is what
#:             gives `A-granularity` something real to collapse, and it is
#:             reached on foot from the kerb rather than by sharing it.
#:
#: A world needs at least one radial and one ring or it has no undeclared
#: interchange to find, which is the thing this game is about.
ROLES: tuple[str, ...] = ("radial", "ring", "regional", "metro")


@dataclass(frozen=True)
class OperatorPlan:
    """One operator: who it is, and what it runs.

    **Generated, not named in the source.** Until P1M6 the ids were the string
    literals `nordline`, `ostline` and `sudbahn`, in every world this project
    had ever built. That is why a memorised answer key always resolved: the
    operator it was baked against existed, under that name, everywhere
    (`KNOWN-ISSUES.md` #48).
    """

    id: str
    name: str
    short: str
    dialect: str
    role: str


#: Suffixes that make a transport company's name, by role. Nordline Transit and
#: Sudbahn Regional were hand-written; these are the same shapes, generated.
_ROLE_STYLE: dict[str, tuple[str, str]] = {
    "radial": ("line", "Transit"),
    "ring": ("line", "Tram"),
    "regional": ("bahn", "Regional"),
    "metro": ("", "Metro"),
}

#: Cycled rather than drawn, so a roster of four has four different dialects
#: before it repeats one. Which dialect an operator publishes is texture; that
#: they differ is not.
_DIALECTS: tuple[str, ...] = ("proprietary", "gtfs_like", "legacy")


def plan_operators(
    roster: tuple[str, ...], seed: int, stem_offset: int = 0
) -> tuple[OperatorPlan, ...]:
    """Name a roster of roles.

    Deterministic in `seed`, and distinct: two operators of the same role in one
    world take different stems, so `Lyvarnaline Transit` and `Mlynovaline
    Transit` are two companies rather than one written twice.

    `stem_offset` skips that many stems before starting, which is how a
    polycentric world gives each town its own bus company without two towns
    drawing the same name: the pool is shuffled once from the world's seed and
    each centre takes a different slice of it.
    """
    rng = random.Random(seed ^ 0x0F5E)
    stems = [local for _english, local in names_mod.STEMS]
    # Fisher-Yates over a single `random()` stream, for the reason the module
    # docstring gives.
    for i in range(len(stems) - 1, 0, -1):
        j = int(rng.random() * (i + 1))
        stems[i], stems[j] = stems[j], stems[i]

    out: list[OperatorPlan] = []
    used: set[str] = set()
    for index, role in enumerate(roster):
        if role not in _ROLE_STYLE:
            raise ValueError(f"unknown operator role {role!r}; known: {sorted(_ROLE_STYLE)}")
        suffix, word = _ROLE_STYLE[role]
        stem = stems[(stem_offset + index) % len(stems)]
        # An id is a key, and a stem can be two words — `Pivnichni Vorota`
        # became the operator id `pivnichni vorota`, which is not an id.
        oid = f"{stem}{suffix}".lower().replace(" ", "").replace("'", "")
        if oid in used:
            raise ValueError(f"two operators would share the id {oid!r}")
        used.add(oid)
        out.append(
            OperatorPlan(
                id=oid,
                name=f"{stem}{suffix} {word}",
                short=(stem[:2] + suffix[:1]).upper(),
                dialect=_DIALECTS[index % len(_DIALECTS)],
                role=role,
            )
        )
    return tuple(out)


@dataclass(frozen=True)
class NetworkSpec:
    """What shape of city to build.

    Every field is a lever on difficulty as well as on size, which is why they
    are named rather than buried: `KNOWN-ISSUES.md` #32 needs levers the
    conflict catalogue cannot supply, and where the conflicts sit relative to
    the scored journeys was the dominant factor P0M10 measured.
    """

    #: Radial arms out of the hub. Even, so opposite arms pair into through
    #: lines the way the hand-built city's do.
    arms: int = 8
    #: Sites along each arm, at increasing radius.
    sites_per_arm: int = 4
    #: Quays at the hub. More than one, always: see the module docstring.
    hub_quays: int = 2
    #: Metres between consecutive sites on an arm.
    arm_spacing_m: float = 700.0
    #: Chord lines on the second operator, each bypassing the hub.
    #:
    #: Four rather than two since P1M2: the second operator runs the ring as
    #: well as the chords, and it has to be a real network rather than a
    #: garnish, or the first operator ends up covering most of the city.
    chords: int = 4
    #: How far the second operator's stops sit from the first's. Short enough
    #: to walk, and in a separate Site, so the interchange is real and
    #: undeclared. The hand-built city uses ~60-80 m.
    near_transfer_m: float = 70.0
    #: Lines on the third, regional operator: fast, infrequent, terminus to
    #: terminus, deliberately low reach.
    regional_lines: int = 3
    #: The largest share of line-stops any one operator may serve.
    #:
    #: **A single operator cannot cover most of the stops.** Real agencies cover
    #: their own region or their own role. A world where one does is unrealistic
    #: on its face, and it also breaks the conflict placement that depends on
    #: reach: the dominant operator collects most of the conflicts, its feed
    #: stops being usable, and because it carries most of the network a player
    #: who ignores it outscores one who tries (`KNOWN-ISSUES.md` #38).
    max_reach_share: float = 0.5
    #: Lines on the metro operators, each running through the centre.
    metro_lines: int = 2
    #: How many towns this world is. One is a city; several are a region joined
    #: by rail, which is the *shape* axis rather than the tier
    #: (`src/schema/src/shape.ts`).
    centres: int = 1
    #: Metres between neighbouring centres.
    centre_spacing_m: float = 9000.0
    #: How the towns are joined: "rail", "bus" or "both" (`shape.ts`).
    link: str = "rail"
    #: Which operators this world has, by role, in order.
    #:
    #: **The roster is a tier parameter** (`ROADMAP.md` P1M6): a small town runs
    #: two bus companies, a city runs four and a metro. The ids are generated
    #: from the seed, so two worlds of one rung need not share a single operator
    #: identity — which is what stops a memorised answer key resolving
    #: (`KNOWN-ISSUES.md` #48).
    roster: tuple[str, ...] = ("radial", "ring", "regional")
    #: Each radial line's headway in seconds, cycled over the radials in order,
    #: or `None` to draw it from the seed as the generator used to.
    #:
    #: **A rung always declares it** (`src/schema/src/ladder.ts`,
    #: `KNOWN-ISSUES.md` #61). How often the buses run decides how well a
    #: traveller does without integration, which sizes the prize every score
    #: divides by, and drawn from the city seed it set a rung's difficulty more
    #: than the rung's conflicts did. `None` is for tests, and for measuring
    #: exactly that.
    radial_headways_s: tuple[int, ...] | None = None
    #: The closest two distinct quays may be.
    #:
    #: **Not cosmetic.** `naiveMatchThresholdM` derives the lazy integrator's
    #: stop-matching tolerance from exactly this number - strictly below the
    #: closest genuine pair, so it can never fuse two quays that really are
    #: different places. Let two quays drift to 7 m apart and the tolerance
    #: becomes 6 m, at which point **no operator's published position matches
    #: any other's** and `P2` degenerates into `P1` on nearly every journey.
    #:
    #: The first generated network did that: it placed tram *sites* 70 m from
    #: bus sites and then displaced both *quays* by up to 34 m in independent
    #: random directions, which sometimes cancelled almost the whole gap.
    #: `P1 - P2` came out **negative** - a lazy integration worse than none -
    #: on a network whose headroom was otherwise healthy.
    #:
    #: The hand-authored city sits at 30.9 m, giving a 29 m tolerance.
    min_quay_separation_m: float = 40.0

    def __post_init__(self) -> None:
        if self.arms not in _DIRECTION_TABLE:
            raise ValueError(
                f"arms must be one of {_ARM_COUNTS}, got {self.arms}. Every arm count "
                "needs evenly spaced directions that come out of `sqrt` exactly, or the "
                "content hash stops reproducing across Python builds."
            )
        if self.hub_quays < 2:
            raise ValueError(
                "a hub with one quay makes every transfer free and A-granularity unplaceable"
            )
        if self.sites_per_arm < 3:
            raise ValueError("an arm needs a middle for the orbital and the chords to use")
        if self.radial_headways_s is not None and (
            not self.radial_headways_s or any(h <= 0 for h in self.radial_headways_s)
        ):
            raise ValueError("radial headways must be a non-empty list of positive seconds")


@dataclass(frozen=True)
class Network:
    """A city, in the shape `build.py` already consumes."""

    sites: tuple[Site, ...]
    quays: tuple[Quay, ...]
    lines: tuple[Line, ...]
    #: Every name each entity goes by, keyed by entity id. Empty for the
    #: hand-authored city, whose variants `city.place_names()` supplies.
    names: dict[str, names_mod.PlaceNames] = field(default_factory=dict)
    #: Who runs what. Empty for the hand-authored city, whose three operators
    #: are written down in `city.OPERATORS`.
    operators: tuple[OperatorPlan, ...] = ()


def _offset(lat: float, lon: float, north_m: float, east_m: float) -> tuple[float, float]:
    """Move a point by metres, using only the safe operations.

    Rounded to six decimals — the finest precision any operator publishes, and
    coarse enough that no float noise survives into the bundle.
    """
    return (
        round(lat + north_m / _M_PER_DEG, 6),
        round(lon + east_m / (_M_PER_DEG * _LON_SCALE), 6),
    )


def _arm_names(arms: int) -> tuple[str, ...]:
    return _ARM_NAME_TABLE[arms]


#: How far a boarding point sits from the centre of the station it belongs to.
#:
#: **Never zero.** A Site is a station complex and a Quay is a specific boarding
#: point within it (`DATA-MODEL.md` §2); placing them at identical coordinates
#: makes `A-coordinate-source: site` publish exactly what `quay` publishes, and
#: the defect audit reports it MISS. The first generated network did that for
#: every single-quay site and declared a conflict it did not contain — the third
#: form of `KNOWN-ISSUES.md` #30, and the one that issue's "standing risk"
#: paragraph predicted.
#:
#: It is also simply true of real stations: the centroid is the building, the
#: quay is the kerb, and a bus stop is 10-40 m from the middle of its station.
#: Well inside `C-coordinate-offset`'s 150 m ceiling, which describes the
#: extreme of the same phenomenon at a large interchange.
_QUAY_FROM_SITE_M = (12.0, 34.0)


def _quay_offset(rng: random.Random) -> tuple[float, float]:
    """A small, deterministic displacement of a boarding point from its site."""
    lo, hi = _QUAY_FROM_SITE_M
    north = lo + rng.random() * (hi - lo)
    east = lo + rng.random() * (hi - lo)
    # Sign from a further draw, so stops are not all north-east of their sites.
    if rng.random() < 0.5:
        north = -north
    if rng.random() < 0.5:
        east = -east
    return (north, east)


def check_reach(net: Network, cap: float) -> None:
    """No operator may serve most of the stops (`KNOWN-ISSUES.md` #38).

    **The invariant is about the world, not about a part of it.** A town of a
    polycentric region has two operators, so one of them serves about 58 % of
    *that town* — and 19 % of the region, which is the number that matters.
    Applying the region's cap while each town was still being built refused
    every region it was asked for.
    """
    reach = operator_reach(net)
    total = sum(reach.values()) or 1
    biggest, served = max(reach.items(), key=lambda kv: (kv[1], kv[0]))
    if served / total > cap:
        raise ValueError(
            f"{biggest} serves {served} of {total} line-stops "
            f"({100 * served / total:.0f} %), over the {100 * cap:.0f} % "
            f"maximum. A single operator cannot cover most of the stops, and one that "
            f"does also collects most of the conflicts (see KNOWN-ISSUES.md #38)."
        )


def _prefixed(net: Network, prefix: str) -> Network:
    """The same town, with every id namespaced.

    Three towns generated by the same code would otherwise all contain
    `site-hub` and `line-1`. Renaming afterwards rather than threading a prefix
    through three hundred lines of construction: the ids are data, and a pure
    rename over the finished network cannot get the geometry wrong.
    """
    q = lambda x: f"{prefix}{x}"  # noqa: E731 - a local alias, not a policy
    naming = {q(k): v for k, v in net.names.items()}
    # Operators keep their own names: a town's bus company is not "c2-Ostline".
    for op in net.operators:
        if op.id in net.names:
            naming[op.id] = net.names[op.id]
    return Network(
        sites=tuple(Site(q(s.id), s.name, s.lat, s.lon) for s in net.sites),
        quays=tuple(Quay(q(x.id), q(x.site_id), x.name, x.lat, x.lon) for x in net.quays),
        lines=tuple(
            Line(
                q(ln.id),
                ln.name,
                ln.operator,
                tuple(q(x) for x in ln.quays),
                ln.first_departure_s,
                ln.last_departure_s,
                ln.headway_s,
                ln.speed_mps,
                ln.dwell_s,
            )
            for ln in net.lines
        ),
        names=naming,
        operators=net.operators,
    )


#: Roles a town runs for itself.
#:
#: A bus company and a tram, and that is all: the railway that joins the towns
#: up belongs to the region rather than to any of them, and **a metro belongs to
#: a city**. Giving every town of a region the whole roster of the city on the
#: same rung produced thirteen operators for one world, which is not a region,
#: it is a bookkeeping exercise.
_LOCAL_ROLES: tuple[str, ...] = ("radial", "ring")


def _polycentric(
    spec: NetworkSpec,
    seed: int,
    hub_lat: float,
    hub_lon: float,
) -> Network:
    """Several towns, each with its own operators, joined by rail.

    **The shape axis, not a rung** (`src/schema/src/shape.ts`): a region is a
    different problem from a city rather than a harder one. What makes it a
    problem at all is that the rail between towns is infrequent, so a
    connection missed is forty minutes lost — which is exactly the journey an
    integration layer is for, and exactly the journey a lazy one ruins.
    """
    directions = _CENTRE_DIRECTIONS[spec.centres]
    # Each role once: a town has *a* bus company, however many the city of this
    # rung runs.
    local_roles = tuple(dict.fromkeys(r for r in spec.roster if r in _LOCAL_ROLES))
    if not local_roles:
        raise ValueError(f"roster {spec.roster!r} gives a town nothing to run")

    # **The biggest town gets the metro, if this rung has one.** A region whose
    # every town had an underground would not be a region of towns.
    has_metro = "metro" in spec.roster

    def roster_for(c: int) -> tuple[str, ...]:
        return (*local_roles, "metro") if (c == 0 and has_metro) else local_roles

    offsets: list[int] = []
    running = 0
    for c in range(spec.centres):
        offsets.append(running)
        running += len(roster_for(c))
    rail_offset = running

    # Each town is a small city built by the same code, then namespaced.
    town_spec = replace(
        spec,
        centres=1,
        # Checked on the finished region instead: see `check_reach`.
        max_reach_share=1.0,
        arms=_town_arms(spec.arms, spec.centres),
        roster=local_roles,
        # A town's ring has fewer chords than a city's; it is a smaller place.
        chords=max(2, spec.chords // spec.centres),
        regional_lines=0,
    )

    sites: list[Site] = []
    quays: list[Quay] = []
    lines: list[Line] = []
    naming: dict[str, names_mod.PlaceNames] = {}
    operators: list[OperatorPlan] = []

    for c in range(spec.centres):
        north, east = directions[c]
        clat, clon = _offset(
            hub_lat, hub_lon, north * spec.centre_spacing_m, east * spec.centre_spacing_m
        )
        town = generate_network(
            replace(town_spec, roster=roster_for(c)),
            seed ^ (0xC0FFEE * (c + 1)),
            clat,
            clon,
            stem_offset=offsets[c],
            operator_seed=seed,
        )
        town = _prefixed(town, f"c{c + 1}-")
        sites.extend(town.sites)
        quays.extend(town.quays)
        lines.extend(town.lines)
        naming.update(town.names)
        operators.extend(town.operators)

    # ---- what joins them ---------------------------------------------------
    #
    # **The link is the problem, and its headway is most of it.** A train every
    # forty minutes puts the interchange on the critical path: miss it and the
    # journey is forty minutes longer. A coach every twenty forgives more and
    # asks a different question. Running both asks the hardest one — two ways
    # between the same two towns, two operators, two pictures of one journey.
    #
    # `#51` is why this is a shape rather than a rung: the old top rung was a
    # region, it measured *easier* than the rung below it, and what it was
    # actually for was this variation rather than another step of difficulty.
    modes: tuple[str, ...] = ("rail", "bus") if spec.link == "both" else (spec.link,)
    links: list[OperatorPlan] = []
    for i, mode in enumerate(modes):
        role = "regional" if mode == "rail" else "radial"
        op = plan_operators((role,), seed, stem_offset=rail_offset + i)[0]
        links.append(op)
        operators.append(op)
        naming[op.id] = names_mod.PlaceNames(
            official=op.name, colloquial=op.name.split(" ")[0], abbreviated=op.short
        )

    stops: list[str] = []
    for c in range(spec.centres):
        hub = next(x for x in quays if x.id == f"c{c + 1}-q-hub-a")
        north, east = directions[c]
        # Beside the town's hub, in its own Site: an interchange that no
        # publication declares, which is where this world's headroom is.
        sep = spec.near_transfer_m + 30.0
        lat, lon = _offset(hub.lat, hub.lon, -east * sep, north * sep)
        sid = f"site-rail-{c + 1}"
        near = naming.get(hub.id)
        station = names_mod.PlaceNames(
            official=f"{near.official if near else 'Town'} Central Station",
            colloquial=f"{near.colloquial if near else 'Town'} vokzal",
            abbreviated=f"{near.abbreviated if near else 'T'} Ctl",
        )
        naming[sid] = station
        naming[f"rail-{c + 1}"] = station
        sites.append(Site(sid, station.official, round(lat, 6), round(lon, 6)))
        quays.append(Quay(f"rail-{c + 1}", sid, station.official, lat, lon))
        stops.append(f"rail-{c + 1}")

    #: Per link mode: headway, speed, dwell. A coach is slower, stops longer and
    #: comes more often; a train is the opposite, which is the whole difference
    #: between the two shapes.
    LINK_STYLE = {
        "rail": (40 * 60, 25.0, 60),
        "bus": (20 * 60, 15.0, 90),
    }

    for i, mode in enumerate(modes):
        headway, speed, dwell = LINK_STYLE[mode]
        for r in range(max(1, spec.regional_lines // 2)):
            lines.append(
                Line(
                    f"line-{mode}{i}{r + 1}",
                    f"{'RX' if mode == 'rail' else 'CX'}{r + 1}",
                    links[i].id,
                    tuple(stops if r % 2 == 0 else list(reversed(stops))),
                    6 * 3600,
                    22 * 3600,
                    headway + r * 600,
                    speed,
                    dwell,
                )
            )

    region = Network(tuple(sites), tuple(quays), tuple(lines), naming, tuple(operators))
    check_reach(region, spec.max_reach_share)
    return region


def _town_arms(arms: int, centres: int) -> int:
    """Arms per town, so a region is about the size of a city of its rung.

    A shape is not a difficulty lever, so a polycentric world of a rung should
    hold roughly what the single-centre world of that rung holds — spread over
    several towns rather than concentrated in one.
    """
    wanted = max(4, arms // centres)
    return min(_ARM_COUNTS, key=lambda n: (abs(n - wanted), n))


def generate_network(
    spec: NetworkSpec,
    seed: int,
    hub_lat: float = 50.4502,
    hub_lon: float = 30.5142,
    stem_offset: int = 0,
    operator_seed: int | None = None,
) -> Network:
    """A city with headroom in it, by construction.

    The construction order matters and is not arbitrary: operator A's network is
    laid out first, then operator B's stops are placed *relative to A's* so the
    undeclared interchanges exist. Generating the two independently and hoping
    they land near each other would produce a world with no headroom most of the
    time, and no way to tell which seeds those were.
    """
    if spec.centres > 1:
        return _polycentric(spec, seed, hub_lat, hub_lon)

    rng = random.Random(seed)
    names = _arm_names(spec.arms)
    directions = _DIRECTION_TABLE[spec.arms]

    # Who runs this city. Drawn from their own seeded stream, before anything is
    # laid out, so that adding an arm does not rename the bus company.
    # **One shuffle for the world, sliced per town.** Each centre of a
    # polycentric world builds itself from its own seed, so shuffling the stem
    # pool from that seed made the offsets meaningless: two towns drew
    # `Fontannaline` because their pools were in different orders. The pool is
    # ordered once, from the world's seed, and a town takes the slice its
    # offset names.
    operators = plan_operators(spec.roster, operator_seed or seed, stem_offset)
    by_role: dict[str, list[OperatorPlan]] = {}
    for op in operators:
        by_role.setdefault(op.role, []).append(op)
    if not by_role.get("radial") or not by_role.get("ring"):
        raise ValueError(
            f"roster {spec.roster!r} has no radial or no ring operator: a world without "
            "both has no undeclared interchange to find"
        )
    radials = by_role["radial"]
    rings = by_role["ring"]
    regionals = by_role.get("regional", [])
    metros = by_role.get("metro", [])

    # Real names, and the several forms each place goes by. Drawn up front from
    # their own seeded stream so that adding a line does not rename the city
    # (ROADMAP.md P1M3).
    #
    # Sized generously: every site takes one, and the count is bounded by the
    # arms, their length, the tram stops beside them and the regional stations.
    wanted = 1 + spec.arms * spec.sites_per_arm * 2 + spec.regional_lines * 3 + 4
    pool = names_mod.generate_place_names(wanted, seed ^ 0x5EED)
    naming: dict[str, names_mod.PlaceNames] = {}
    taken = 0

    def name_for(entity_id: str) -> names_mod.PlaceNames:
        """The next unused set of names, remembered against this entity."""
        nonlocal taken
        chosen = pool[taken % len(pool)]
        taken += 1
        naming[entity_id] = chosen
        return chosen

    sites: list[Site] = []
    quays: list[Quay] = []

    # ---- the hub ----------------------------------------------------------
    hub_names = name_for("site-hub")
    sites.append(Site("site-hub", hub_names.official, round(hub_lat, 6), round(hub_lon, 6)))
    stands = "abcdefgh"
    for i in range(spec.hub_quays):
        # Stands spaced by a *stated* distance, not a random one: they are the
        # closest pair of distinct quays in most cities this generates, and that
        # pair sets the lazy integrator's matching tolerance. None sits on the
        # square's centroid, which is what `A-coordinate-source` publishes.
        # Comfortably above the minimum rather than exactly on it: coordinates
        # are rounded to six decimals, and a pair placed on the boundary lands
        # a fraction under it. Fifty-five metres between stands is also simply
        # what a two-stand interchange looks like.
        step = spec.min_quay_separation_m + 15.0
        lat, lon = _offset(hub_lat, hub_lon, 18.0 + step * i, 18.0)
        stand = stands[i].upper()
        # Both stands are one place to anybody who catches a bus there, so they
        # share a colloquial name and collapse onto it. That collision is the
        # reconciliation problem, not a flaw.
        naming[f"q-hub-{stands[i]}"] = names_mod.PlaceNames(
            official=f"{hub_names.official}, stand {stand}",
            colloquial=hub_names.colloquial,
            abbreviated=f"{hub_names.abbreviated} {stand}",
            former=hub_names.former,
        )
        quays.append(
            Quay(
                f"q-hub-{stands[i]}",
                "site-hub",
                f"{hub_names.official}, stand {stand}",
                lat,
                lon,
            )
        )

    # ---- radial arms ------------------------------------------------------
    for a in range(spec.arms):
        north, east = directions[a]
        for j in range(spec.sites_per_arm):
            radius = spec.arm_spacing_m * (j + 1)
            lat, lon = _offset(hub_lat, hub_lon, north * radius, east * radius)
            sid = f"site-{names[a]}{j + 1}"
            place = name_for(sid)
            sites.append(Site(sid, place.official, lat, lon))
            qlat, qlon = _offset(lat, lon, *_quay_offset(rng))
            # The quay is the same place as its site, so it answers to the same
            # names. Only a multi-stand site distinguishes them.
            naming[f"q-{names[a]}{j + 1}"] = place
            quays.append(Quay(f"q-{names[a]}{j + 1}", sid, place.official, qlat, qlon))

    # ---- operator A: radials through the hub, alternating stands ----------
    lines: list[Line] = []

    def outward(a: int) -> list[str]:
        """An arm's quays, hub-end first."""
        return [f"q-{names[a]}{j + 1}" for j in range(spec.sites_per_arm)]

    half = spec.arms // 2
    for a in range(half):
        opposite = a + half
        # Alternating stands is what makes some transfers free and others a
        # walk. With every radial on one stand, every interchange is free and
        # the Site/Quay distinction stops being worth modelling.
        stand = stands[a % spec.hub_quays]
        route = (*reversed(outward(a)), f"q-hub-{stand}", *outward(opposite))
        # **Declared by the rung, and the draw still spent** (`KNOWN-ISSUES.md`
        # #61). The city seed used to choose this, and the choice moved a rung's
        # difficulty more than its conflicts did. Spending the draw anyway keeps
        # every position, name and later draw in the city what it was, so the
        # declaration changes the timetable and nothing else.
        drawn = 15 * 60 + int(rng.random() * 4) * 300
        headway = (
            spec.radial_headways_s[a % len(spec.radial_headways_s)]
            if spec.radial_headways_s
            else drawn
        )
        # **Dealt round, not split down the middle.** Two bus companies in one
        # town do not each take a contiguous half of the compass; they
        # interleave, which is also what keeps either from owning a whole
        # quarter of the city and tripping `max_reach_share`.
        lines.append(
            Line(
                f"line-{a + 1}",
                str(a + 1),
                radials[a % len(radials)].id,
                route,
                6 * 3600,
                22 * 3600,
                headway,
                7.5,
                30,
            )
        )

    # ---- operator B: the ring that never touches the hub -------------------
    #
    # **Operator B's, not operator A's.** Connecting the ends to each other
    # without going through the centre is precisely the journey a star-shaped
    # operator serves badly, and in a real city it is a different company's
    # business. Giving it to the radial operator was what pushed that operator
    # to 67 % of the network (`KNOWN-ISSUES.md` #38).
    #
    # It runs on operator A's quays, though: a ring bus calls at the same kerb.
    # That is a declared interchange and costs nothing to discover — the
    # undeclared ones are operator B's *own* stops, placed below.
    mid = spec.sites_per_arm // 2
    orbital = tuple(f"q-{names[a]}{mid + 1}" for a in range(spec.arms))
    lines.append(
        Line("line-orbital", "O", rings[0].id, orbital, 6 * 3600, 22 * 3600, 24 * 60, 7.5, 30)
    )

    # ---- operator B: its own sites, a short walk from A's ------------------
    #
    # **The headroom.** Separate Sites, so no publication says these are the
    # same place as the bus stops beside them. P0 may transfer here; P1 may not.
    tram_at: list[str] = []
    for a in range(spec.arms):
        for j in (mid, mid + 1):
            if j >= spec.sites_per_arm:
                continue
            base = next(q for q in quays if q.id == f"q-{names[a]}{j + 1}")
            # **Placed relative to the bus *quay*, not the bus *site*.** The
            # distance that matters is quay to quay: it is the walk a player
            # discovers, and it is what sets the matching tolerance. Measuring
            # it from the site and then displacing both quays independently is
            # how the first generated network produced a 7 m pair.
            north, east = directions[a]
            qlat, qlon = _offset(
                base.lat, base.lon, -east * spec.near_transfer_m, north * spec.near_transfer_m
            )
            # The station centroid sits near its own boarding point, so
            # `A-coordinate-source` has something to publish.
            slat, slon = _offset(qlat, qlon, *_quay_offset(rng))
            sid = f"site-t-{names[a]}{j + 1}"
            # **Named after the place it is beside, and known by the same word.**
            # The tram stop is a separate Site — nobody declared it to be the bus
            # stop — but locals call both by the street's name. So an operator
            # publishing colloquially gives two undeclared-interchange quays the
            # *same* published name, which is a clue a player can use and an
            # ambiguity a careless one is caught by.
            near = naming[base.id]
            place = names_mod.PlaceNames(
                official=f"{near.official} tram stop",
                colloquial=near.colloquial,
                abbreviated=f"{near.abbreviated} tram",
                former=near.former,
            )
            naming[sid] = place
            naming[f"t-{names[a]}{j + 1}"] = place
            sites.append(Site(sid, place.official, slat, slon))
            quays.append(Quay(f"t-{names[a]}{j + 1}", sid, place.official, qlat, qlon))
            tram_at.append(f"t-{names[a]}{j + 1}")

    # Chords: arcs across the city that never touch the hub, so knowing one
    # exists is worth several minutes. Each starts on a different arm and runs
    # at a different radius, so two chords are two routes rather than the same
    # ring twice — which is what a naive stride produced first, and it made the
    # second tram line worth nothing.
    span = max(3, spec.arms // 2 + 1)
    for c in range(spec.chords):
        ring = mid + (c % 2)
        if ring >= spec.sites_per_arm:
            ring = mid
        start = (c * (spec.arms // max(1, spec.chords))) % spec.arms
        chord: list[str] = []
        for k in range(span):
            q = f"t-{names[(start + k) % spec.arms]}{ring + 1}"
            if q in tram_at and q not in chord:
                chord.append(q)
        if len(chord) < 3:
            continue
        lines.append(
            Line(
                f"line-t{c + 1}",
                f"T{c + 1}",
                rings[c % len(rings)].id,
                tuple(chord),
                6 * 3600,
                22 * 3600,
                8 * 60 + c * 120,
                12.0,
                20,
            )
        )

    # One tram line *does* call at the hub, so operator B is legitimately
    # reachable without an undeclared transfer. Without it a player who never
    # discovers the near-interchanges cannot use the tram at all, and the
    # headroom stops being a gain and becomes a wall.
    hub_tram_lat, hub_tram_lon = _offset(
        hub_lat, hub_lon, -spec.near_transfer_m, spec.near_transfer_m
    )
    _sl, _so = _offset(hub_tram_lat, hub_tram_lon, *_quay_offset(rng))
    hub_tram = names_mod.PlaceNames(
        official=f"{hub_names.official} tram stop",
        colloquial=hub_names.colloquial,
        abbreviated=f"{hub_names.abbreviated} tram",
        former=hub_names.former,
    )
    naming["site-t-hub"] = hub_tram
    naming["t-hub"] = hub_tram
    sites.append(Site("site-t-hub", hub_tram.official, _sl, _so))
    quays.append(Quay("t-hub", "site-t-hub", hub_tram.official, hub_tram_lat, hub_tram_lon))
    spur = (tram_at[1], "t-hub", tram_at[len(tram_at) // 2 + 1])
    lines.append(Line("line-t0", "T0", rings[0].id, spur, 6 * 3600, 22 * 3600, 10 * 60, 12.0, 20))

    # ---- the metro: its own alignment, its own platforms -------------------
    #
    # **A station, not a stop.** Every metro Site holds two platforms a stated
    # distance apart, which is the one structure in this generator that makes
    # `A-granularity` worth declaring: an operator publishing at Site
    # granularity collapses them onto one point, and a player has to work out
    # that "the station" and "the platform a train leaves from" are different
    # things (`DATA-MODEL.md` §2).
    #
    # It is reached *on foot* from the bus kerb and sits in its own Site, so the
    # interchange is real and undeclared — the same construction the ring
    # operator's stops use, on the other side of the street so the two do not
    # crowd each other.
    if metros:
        mid_r = spec.sites_per_arm // 2
        metro_hub_quays: list[str] = []
        hub_site = "site-m-hub"
        hub_place = names_mod.PlaceNames(
            official=f"{hub_names.official} Underground",
            colloquial=hub_names.colloquial,
            abbreviated=f"{hub_names.abbreviated} U",
        )
        naming[hub_site] = hub_place
        # **Its own corner of the interchange.** The bus stands sit just
        # north-east of the centre and the regional platforms just south-west,
        # so the underground takes the south-east — far enough that no metro
        # platform lands inside `min_quay_separation_m` of a bus stand, which
        # is the invariant the lazy integrator's matching tolerance is derived
        # from. Placed at 40 m it produced a 22 m pair and the generator said so.
        corner = spec.near_transfer_m + 40.0
        mlat, mlon = _offset(hub_lat, hub_lon, -corner, corner)
        sites.append(Site(hub_site, hub_place.official, round(mlat, 6), round(mlon, 6)))
        for k in range(2):
            step = spec.min_quay_separation_m + 15.0
            qlat, qlon = _offset(mlat, mlon, step * k, 0.0)
            qid = f"m-hub-{k + 1}"
            naming[qid] = names_mod.PlaceNames(
                official=f"{hub_place.official}, platform {k + 1}",
                colloquial=hub_place.colloquial,
                abbreviated=f"{hub_place.abbreviated}{k + 1}",
            )
            quays.append(Quay(qid, hub_site, naming[qid].official, qlat, qlon))
            metro_hub_quays.append(qid)

        def metro_station(arm: int, j: int) -> str:
            """A two-platform station beside the bus quay on this arm."""
            sid = f"site-m-{names[arm]}{j + 1}"
            first = f"m-{names[arm]}{j + 1}-1"
            if any(x.id == sid for x in sites):
                return first
            base = next(q for q in quays if q.id == f"q-{names[arm]}{j + 1}")
            north, east = directions[arm]
            # The other side of the road from the tram stops, which sit at
            # `-east, +north`. Two structures a short walk from one kerb must
            # not be a short walk from each other as well.
            reach = spec.near_transfer_m + 20.0
            slat, slon = _offset(base.lat, base.lon, east * reach, -north * reach)
            near = naming[base.id]
            station = names_mod.PlaceNames(
                official=f"{near.official} Underground",
                colloquial=near.colloquial,
                abbreviated=f"{near.abbreviated} U",
                former=near.former,
            )
            naming[sid] = station
            _cl, _co = _offset(slat, slon, *_quay_offset(rng))
            sites.append(Site(sid, station.official, _cl, _co))
            for k in range(2):
                # **Platforms run along the track, not across it.** Stepping
                # them due north put the second platform of a westward arm
                # back beside the bus quay the station was displaced away
                # from — 35 m, under the separation minimum, and the
                # generator refused the world. Along the arm the distance to
                # the kerb is `sqrt(reach^2 + step^2)`, which is at least the
                # reach whichever way the arm points.
                step = spec.min_quay_separation_m + 15.0
                qlat, qlon = _offset(slat, slon, north * step * k, east * step * k)
                qid = f"m-{names[arm]}{j + 1}-{k + 1}"
                naming[qid] = names_mod.PlaceNames(
                    official=f"{station.official}, platform {k + 1}",
                    colloquial=station.colloquial,
                    abbreviated=f"{station.abbreviated}{k + 1}",
                )
                quays.append(Quay(qid, sid, naming[qid].official, qlat, qlon))
            return first

        for m in range(spec.metro_lines):
            a = (m * 2) % half
            opposite = a + half
            inner = [j for j in range(min(mid_r + 1, spec.sites_per_arm))]
            route = [metro_station(a, j) for j in reversed(inner)]
            route.append(metro_hub_quays[m % len(metro_hub_quays)])
            route.extend(metro_station(opposite, j) for j in inner)
            if len(route) < 3:
                continue
            lines.append(
                Line(
                    f"line-m{m + 1}",
                    f"M{m + 1}",
                    metros[m % len(metros)].id,
                    tuple(route),
                    5 * 3600 + 1800,
                    23 * 3600,
                    # Every four minutes: missing one costs a passenger very
                    # little, which is exactly what makes a metro worth
                    # modelling separately from a bus that comes twice an hour.
                    4 * 60,
                    14.0,
                    25,
                )
            )

    # ---- operator C: regional, fast, infrequent, low reach ----------------
    for r in range(spec.regional_lines if regionals else 0):
        a = r % half
        opposite = a + half
        far = spec.sites_per_arm
        rq = f"r-hub-{r + 1}"
        gap = spec.min_quay_separation_m
        lat, lon = _offset(hub_lat, hub_lon, -gap * (r + 2), -gap * (r + 1))
        _rl, _ro = _offset(lat, lon, *_quay_offset(rng))
        platform = names_mod.PlaceNames(
            official=f"{hub_names.official} Station, platform {r + 1}",
            colloquial=f"{hub_names.colloquial} vokzal",
            abbreviated=f"{hub_names.abbreviated} Stn {r + 1}",
        )
        naming[f"site-r-hub-{r + 1}"] = platform
        naming[rq] = platform
        sites.append(Site(f"site-r-hub-{r + 1}", platform.official, _rl, _ro))
        quays.append(Quay(rq, f"site-r-hub-{r + 1}", platform.official, lat, lon))

        ends: list[str] = []
        for arm in (a, opposite):
            base = next(q for q in quays if q.id == f"q-{names[arm]}{far}")
            north, east = directions[arm]
            sep = spec.min_quay_separation_m + 20.0
            lat, lon = _offset(base.lat, base.lon, east * sep, -north * sep)
            sid = f"site-r-{names[arm]}"
            if not any(s.id == sid for s in sites):
                _sl, _so = _offset(lat, lon, *_quay_offset(rng))
                near = naming[base.id]
                station = names_mod.PlaceNames(
                    official=f"{near.official} Station",
                    colloquial=f"{near.colloquial} vokzal",
                    abbreviated=f"{near.abbreviated} Stn",
                    former=near.former,
                )
                naming[sid] = station
                naming[f"r-{names[arm]}"] = station
                sites.append(Site(sid, station.official, _sl, _so))
                quays.append(Quay(f"r-{names[arm]}", sid, station.official, lat, lon))
            ends.append(f"r-{names[arm]}")

        lines.append(
            Line(
                f"line-r{r + 1}",
                f"R{r + 1}",
                regionals[r % len(regionals)].id,
                (ends[0], rq, ends[1]),
                6 * 3600,
                22 * 3600,
                30 * 60 + r * 600,
                20.0,
                45,
            )
        )

    # Lines answer to a number and to what people call the route.
    for line in lines:
        naming[line.id] = names_mod.PlaceNames(
            official=line.name,
            colloquial=line.name,
            abbreviated=line.name,
        )
    # An operator is a place a passenger names too, so it carries the same
    # three forms as anything else. Generated with the roster rather than looked
    # up: `OPERATOR_NAMES` knows the hand-authored city's three companies and
    # nothing about a generated one's (`KNOWN-ISSUES.md` #39, in a new place).
    for op in operators:
        naming[op.id] = names_mod.PlaceNames(
            official=op.name,
            colloquial=op.name.split(" ")[0],
            abbreviated=op.short,
        )

    net = Network(tuple(sites), tuple(quays), tuple(lines), naming, operators)

    # **Checked, not assumed.** This one number decides whether the lazy
    # integrator can match anything at all, and a spec that violates it produces
    # a world where `P1 - P2` is negative for a reason nothing else reports.
    # Failing loudly here beats discovering it in a calibration two steps later.
    check_reach(net, spec.max_reach_share)

    closest, pair = closest_quays(net)
    if closest < spec.min_quay_separation_m:
        raise ValueError(
            f"quays {pair[0]} and {pair[1]} are {closest:.1f} m apart, under the "
            f"{spec.min_quay_separation_m:.0f} m minimum. The lazy integrator matching "
            f"tolerance is derived from this pair, so a world like this one cannot be "
            f"reconciled by geometry at all (see NetworkSpec.min_quay_separation_m)."
        )
    return net


def closest_quays(net: Network) -> tuple[float, tuple[str, str]]:
    """The two nearest distinct quays, and how far apart they are.

    Reported rather than merely compared, because when this trips the useful
    question is immediately *which two* - and they are usually a pair the
    generator placed relative to each other.
    """
    closest, pair = float("inf"), ("", "")
    for i, a in enumerate(net.quays):
        for b in net.quays[i + 1 :]:
            d = flat_metres(a.lat, a.lon, b.lat, b.lon)
            if d < closest:
                closest, pair = d, (a.id, b.id)
    return closest, pair


def operator_reach(net: Network) -> dict[str, int]:
    """Line-stops served, per operator.

    **Coverage, not frequency.** P0M10 measured both and found coverage decides
    whether a conflict lands on a journey's critical path: trips per day were
    balanced 44/40/17 across the three operators while line-stops were 39/10/9,
    and every conflict bit hardest on the operator with the line-stops.
    """
    reach: dict[str, int] = {}
    for line in net.lines:
        reach[line.operator] = reach.get(line.operator, 0) + len(line.quays)
    return reach


def operator_collapsible_sites(net: Network) -> dict[str, int]:
    """Sites where an operator serves several quays *of its own*.

    A conflict an operator cannot express is a conflict the world declares and
    does not have (`KNOWN-ISSUES.md` #30). The site merely *having* several
    quays is not enough: the projection groups only the quays this operator
    serves, so an operator calling at one platform of a four-platform
    interchange publishes the same thing at either granularity.
    """
    quay_site = {q.id: q.site_id for q in net.quays}
    served: dict[str, dict[str, set[str]]] = {}
    for line in net.lines:
        for q in line.quays:
            site = quay_site.get(q)
            if site is None:
                continue
            served.setdefault(line.operator, {}).setdefault(site, set()).add(q)
    return {
        op: sum(1 for quays in sites.values() if len(quays) > 1) for op, sites in served.items()
    }


def flat_metres(alat: float, alon: float, blat: float, blon: float) -> float:
    """Distance using only `+ - * / sqrt`. Identical to `city._flat_metres`."""
    dy = (alat - blat) * _M_PER_DEG
    dx = (alon - blon) * _M_PER_DEG * _LON_SCALE
    return (dx * dx + dy * dy) ** 0.5


def undeclared_interchanges(
    net: Network, max_walk_m: float = 400.0
) -> list[tuple[str, str, float]]:
    """Pairs of quays a walk apart that no publication calls the same place.

    **This is the headroom, enumerated.** `P0` may transfer between these; the
    reference policy may not, because it is held to declared interchanges only
    (`REFERENCE-POLICY.md` §4.1). Where the two transfer graphs agree there is
    nothing for integration to win, and a query set drawn over such a network
    measures risk appetite rather than skill (`KNOWN-ISSUES.md` #26).

    Returned rather than counted so a generator can be checked on *which* ones
    it produced, not merely how many.
    """
    out: list[tuple[str, str, float]] = []
    for i, a in enumerate(net.quays):
        for b in net.quays[i + 1 :]:
            if a.site_id == b.site_id:
                continue
            metres = flat_metres(a.lat, a.lon, b.lat, b.lon)
            if metres <= max_walk_m:
                out.append((a.id, b.id, metres))
    return sorted(out, key=lambda r: (r[0], r[1]))


#: Candidate journeys to consider before filtering. Sized so that one traveller
#: changing outcome is worth well under the 0.2 of headline Gate 3 must decide
#: — P0M9's exit condition rather than a round number.
CANDIDATE_QUERIES = 900
DEPARTURES_PER_PAIR = 3


def generate_queries(
    net: Network,
    target: int = CANDIDATE_QUERIES,
    min_separation_m: float = 1500.0,
    departures_per_pair: int = DEPARTURES_PER_PAIR,
    max_walk_m: float = 400.0,
    scored_ids: frozenset[str] | None = None,
) -> tuple[tuple[str, float, float, float, float, int], ...]:
    """Candidate origin-destination pairs over a generated city.

    **These are candidates, not the scored set**, and the distinction cost two
    milestones to learn. P0M9 took every Site pair 1500 m apart and found that
    on 88 % of them the restricted and unrestricted transfer graphs give the
    same answer: nothing for integration to win, and every extra leg a player
    takes is exposure to a cancellation nobody announced. The competent
    reference solution scored *below* the naive one for that reason alone
    (`KNOWN-ISSUES.md` #26).

    So a large pool is generated here and `scored_ids` narrows it to those that
    test something. That selection needs the router and therefore cannot happen
    in Python — see `npm run headroom` and `scripts/generate-world.mjs`.

    Systematic, not random: every ordered pair of Sites far enough apart to need
    the network, at a fixed stride. A seeded sample would be reproducible too,
    but this is *inspectable* — the set can be derived by hand from the city and
    no seed has to be trusted.
    """
    # An endpoint is a street address near a Site, not the stop itself, so the
    # access walk at both ends is charged (P0M1's teleport).
    points = tuple((s.id, s.lat + 0.00008, s.lon + 0.00008) for s in net.sites)
    reachable = tuple(
        pt
        for pt in points
        if any(flat_metres(pt[1], pt[2], q.lat, q.lon) <= max_walk_m for q in net.quays)
    )

    pairs: list[tuple[str, str, float, float, float, float]] = []
    for oid, olat, olon in reachable:
        for did, dlat, dlon in reachable:
            if oid == did:
                continue
            if flat_metres(olat, olon, dlat, dlon) < min_separation_m:
                continue
            pairs.append((oid, did, olat, olon, dlat, dlon))
    pairs.sort(key=lambda r: (r[0], r[1]))

    stride = max(1, len(pairs) // max(1, target // departures_per_pair))
    chosen = [pair for pair in pairs[::stride] for _ in range(departures_per_pair)][:target]

    out: list[tuple[str, float, float, float, float, int]] = []
    for k, (_oid, _did, olat, olon, dlat, dlon) in enumerate(chosen):
        # Spread departures across the working day. The stride is coprime with
        # the window so the times do not clump on a headway boundary, which
        # would make every traveller wait the same amount and hide exactly the
        # variation the extra travellers are here to provide.
        depart = 7 * 3600 + (k * 1237) % (11 * 3600)
        qid = f"g{k:03d}"
        if scored_ids is not None and qid not in scored_ids:
            continue
        out.append((qid, olat, olon, dlat, dlon, depart - depart % 60))
    return tuple(out)


#: How much of the scored set should be journeys integration can improve.
#:
#: **Not 100 %, deliberately.** A set where every journey needs integration
#: would not notice a solution that breaks the easy ones, and the tier ladder
#: needs somewhere for a world to be straightforward. `ROADMAP.md` P1M2 asks for
#: at least 60 %; the rest are journeys where the two transfer policies agree
#: and a good solution should simply not make things worse.
IMPROVABLE_SHARE = 0.7

#: Journeys in the scored set. Sized against the instruments rather than the
#: statistics: at 98 the suite takes minutes, and P0M9 established that
#: resolution scales with traveller count. Two hundred keeps one traveller's
#: outcome worth well under the 0.2 of headline Gate 3 must decide.
SCORED_TARGET = 200


def select_scored(
    improvable: tuple[str, ...],
    flat: tuple[str, ...],
    target: int = SCORED_TARGET,
    improvable_share: float = IMPROVABLE_SHARE,
) -> frozenset[str]:
    """Choose the scored set from a classified candidate pool.

    Takes the *classification*, not the world: the criterion needs the router
    and lives in `npm run headroom`, and a second implementation of it here
    would drift from the first (`CLAUDE.md`). This decides only the mix.

    Deterministic and inspectable — a fixed stride through a sorted list, no
    seed to trust. Two worlds built from the same network get the same scored
    set, which is what makes a generated world reproducible at all.
    """
    want_improvable = min(len(improvable), int(target * improvable_share))
    want_flat = min(len(flat), target - want_improvable)

    def stride(ids: tuple[str, ...], n: int) -> list[str]:
        if n <= 0 or not ids:
            return []
        step = max(1, len(ids) // n)
        return sorted(ids)[::step][:n]

    return frozenset(stride(improvable, want_improvable) + stride(flat, want_flat))
