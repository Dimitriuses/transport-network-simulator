"""Build the L1 canonical world into a SQLite bundle.

Specification: DATA-MODEL.md §2 (L1) and §6 (the bundle).

This is the offline side of the language seam. Everything approximate,
floating-point or dependency-heavy happens here, once, and is frozen into the
bundle — most importantly the geodesic distances, because the TypeScript
runtime is forbidden from calling transcendental Math functions at all
(TECHNICAL-RESEARCH.md §11).
"""

from __future__ import annotations

import json
import math
import sqlite3
from pathlib import Path

from . import catalogue, city, generate, names, network
from .content_hash import content_hash

ENGINE_VERSION = "0.1.0"

#: The bundle format.
#:
#: 1  through P1M2.
#: 2  P1M3 adds `place_names` — every name an entity goes by. A version-1
#:    bundle has no such table, so a current reader cannot load one; the reader
#:    says so rather than failing on a missing table (`src/core/src/load.ts`).
SCHEMA_VERSION = 2

DDL = """
CREATE TABLE manifest (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE sites (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat  REAL NOT NULL,
    lon  REAL NOT NULL
);

CREATE TABLE quays (
    id      TEXT PRIMARY KEY,
    site_id TEXT NOT NULL REFERENCES sites(id),
    name    TEXT NOT NULL,
    lat     REAL NOT NULL,
    lon     REAL NOT NULL
);

-- Every name a place goes by (ROADMAP.md P1M3, CORECONCEPT.md §2.1 A).
--
-- **A variant is a fact about a place, not a function of its official name.**
-- "Foundry Gate" abbreviates to "Foundry Gt" by rule, but nothing about the
-- string "Central Square" yields "Tsentralna" — you have to know. Deriving the
-- colloquial form in the projection meant a hard-coded lookup of one city's
-- places, which rewrote one name in thirty-three on a generated city and made
-- the defect audit report MISS (KNOWN-ISSUES.md #39).
--
-- Keyed by entity id, so sites, quays, lines and operators all live here.
CREATE TABLE place_names (
    entity_id TEXT NOT NULL,
    variant   TEXT NOT NULL,
    name      TEXT NOT NULL,
    PRIMARY KEY (entity_id, variant)
);

-- Each operator's projection manifest: how it publishes, and therefore which
-- conflicts from CORECONCEPT.md §2.1 it exhibits. The manifest *is* the
-- difficulty declaration, and the defect audit checks every non-default
-- setting actually reaches the published output (DATA-MODEL.md §4, §7).
CREATE TABLE operators (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    manifest TEXT NOT NULL
);

CREATE TABLE lines (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    operator TEXT NOT NULL
);

-- One ordered variant of a line's quay sequence. Kept explicit rather than
-- collapsed into trips, because the simulator and the router both want it
-- (DATA-MODEL.md §2).
CREATE TABLE patterns (
    id      TEXT PRIMARY KEY,
    line_id TEXT NOT NULL REFERENCES lines(id),
    heading TEXT NOT NULL
);

-- Offsets from journey start, in integer seconds. Absolute times are derived.
CREATE TABLE pattern_stops (
    pattern_id     TEXT NOT NULL REFERENCES patterns(id),
    seq            INTEGER NOT NULL,
    quay_id        TEXT NOT NULL REFERENCES quays(id),
    arrive_offset_s INTEGER NOT NULL,
    depart_offset_s INTEGER NOT NULL,
    PRIMARY KEY (pattern_id, seq)
);

CREATE TABLE journeys (
    id         TEXT PRIMARY KEY,
    pattern_id TEXT NOT NULL REFERENCES patterns(id),
    start_s    INTEGER NOT NULL
);

-- Precomputed walking distances between quays within MAX_WALK_M. Computed
-- here because the runtime core may not call Math.sin/cos/atan2.
--
-- Stored as INTEGER metres, not REAL. haversine_m goes through the platform's
-- libm, which differs between operating systems in the last ULP — the same
-- hazard TECHNICAL-RESEARCH.md §11 documents for V8, which moving the
-- computation to Python relocates rather than removes. Rounding to whole
-- metres puts nine orders of magnitude between libm noise and the stored
-- value, so the bundle's content is identical on every platform.
CREATE TABLE quay_distances (
    from_quay TEXT NOT NULL REFERENCES quays(id),
    to_quay   TEXT NOT NULL REFERENCES quays(id),
    metres    INTEGER NOT NULL,
    PRIMARY KEY (from_quay, to_quay)
);

CREATE TABLE queries (
    id             TEXT PRIMARY KEY,
    origin_lat     REAL NOT NULL,
    origin_lon     REAL NOT NULL,
    dest_lat       REAL NOT NULL,
    dest_lon       REAL NOT NULL,
    depart_after_s INTEGER NOT NULL
);

-- Walking distance from each query endpoint to every quay within MAX_WALK_M.
CREATE TABLE query_access (
    query_id TEXT NOT NULL REFERENCES queries(id),
    endpoint TEXT NOT NULL CHECK (endpoint IN ('origin', 'destination')),
    quay_id  TEXT NOT NULL REFERENCES quays(id),
    metres   INTEGER NOT NULL,
    PRIMARY KEY (query_id, endpoint, quay_id)
);

CREATE INDEX idx_journeys_pattern ON journeys(pattern_id);
CREATE INDEX idx_pattern_stops_quay ON pattern_stops(quay_id);
"""

