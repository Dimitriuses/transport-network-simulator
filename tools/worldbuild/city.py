"""The hand-authored city.

Deliberately hand-written, not generated. PHASES.md Phase 0: "the generator's
specification is whatever we find ourselves doing by hand".

Twenty-eight quays, two operators, five lines, no defects yet. The shape is
chosen to exercise the structures the specifications care about rather than to
look like a real city:

  * a Site containing several Quays (CENTRAL), so Site/Quay granularity is real
    from the first milestone rather than bolted on later (DATA-MODEL.md §2);
  * two lines meeting at the *same* quay, needing no walk;
  * two lines meeting at *different* quays of the same Site, needing one;
  * **and, from M2, a second operator whose quays sit ~80 m from the first's
    but in separate Sites.**

That last one is the point of the second operator. A transfer there is
physically trivial and completely undeclared: no publication says those two
quays are the same place. P0 may use it, P1 may not — and the difference
between those two transfer sets *is* the headroom a player competes for
(REFERENCE-POLICY.md §4.1).

The tram's northern line is a chord that bypasses Central entirely, so the
shortcut it offers is real rather than decorative: reaching it requires an
undeclared hop, and going via Central instead costs several minutes.

        N3
        N2  ·t-university          NE3
        N1  ·t-botanic         NE2
    W3 W2 W1 C1/C2/t-central  E1 E2 E3
       ·t-foundry  ·t-mill    ·t-cathedral ·t-riverside
      SW1     S1/·t-market        NE1
     SW2      S2
    SW3       S3

    · = Ostline tram quay, near a Nordline quay but in its own Site
"""

from __future__ import annotations

from dataclasses import dataclass

# World epoch: the local midnight that simulated time counts from.
# One day, no DST transition — M1 has no time defects (CORECONCEPT.md §2.1 B).
WORLD_EPOCH_ISO = "2031-04-07T00:00:00+03:00"
WORLD_TIMEZONE = "Europe/Kyiv"
WORLD_UTC_OFFSET_S = 3 * 3600

# Two operators from M2 onward. The second exists to create *headroom*: its
# quays sit near the first's but in separate Sites, so P0 can transfer between
# them and P1 cannot (REFERENCE-POLICY.md §4.1). Their data does not yet
# disagree — semantic conflicts arrive at M3.
OPERATORS: tuple[tuple[str, str], ...] = (
    ("nordline", "Nordline Transit"),
    ("ostline", "Ostline Tram"),
)


@dataclass(frozen=True)
class Quay:
    id: str
    site_id: str
    name: str
    lat: float
    lon: float


@dataclass(frozen=True)
class Site:
    id: str
    name: str
    lat: float
    lon: float


@dataclass(frozen=True)
class Line:
    id: str
    name: str
    operator: str
    quays: tuple[str, ...]
    # First departure, last departure, and interval — all in seconds from epoch.
    first_departure_s: int
    last_departure_s: int
    headway_s: int
    speed_mps: float
    dwell_s: int


SITES: tuple[Site, ...] = (
    Site("site-central", "Central Square", 50.4502, 30.5142),
    Site("site-w1", "Mill Street", 50.4500, 30.5070),
    Site("site-w2", "Foundry Gate", 50.4500, 30.5000),
    Site("site-w3", "West Terminus", 50.4500, 30.4930),
    Site("site-e1", "Cathedral", 50.4500, 30.5210),
    Site("site-e2", "Riverside", 50.4500, 30.5280),
    Site("site-e3", "East Terminus", 50.4500, 30.5350),
    Site("site-n1", "Botanic Garden", 50.4550, 30.5145),
    Site("site-n2", "University", 50.4600, 30.5145),
    Site("site-n3", "North Terminus", 50.4650, 30.5145),
    Site("site-s1", "Market Hall", 50.4455, 30.5145),
    Site("site-s2", "Brewery", 50.4405, 30.5145),
    Site("site-s3", "South Terminus", 50.4355, 30.5145),
    Site("site-sw1", "Old Harbour", 50.4465, 30.5090),
    Site("site-sw2", "Glassworks", 50.4430, 30.5040),
    Site("site-sw3", "Southwest Depot", 50.4395, 30.4990),
    Site("site-ne1", "Observatory", 50.4535, 30.5190),
    Site("site-ne2", "Parkside", 50.4570, 30.5240),
    Site("site-ne3", "Northeast Depot", 50.4605, 30.5290),
    # Tram sites. Deliberately *separate* Sites from the bus stops they sit
    # beside: nobody has declared them to be the same place, so P1 cannot
    # transfer here and P0 can.
    Site("site-t-foundry", "Foundry Gate tram stop", 50.4506, 30.5006),
    Site("site-t-mill", "Mill Street tram stop", 50.4506, 30.5076),
    Site("site-t-botanic", "Botanic Garden tram stop", 50.4556, 30.5151),
    Site("site-t-university", "University tram stop", 50.4606, 30.5151),
    Site("site-t-market", "Market Hall tram stop", 50.4461, 30.5151),
    Site("site-t-cathedral", "Cathedral tram stop", 50.4506, 30.5216),
    Site("site-t-riverside", "Riverside tram stop", 50.4506, 30.5286),
)

