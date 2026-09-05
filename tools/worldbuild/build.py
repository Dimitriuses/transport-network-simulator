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

from . import catalogue, city, generate
from .content_hash import content_hash

ENGINE_VERSION = "0.1.0"
SCHEMA_VERSION = 1

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


def operators_for(tier: int | None, seed: int) -> tuple[dict, ...]:
    """The operator manifests this build should use.

    `tier is None` keeps the hand-authored manifests in `city.OPERATORS`, which
    is what the committed world uses and what Phase 0 measured. Passing a tier
    generates them instead (`generate.py`), which is P1M1.

    Both paths return the same shape, so nothing downstream — the builder, the
    projections, the defect audit — can tell which it was given.
    """
    if tier is None:
        return city.OPERATORS
    reach = city.operator_reach()
    collapsible = city.operator_collapsible_sites()
    specs = tuple(
        generate.OperatorSpec(
            o["id"],
            o["name"],
            o["dialect"],
            reach.get(o["id"], 0),
            collapsible.get(o["id"], 0),
        )
        for o in city.OPERATORS
    )
    return generate.generate_manifests(specs, tier, seed)


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


def _quay_by_id() -> dict[str, city.Quay]:
    return {q.id: q for q in city.QUAYS}


def _pattern_stops(
    quay_ids: tuple[str, ...], speed_mps: float, dwell_s: int
) -> list[tuple[int, str, int, int]]:
    """Build (seq, quay_id, arrive_offset, depart_offset) for one direction."""
    quays = _quay_by_id()
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


def build(out_path: Path, seed: int = 481516, tier: int | None = None) -> Path:
    operators = operators_for(tier, seed)
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
                # Tier 2 (CORECONCEPT.md §7): several operators, no stop mapping
                # provided, catalogue A-D active. Not Tier 3 — the reference
                # policy is still `timetable`, and the feeds, while stale and
                # dishonest, are neither throttled nor unreliable.
                ("tier", "2"),
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
            [(s.id, s.name, s.lat, s.lon) for s in city.SITES],
        )
        db.executemany(
            "INSERT INTO quays (id, site_id, name, lat, lon) VALUES (?, ?, ?, ?, ?)",
            [(q.id, q.site_id, q.name, q.lat, q.lon) for q in city.QUAYS],
        )
        db.executemany(
            "INSERT INTO lines (id, name, operator) VALUES (?, ?, ?)",
            [(ln.id, ln.name, ln.operator) for ln in city.LINES],
        )

        for ln in city.LINES:
            for heading, quay_ids in (
                ("outbound", ln.quays),
                ("inbound", tuple(reversed(ln.quays))),
            ):
                pattern_id = f"{ln.id}-{heading}"
                db.execute(
                    "INSERT INTO patterns (id, line_id, heading) VALUES (?, ?, ?)",
                    (pattern_id, ln.id, heading),
                )
                stops = _pattern_stops(quay_ids, ln.speed_mps, ln.dwell_s)
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
        for a in city.QUAYS:
            for b in city.QUAYS:
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
            list(city.QUERIES),
        )

        access_rows = []
        for qid, olat, olon, dlat, dlon, _ in city.QUERIES:
            for endpoint, lat, lon in (
                ("origin", olat, olon),
                ("destination", dlat, dlon),
            ):
                for q in city.QUAYS:
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