EARTH_RADIUS_M = 6_371_008.8


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres.

    Lives on this side of the seam permanently: V8 changes its transcendental
    implementations across versions, so calling this at runtime would break
    cross-version reproducibility (TECHNICAL-RESEARCH.md §11).
    """
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


# Default settings. Anything an operator does differently is a declared
# conflict, named here so the manifest and the audit agree on vocabulary.
# The conflict-free manifest and the catalogue names, read from the artefact
# `src/schema` generates rather than restated here. Two copies of the same facts
# either side of the TypeScript/Python seam is the arrangement that drifts, and
# these had already been edited independently more than once.
DEFAULTS: dict[str, dict[str, object]] = catalogue.load().defaults()
CONFLICT_NAMES: dict[tuple[str, str], str] = catalogue.load().conflict_names()


def operators_for(
    tier: int | None, seed: int, net: network.Network | None = None
) -> tuple[dict, ...]:
    """The operator manifests this build should use.

    `tier is None` keeps the hand-authored manifests in `city.OPERATORS`, which
    is what the committed world uses and what Phase 0 measured. Passing a tier
    generates them instead (`generate.py`), which is P1M1.

    Both paths return the same shape, so nothing downstream — the builder, the
    projections, the defect audit — can tell which it was given.
    """
    if tier is None:
        return city.OPERATORS
    # Reach and expressibility are properties of *this* network, not of the
    # hand-authored one. Reading them from `city` while building a generated
    # world would place conflicts by the wrong operator's coverage — and
    # placement was the dominant factor P0M10 measured.
    net = net or network.Network(city.SITES, city.QUAYS, city.LINES)
    reach = network.operator_reach(net)
    collapsible = network.operator_collapsible_sites(net)
    # **Who the operators are is a property of the network, not of `city`.**
    # A generated world's roster is generated with it — its size, its roles and
    # its ids — and reading the hand-authored three here is what made every
    # world this project built share the same three operator names, and a
    # memorised answer key resolve in all of them (`KNOWN-ISSUES.md` #48).
    roster: tuple[tuple[str, str, str], ...] = (
        tuple((o.id, o.name, o.dialect) for o in net.operators)
        if net.operators
        else tuple((o["id"], o["name"], o["dialect"]) for o in city.OPERATORS)
    )
    specs = tuple(
        generate.OperatorSpec(
            oid,
            name,
            dialect,
            reach.get(oid, 0),
            collapsible.get(oid, 0),
        )
        for oid, name, dialect in roster
    )
    return generate.generate_manifests(specs, tier, seed)


def place_names_for(
    net: network.Network, operators: tuple[dict, ...]
) -> list[tuple[str, str, str]]:
    """Every name every entity goes by, as `(entity_id, variant, name)` rows.

    A generated network arrives with its own (`network.generate_network`). The
    hand-authored city derives them at build time from `names.derive_variants`,
    which knows its phrasebook — so the projection never derives anything and
    the rule lives in one place (`KNOWN-ISSUES.md` #39).
    """
    rows: list[tuple[str, str, str]] = []
    seen: set[str] = set()

    def add(entity_id: str, place: names.PlaceNames) -> None:
        if entity_id in seen:
            return
        seen.add(entity_id)
        rows.extend(place.as_rows(entity_id))

    for entity_id, place in net.names.items():
        add(entity_id, place)

    # Anything the network did not name — every entity of the hand-authored
    # city, and any the generator missed.
    for site in net.sites:
        add(site.id, names.derive_variants(site.name))
    for quay in net.quays:
        add(quay.id, names.derive_variants(quay.name))
    for line in net.lines:
        add(line.id, names.PlaceNames(line.name, line.name, line.name))
    for op in operators:
        add(op["id"], names.OPERATOR_NAMES.get(op["id"], names.derive_variants(op["name"])))

    return sorted(rows)


def queries_for(
    net: network.Network, scored_ids: frozenset[str] | None = None
) -> tuple[tuple[str, float, float, float, float, int], ...]:
    """The scored query set for this network.

    The hand-authored city keeps its own, which is hand-picked plus a filtered
    generated pool and is what every Phase 0 result was measured on. A generated
    network has no such list and cannot borrow one: its sites are somewhere else
    entirely.
    """
    if net.sites is city.SITES:
        return city.QUERIES
    return network.generate_queries(net, scored_ids=scored_ids)


def _rung_id(tier: int) -> str:
    """The stable id of the rung at this tier.

    Empty when the tier is off the ladder, rather than invented: a world
    declaring a rung nobody defined should say so in its own manifest.
    """
    rung = catalogue.load().rung_at(tier)
    return rung.id if rung else ""


def _declared_conflicts(operators: tuple[dict, ...]) -> list[str]:
    """Every way an operator departs from the default, as catalogue names."""
    found: set[str] = set()
    for op in operators:
        for group, defaults in DEFAULTS.items():
            for key, default in defaults.items():
                if op.get(group, {}).get(key, default) != default:
                    found.add(f"{CONFLICT_NAMES[(group, key)]}:{op['id']}")
    # Two operators using bare integer ids collide with each other. That is a
    # distinct conflict from either of them merely being unprefixed.
    bare = [o["id"] for o in operators if o["identity"]["id_scheme"] == "bare_int"]
    if len(bare) > 1:
        found.add("A-id-collision:" + "+".join(sorted(bare)))
    return sorted(found)


def spec_for_tier(tier: int | None) -> network.NetworkSpec | None:
    """The city this tier asks for, or `None` for the default shape.

    **A tier is a claim about the world, not only about its conflicts** — the
    root of `KNOWN-ISSUES.md` #48, fixed at P1M6. The levers live on the rung
    (`src/schema/src/ladder.ts`) and arrive here through the contract, so adding
    a rung does not mean editing a generator.
    """
    if tier is None:
        return None
    rung = catalogue.load().rung_at(tier)
    if rung is None:
        return None
    w = rung.world
    return network.NetworkSpec(
        arms=w.arms,
        sites_per_arm=w.sites_per_arm,
        hub_quays=w.hub_quays,
        chords=w.chords,
        regional_lines=w.regional_lines,
        metro_lines=w.metro_lines,
        roster=w.roster,
        max_reach_share=w.max_reach_share,
    )


def network_for(
    generate: bool, seed: int, spec: network.NetworkSpec | None = None
) -> network.Network:
    """The city this build should use.

    `generate=False` keeps the hand-authored one in `city`, which is what the
    committed world is and what every Phase 0 result was measured on. Passing
    `True` generates the sites, quays and lines instead (`ROADMAP.md` P1M2).

    Both paths return the same shape, so nothing downstream — the builder, the
    projections, the audits — can tell which it was given. That is the same
    contract `operators_for` established at P1M1, for the same reason: an
    instrument that behaves differently on a generated world cannot be used to
    judge one.
    """
    if not generate:
        return network.Network(city.SITES, city.QUAYS, city.LINES)
    return network.generate_network(spec or network.NetworkSpec(), seed)


def _pattern_stops(
    net: network.Network, quay_ids: tuple[str, ...], speed_mps: float, dwell_s: int
) -> list[tuple[int, str, int, int]]:
    """Build (seq, quay_id, arrive_offset, depart_offset) for one direction."""
    quays = {q.id: q for q in net.quays}
    rows: list[tuple[int, str, int, int]] = []
    t = 0
    for seq, qid in enumerate(quay_ids):
        if seq > 0:
            prev = quays[quay_ids[seq - 1]]
            cur = quays[qid]
            metres = haversine_m(prev.lat, prev.lon, cur.lat, cur.lon)
            t += round(metres / speed_mps)
        arrive = t
        depart = t if seq == 0 else t + dwell_s
        rows.append((seq, qid, arrive, depart))
        t = depart
    return rows


def build(
    out_path: Path,
    seed: int = 481516,
    tier: int | None = None,
    generate_network: bool = False,
    spec: network.NetworkSpec | None = None,
    scored_ids: frozenset[str] | None = None,
    conflict_seed: int | None = None,
) -> Path:
    # **The city and its conflicts draw from separate seeds.**
    #
    # One seed for both means two worlds of the same declared tier differ in
    # their network *and* in their conflicts, and nothing can say which is
    # responsible for a difference in difficulty (`KNOWN-ISSUES.md` #42). It is
    # also the lever a calibration search needs: re-drawing the conflicts
    # while holding the city fixed is the adjustment step, and re-drawing the
    # city would invalidate the scored query set it was selected against.
    net = network_for(generate_network, seed, spec or spec_for_tier(tier))
    queries = queries_for(net, scored_ids)
    operators = operators_for(tier, conflict_seed if conflict_seed is not None else seed, net)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()

    db = sqlite3.connect(out_path)
    try:
        db.executescript(DDL)

        db.executemany(
            "INSERT INTO manifest (key, value) VALUES (?, ?)",
            [
                ("schema_version", str(SCHEMA_VERSION)),
                ("engine_version", ENGINE_VERSION),
                ("seed", str(seed)),
                # The tier this world declares (CORECONCEPT.md §7).
                #
                # The hand-authored city is Tier 2: several operators, no stop
                # mapping provided, catalogue A-D active. Not Tier 3 — the
                # reference policy is still `timetable`, and the feeds, while
                # stale and dishonest, are neither throttled nor unreliable.
                #
                # **A generated world declares the tier it was asked for.** It
                # was hardcoded to "2" until P1M2, so `python -m worldbuild
                # --tier 5` produced a world whose brief said Tier 2, whose
                # scorecard was graded against Tier 2's clearance bar, and whose
                # conflicts were sampled for Tier 5. Nothing compared the two
                # numbers, which is the shape of `KNOWN-ISSUES.md` #19 again.
                ("tier", str(tier if tier is not None else 2)),
                # **The rung's id and the ladder it came from, beside the
                # number.** A tier is an index, the numbering is expected to
                # move — six rungs may become nine when intermediate ones are
                # wanted — and a scorecard recorded against "tier 4" means
                # nothing afterwards if tier 4 has become tier 6. The id does
                # not move, so a result stays interpretable across a
                # renumbering (`ROADMAP.md` P1M5, `KNOWN-ISSUES.md` #20 for the
                # mistake this avoids).
                ("rung_id", _rung_id(tier if tier is not None else 2)),
                ("ladder_version", str(catalogue.load().ladder_version)),
                ("world_epoch_iso", city.WORLD_EPOCH_ISO),
                ("timezone", city.WORLD_TIMEZONE),
                ("utc_offset_s", str(city.WORLD_UTC_OFFSET_S)),
                # The active conflict list is derived from the operator
                # manifests rather than written separately, so the two cannot
                # drift apart.
                ("active_conflicts", ",".join(_declared_conflicts(operators))),
                ("walk_speed_mps", str(city.WALK_SPEED_MPS)),
                ("max_walk_m", str(city.MAX_WALK_M)),
            ],
        )

        db.executemany(
            "INSERT INTO operators (id, name, manifest) VALUES (?, ?, ?)",
            [
                (o["id"], o["name"], json.dumps(o, sort_keys=True, separators=(",", ":")))
                for o in operators
            ],
        )

        db.executemany(
            "INSERT INTO sites (id, name, lat, lon) VALUES (?, ?, ?, ?)",
            [(s.id, s.name, s.lat, s.lon) for s in net.sites],
        )
        db.executemany(
            "INSERT INTO quays (id, site_id, name, lat, lon) VALUES (?, ?, ?, ?, ?)",
            [(q.id, q.site_id, q.name, q.lat, q.lon) for q in net.quays],
        )
        db.executemany(
            "INSERT INTO lines (id, name, operator) VALUES (?, ?, ?)",
            [(ln.id, ln.name, ln.operator) for ln in net.lines],
        )
        db.executemany(
            "INSERT INTO place_names (entity_id, variant, name) VALUES (?, ?, ?)",
            place_names_for(net, operators),
        )

        for ln in net.lines:
            for heading, quay_ids in (
                ("outbound", ln.quays),
                ("inbound", tuple(reversed(ln.quays))),
            ):
                pattern_id = f"{ln.id}-{heading}"
                db.execute(
                    "INSERT INTO patterns (id, line_id, heading) VALUES (?, ?, ?)",
                    (pattern_id, ln.id, heading),
                )
                stops = _pattern_stops(net, quay_ids, ln.speed_mps, ln.dwell_s)
                db.executemany(
                    "INSERT INTO pattern_stops "
                    "(pattern_id, seq, quay_id, arrive_offset_s, depart_offset_s) "
                    "VALUES (?, ?, ?, ?, ?)",
                    [(pattern_id, s, q, a, d) for (s, q, a, d) in stops],
                )

                start = ln.first_departure_s
                n = 0
                while start <= ln.last_departure_s:
                    db.execute(
                        "INSERT INTO journeys (id, pattern_id, start_s) VALUES (?, ?, ?)",
                        (f"{pattern_id}-{n:03d}", pattern_id, start),
                    )
                    start += ln.headway_s
                    n += 1

        # Walking links between quays, both directions, within the cap.
        walk_rows = []
        for a in net.quays:
            for b in net.quays:
                if a.id == b.id:
                    continue
                metres = haversine_m(a.lat, a.lon, b.lat, b.lon)
                if metres <= city.MAX_WALK_M:
                    walk_rows.append((a.id, b.id, round(metres)))
        db.executemany(
            "INSERT INTO quay_distances (from_quay, to_quay, metres) VALUES (?, ?, ?)",
            walk_rows,
        )

        db.executemany(
            "INSERT INTO queries "
            "(id, origin_lat, origin_lon, dest_lat, dest_lon, depart_after_s) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            list(queries),
        )

        access_rows = []
        for qid, olat, olon, dlat, dlon, _ in queries:
            for endpoint, lat, lon in (
                ("origin", olat, olon),
                ("destination", dlat, dlon),
            ):
                for q in net.quays:
                    metres = haversine_m(lat, lon, q.lat, q.lon)
                    if metres <= city.MAX_WALK_M:
                        access_rows.append((qid, endpoint, q.id, round(metres)))
        db.executemany(
            "INSERT INTO query_access (query_id, endpoint, quay_id, metres) VALUES (?, ?, ?, ?)",
            access_rows,
        )

        # The content hash names this world independently of the SQLite
        # container, which is version-stamped and therefore not comparable
        # across machines. See content_hash.py.
        db.execute(
            "INSERT INTO manifest (key, value) VALUES ('content_hash', ?)",
            (content_hash(db),),
        )
        db.commit()
    finally:
        db.close()

    return out_path
