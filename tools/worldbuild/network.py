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
                           for it or cross the city.
  a chord on operator B    bypassing the hub entirely. **This is the headroom.**
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
from dataclasses import dataclass

from .city import Line, Quay, Site

#: Degrees of latitude per metre, and the longitude correction at this city's
#: latitude. Identical to `city._flat_metres`, deliberately: a generator that
#: measured distance differently from the query selector would place stops one
#: side of a walking threshold and select journeys on the other.
_M_PER_DEG = 111320.0
_LON_SCALE = 0.64

#: The eight compass directions as unit vectors, north-first and clockwise.
#: `sqrt` is IEEE-exact, so these are the same bits on every machine — which
#: `math.cos(math.radians(45))` would not be.
_DIAG = math.sqrt(0.5)
_DIRECTIONS: tuple[tuple[float, float], ...] = (
    (1.0, 0.0),  # N
    (_DIAG, _DIAG),  # NE
    (0.0, 1.0),  # E
    (-_DIAG, _DIAG),  # SE
    (-1.0, 0.0),  # S
    (-_DIAG, -_DIAG),  # SW
    (0.0, -1.0),  # W
    (_DIAG, -_DIAG),  # NW
)


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
    chords: int = 2
    #: How far the second operator's stops sit from the first's. Short enough
    #: to walk, and in a separate Site, so the interchange is real and
    #: undeclared. The hand-built city uses ~60-80 m.
    near_transfer_m: float = 70.0
    #: Lines on the third, regional operator: fast, infrequent, terminus to
    #: terminus, deliberately low reach.
    regional_lines: int = 3
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
        if self.arms % 2 != 0 or self.arms < 4:
            raise ValueError(f"arms must be even and at least 4, got {self.arms}")
        if self.arms > len(_DIRECTIONS):
            raise ValueError(f"at most {len(_DIRECTIONS)} arms; got {self.arms}")
        if self.hub_quays < 2:
            raise ValueError(
                "a hub with one quay makes every transfer free and A-granularity unplaceable"
            )
        if self.sites_per_arm < 3:
            raise ValueError("an arm needs a middle for the orbital and the chords to use")


@dataclass(frozen=True)
class Network:
    """A city, in the shape `build.py` already consumes."""

    sites: tuple[Site, ...]
    quays: tuple[Quay, ...]
    lines: tuple[Line, ...]


def _offset(lat: float, lon: float, north_m: float, east_m: float) -> tuple[float, float]:
    """Move a point by metres, using only the safe operations.

    Rounded to six decimals — the finest precision any operator publishes, and
    coarse enough that no float noise survives into the bundle.
    """
    return (
        round(lat + north_m / _M_PER_DEG, 6),
        round(lon + east_m / (_M_PER_DEG * _LON_SCALE), 6),
    )


def _arm_names() -> tuple[str, ...]:
    return ("n", "ne", "e", "se", "s", "sw", "w", "nw")


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