QUAYS: tuple[Quay, ...] = (
    # The interchange: two quays, one site. A transfer between them is a walk.
    Quay("q-central-a", "site-central", "Central Square, stand A", 50.4500, 30.5140),
    Quay("q-central-b", "site-central", "Central Square, stand B", 50.4505, 30.5145),
    Quay("q-w1", "site-w1", "Mill Street", 50.4500, 30.5070),
    Quay("q-w2", "site-w2", "Foundry Gate", 50.4500, 30.5000),
    Quay("q-w3", "site-w3", "West Terminus", 50.4500, 30.4930),
    Quay("q-e1", "site-e1", "Cathedral", 50.4500, 30.5210),
    Quay("q-e2", "site-e2", "Riverside", 50.4500, 30.5280),
    Quay("q-e3", "site-e3", "East Terminus", 50.4500, 30.5350),
    Quay("q-n1", "site-n1", "Botanic Garden", 50.4550, 30.5145),
    Quay("q-n2", "site-n2", "University", 50.4600, 30.5145),
    Quay("q-n3", "site-n3", "North Terminus", 50.4650, 30.5145),
    Quay("q-s1", "site-s1", "Market Hall", 50.4455, 30.5145),
    Quay("q-s2", "site-s2", "Brewery", 50.4405, 30.5145),
    Quay("q-s3", "site-s3", "South Terminus", 50.4355, 30.5145),
    Quay("q-sw1", "site-sw1", "Old Harbour", 50.4465, 30.5090),
    Quay("q-sw2", "site-sw2", "Glassworks", 50.4430, 30.5040),
    Quay("q-sw3", "site-sw3", "Southwest Depot", 50.4395, 30.4990),
    Quay("q-ne1", "site-ne1", "Observatory", 50.4535, 30.5190),
    Quay("q-ne2", "site-ne2", "Parkside", 50.4570, 30.5240),
    Quay("q-ne3", "site-ne3", "Northeast Depot", 50.4605, 30.5290),
    # Ostline tram. One quay shares Central Square with the buses — a declared
    # interchange both operators publish, and therefore obvious to everyone.
    Quay("t-central", "site-central", "Central Square tram stop", 50.4503, 30.5148),
    # The rest sit beside a bus stop but in their own Site. Undeclared.
    Quay("t-foundry", "site-t-foundry", "Foundry Gate tram stop", 50.4506, 30.5006),
    Quay("t-mill", "site-t-mill", "Mill Street tram stop", 50.4506, 30.5076),
    Quay("t-botanic", "site-t-botanic", "Botanic Garden tram stop", 50.4556, 30.5151),
    Quay("t-university", "site-t-university", "University tram stop", 50.4606, 30.5151),
    Quay("t-market", "site-t-market", "Market Hall tram stop", 50.4461, 30.5151),
    Quay("t-cathedral", "site-t-cathedral", "Cathedral tram stop", 50.4506, 30.5216),
    Quay("t-riverside", "site-t-riverside", "Riverside tram stop", 50.4506, 30.5286),
)

H06, H22 = 6 * 3600, 22 * 3600