def generate_network(
    spec: NetworkSpec,
    seed: int,
    hub_lat: float = 50.4502,
    hub_lon: float = 30.5142,
) -> Network:
    """A city with headroom in it, by construction.

    The construction order matters and is not arbitrary: operator A's network is
    laid out first, then operator B's stops are placed *relative to A's* so the
    undeclared interchanges exist. Generating the two independently and hoping
    they land near each other would produce a world with no headroom most of the
    time, and no way to tell which seeds those were.
    """
    rng = random.Random(seed)
    names = _arm_names()
    directions = _DIRECTIONS[: spec.arms]

    sites: list[Site] = []
    quays: list[Quay] = []

    # ---- the hub ----------------------------------------------------------
    sites.append(Site("site-hub", "Central Square", round(hub_lat, 6), round(hub_lon, 6)))
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
        quays.append(
            Quay(
                f"q-hub-{stands[i]}",
                "site-hub",
                f"Central Square, stand {stands[i].upper()}",
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
            sites.append(Site(sid, f"{names[a].upper()}{j + 1} Street", lat, lon))
            qlat, qlon = _offset(lat, lon, *_quay_offset(rng))
            quays.append(
                Quay(f"q-{names[a]}{j + 1}", sid, f"{names[a].upper()}{j + 1} Street", qlat, qlon)
            )

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
        headway = 15 * 60 + int(rng.random() * 4) * 300
        lines.append(
            Line(
                f"line-{a + 1}",
                str(a + 1),
                "nordline",
                route,
                6 * 3600,
                22 * 3600,
                headway,
                7.5,
                30,
            )
        )

    # ---- operator A: an orbital that never touches the hub ----------------
    # The only link between arms that do not share a radial. Journeys between
    # them either wait for it or cross the city, which is a real decision.
    mid = spec.sites_per_arm // 2
    orbital = tuple(f"q-{names[a]}{mid + 1}" for a in range(spec.arms))
    lines.append(
        Line("line-orbital", "O", "nordline", orbital, 6 * 3600, 22 * 3600, 24 * 60, 7.5, 30)
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
            sites.append(Site(sid, f"{base.name} tram stop", slat, slon))
            quays.append(Quay(f"t-{names[a]}{j + 1}", sid, f"{base.name} tram stop", qlat, qlon))
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
                "ostline",
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
    sites.append(Site("site-t-hub", "Central Square tram stop", _sl, _so))
    quays.append(
        Quay("t-hub", "site-t-hub", "Central Square tram stop", hub_tram_lat, hub_tram_lon)
    )
    spur = (tram_at[1], "t-hub", tram_at[len(tram_at) // 2 + 1])
    lines.append(Line("line-t0", "T0", "ostline", spur, 6 * 3600, 22 * 3600, 10 * 60, 12.0, 20))

    # ---- operator C: regional, fast, infrequent, low reach ----------------
    for r in range(spec.regional_lines):
        a = r % half
        opposite = a + half
        far = spec.sites_per_arm
        rq = f"r-hub-{r + 1}"
        gap = spec.min_quay_separation_m
        lat, lon = _offset(hub_lat, hub_lon, -gap * (r + 2), -gap * (r + 1))
        _rl, _ro = _offset(lat, lon, *_quay_offset(rng))
        sites.append(Site(f"site-r-hub-{r + 1}", f"Central Station platform {r + 1}", _rl, _ro))
        quays.append(Quay(rq, f"site-r-hub-{r + 1}", f"Central Station platform {r + 1}", lat, lon))

        ends: list[str] = []
        for arm in (a, opposite):
            base = next(q for q in quays if q.id == f"q-{names[arm]}{far}")
            north, east = directions[arm]
            sep = spec.min_quay_separation_m + 20.0
            lat, lon = _offset(base.lat, base.lon, east * sep, -north * sep)
            sid = f"site-r-{names[arm]}"
            if not any(s.id == sid for s in sites):
                _sl, _so = _offset(lat, lon, *_quay_offset(rng))
                sites.append(Site(sid, f"{base.name} station", _sl, _so))
                quays.append(Quay(f"r-{names[arm]}", sid, f"{base.name} station", lat, lon))
            ends.append(f"r-{names[arm]}")

        lines.append(
            Line(
                f"line-r{r + 1}",
                f"R{r + 1}",
                "sudbahn",
                (ends[0], rq, ends[1]),
                6 * 3600,
                22 * 3600,
                30 * 60 + r * 600,
                20.0,
                45,
            )
        )

    net = Network(tuple(sites), tuple(quays), tuple(lines))

    # **Checked, not assumed.** This one number decides whether the lazy
    # integrator can match anything at all, and a spec that violates it produces
    # a world where `P1 - P2` is negative for a reason nothing else reports.
    # Failing loudly here beats discovering it in a calibration two steps later.
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