LINES: tuple[Line, ...] = (
    # ---- Nordline buses: three radial lines, all through Central ----------
    Line(
        "line-12",
        "12",
        "nordline",
        ("q-w3", "q-w2", "q-w1", "q-central-a", "q-e1", "q-e2", "q-e3"),
        H06,
        H22,
        15 * 60,
        7.5,
        30,
    ),
    # Transfers to line 12 need a walk across Central Square.
    Line(
        "line-7",
        "7",
        "nordline",
        ("q-n3", "q-n2", "q-n1", "q-central-b", "q-s1", "q-s2", "q-s3"),
        H06,
        H22,
        20 * 60,
        7.5,
        30,
    ),
    # Also through stand A, so transfers to line 12 are free.
    Line(
        "line-3",
        "3",
        "nordline",
        ("q-sw3", "q-sw2", "q-sw1", "q-central-a", "q-ne1", "q-ne2", "q-ne3"),
        H06,
        H22,
        30 * 60,
        7.5,
        30,
    ),
    # ---- Ostline trams: faster, more frequent, and chord-shaped -----------
    # T1 bypasses Central completely. Reaching it means an undeclared hop from
    # a bus stop ~80 m away, which only P0 may make — this line is the
    # headroom.
    Line(
        "line-t1",
        "T1",
        "ostline",
        ("t-foundry", "t-mill", "t-botanic", "t-university"),
        H06,
        H22,
        8 * 60,
        12.0,
        20,
    ),
    # T2 does call at Central Square, so P1 can legitimately reach it there.
    Line(
        "line-t2",
        "T2",
        "ostline",
        ("t-market", "t-central", "t-cathedral", "t-riverside"),
        H06,
        H22,
        10 * 60,
        12.0,
        20,
    ),
)

# The scored query set. Chosen so some journeys need no transfer, some need a
# free transfer at stand A, some need a walk across Central Square, and some
# are materially faster if you know the tram chord exists.
QUERIES: tuple[tuple[str, float, float, float, float, int], ...] = (
    # id, origin lat/lon, destination lat/lon, depart-after seconds from epoch
    ("q01", 50.4501, 30.4931, 50.4499, 30.5349, 8 * 3600),  # W3 -> E3, direct
    ("q02", 50.4649, 30.5146, 50.4356, 30.5144, 8 * 3600 + 600),  # N3 -> S3, direct
    ("q03", 50.4396, 30.4991, 50.4604, 30.5291, 9 * 3600),  # SW3 -> NE3, direct
    ("q04", 50.4501, 30.5001, 50.4599, 30.5146, 9 * 3600 + 900),  # W2 -> N2, walk
    ("q05", 50.4396, 30.4991, 50.4501, 30.5281, 10 * 3600),  # SW3 -> E2, free
    ("q06", 50.4551, 30.5146, 50.4501, 30.5211, 10 * 3600 + 1200),  # N1 -> E1, walk
    ("q07", 50.4431, 30.5041, 50.4406, 30.5146, 11 * 3600),  # SW2 -> S2, walk
    ("q08", 50.4536, 30.5191, 50.4501, 30.5071, 12 * 3600),  # NE1 -> W1, free
    ("q09", 50.4466, 30.5091, 50.4571, 30.5241, 13 * 3600),  # SW1 -> NE2, direct
    ("q10", 50.4501, 30.5351, 50.4651, 30.5146, 17 * 3600),  # E3 -> N3, walk
    # These four reward knowing about the tram chord. Going via Central works
    # but is slower; the fast route needs an undeclared bus->tram hop.
    # Endpoints deliberately away from any tram quay, so the tram can only be
    # reached mid-journey — which is what makes the undeclared hop matter.
    ("q11", 50.4501, 30.4931, 50.4599, 30.5146, 7 * 3600 + 1800),  # W3 -> N2
    ("q12", 50.4501, 30.4931, 50.4649, 30.5146, 14 * 3600),  # W3 -> N3
    ("q13", 50.4501, 30.5351, 50.4599, 30.5146, 15 * 3600),  # E3 -> N2
    ("q14", 50.4396, 30.4991, 50.4599, 30.5146, 16 * 3600),  # SW3 -> N2
    ("q15", 50.4356, 30.5144, 50.4599, 30.5146, 9 * 3600 + 300),  # S3 -> N2
    ("q16", 50.4604, 30.5291, 50.4599, 30.5146, 11 * 3600 + 600),  # NE3 -> N2
)

# Movement model. No defects yet, so vehicles run exactly to schedule and the
# per-line speed and dwell fully determine the timetable.
WALK_SPEED_MPS = 1.3
MAX_WALK_M = 400.0
