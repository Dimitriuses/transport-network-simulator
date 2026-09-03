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
  * **and, from P0M2, a second operator whose quays sit ~80 m from the first's
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
# One day, no DST transition — P0M1 has no time defects (CORECONCEPT.md §2.1 B).
WORLD_EPOCH_ISO = "2031-04-07T00:00:00+03:00"
WORLD_TIMEZONE = "Europe/Kyiv"
WORLD_UTC_OFFSET_S = 3 * 3600

# Two operators from P0M2 onward. The second exists to create *headroom*: its
# quays sit near the first's but in separate Sites, so P0 can transfer between
# them and P1 cannot (REFERENCE-POLICY.md §4.1). Their data does not yet
# disagree — semantic conflicts arrive at P0M3.
# Each operator publishes the same city through its own manifest. The manifest
# *is* the difficulty declaration: every non-default setting is a conflict from
# the catalogue in CORECONCEPT.md §2.1, and the defect audit verifies each one
# actually reaches the published output (DATA-MODEL.md §4, §7).
OPERATORS: tuple[dict, ...] = (
    {
        # The big incumbent, running five of the city's ten lines and calling
        # at 39 of its line-stops — four times either of the others.
        #
        # **It used to be the clean one**, and that was the problem. Everything
        # it published was right, which made it a useful reference point and
        # meant every declared conflict sat on operators covering about a fifth
        # of the network. The conflict-depth probe measured the consequence:
        # every conflict bites hardest here, and none of them was here.
        #
        # Swapped at P0M10. A large municipal operator carrying a scheduling
        # system it bought in the 1990s is at least as plausible as one with
        # immaculate data, and the newer tram network below is now the clean
        # reference instead. Geometry, timetable and traffic are untouched:
        # only which operator publishes badly has changed, so the difference is
        # attributable to placement and nothing else.
        "id": "nordline",
        "name": "Nordline Transit",
        "dialect": "proprietary",
        "identity": {"granularity": "quay", "id_scheme": "bare_int", "prefix": ""},
        "naming": {"variant": "abbreviated"},
        # A legacy local grid, converted approximately: every position is
        # displaced by the same ~130 m. Consistent, plausible, and fatal to a
        # coordinate-threshold matcher (catalogue C). Coordinates are rounded
        # to three decimals — about 110 m, enough to make a matcher unreliable
        # without making it obviously broken.
        "geometry": {
            "precision": 3,
            "source": "quay",
            "latlon_order": "lat_lon",
            "offset_m": 130,
        },
        "time": {"encoding": "epoch_s"},
        # Ninety seconds behind, and delays truncated to whole minutes — so a
        # player that trusts the figure is wrong by up to a minute even when
        # the feed has caught up (catalogue C and D).
        "realtime": {
            "staleness_s": 90,
            "cancellations": "explicit",
            "delay_unit": "minutes",
            "publishes_delays": True,
        },
    },
    {
        # The newer tram network, built this decade with a modern feed.
        # Everything it does is right, which is what makes it useful as a
        # reference point for the others — the role Nordline used to hold.
        "id": "ostline",
        "name": "Ostline Tram",
        "dialect": "gtfs_like",
        "identity": {"granularity": "quay", "id_scheme": "prefixed", "prefix": "OT"},
        "naming": {"variant": "official"},
        "geometry": {
            "precision": 6,
            "source": "quay",
            "latlon_order": "lat_lon",
            "offset_m": 0,
        },
        "time": {"encoding": "iso_offset"},
        # Honest and current. The reference point the others are judged against.
        "realtime": {
            "staleness_s": 0,
            "cancellations": "explicit",
            "delay_unit": "seconds",
            "publishes_delays": True,
        },
    },
    {
        # A regional railway that thinks in stations, not platforms. Publishes
        # one stop per Site, positioned at the Site centroid rather than at any
        # quay a train actually calls at — so its coordinates match nothing
        # exactly. Times carry no offset at all.
        #
        # Unchanged by the P0M10 swap: this profile is distinct from either of
        # the others, and it is the only operator publishing at Site
        # granularity, which is what makes the three platforms at Central a
        # single published stop.
        "id": "sudbahn",
        "name": "Sudbahn Regional",
        "dialect": "legacy",
        "identity": {"granularity": "site", "id_scheme": "bare_int", "prefix": ""},
        "naming": {"variant": "colloquial"},
        "geometry": {
            "precision": 6,
            "source": "site",
            "latlon_order": "lat_lon",
            "offset_m": 0,
        },
        "time": {"encoding": "local_naive"},
        # Five minutes behind, and cancelled trains simply stop appearing
        # rather than being marked — the "ghost trip" failure, which is
        # indistinguishable from a feed that has not caught up (catalogue D).
        "realtime": {
            "staleness_s": 300,
            "cancellations": "silent_drop",
            "delay_unit": "seconds",
            "publishes_delays": True,
        },
    },
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
    # ---- P0M9: the city grows -------------------------------------------
    # Not decoration. At 22 scored travellers, one journey changing outcome
    # was worth ~0.098 of the headline score while Gate 3 had to decide a 0.2
    # question, so the gate was reading a 0.1 signal with a 0.1 ruler. More
    # origins and destinations is the only thing that fixes that, and they need
    # somewhere to go.
    Site("site-w4", "Quarry Lane", 50.4500, 30.4860),
    Site("site-e4", "Ferry Landing", 50.4500, 30.5420),
    Site("site-n4", "Northgate", 50.4700, 30.5145),
    Site("site-s4", "Tannery", 50.4305, 30.5145),
    # A north-west/south-east diameter, crossing the existing arms.
    Site("site-nw1", "Linden Park", 50.4545, 30.5085),
    Site("site-nw2", "Chalk Hill", 50.4590, 30.5030),
    Site("site-nw3", "Northwest Terminus", 50.4635, 30.4975),
    Site("site-se1", "Tanners Bridge", 50.4460, 30.5205),
    Site("site-se2", "Lime Wharf", 50.4420, 30.5260),
    Site("site-se3", "Southeast Terminus", 50.4380, 30.5315),
    # Two more undeclared tram interchanges, on the same pattern as the rest.
    Site("site-t-linden", "Linden Park tram stop", 50.4551, 30.5091),
    Site("site-t-tanners", "Tanners Bridge tram stop", 50.4466, 30.5211),
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
    # Sudbahn Regional. Its quays sit inside Sites the other operators already
    # serve, so the same physical place ends up with three published
    # identities — which is the point of P0M3.
    # Two platforms at Central, one per line. Sudbahn publishes at Site
    # granularity, so both appear as a single stop — and a player boarding
    # "Central Square" is not told which platform the train leaves from.
    Quay("r-central-1", "site-central", "Central Square, platform 1", 50.4498, 30.5136),
    Quay("r-central-2", "site-central", "Central Square, platform 2", 50.4496, 30.5133),
    Quay("r-west", "site-w3", "West Terminus, platform 1", 50.4497, 30.4927),
    Quay("r-east", "site-e3", "East Terminus, platform 1", 50.4497, 30.5353),
    Quay("r-north", "site-n3", "North Terminus, platform 1", 50.4653, 30.5148),
    Quay("r-south", "site-s3", "South Terminus, platform 1", 50.4352, 30.5142),
    # ---- P0M9 ------------------------------------------------------------
    Quay("q-w4", "site-w4", "Quarry Lane", 50.4500, 30.4860),
    Quay("q-e4", "site-e4", "Ferry Landing", 50.4500, 30.5420),
    Quay("q-n4", "site-n4", "Northgate", 50.4700, 30.5145),
    Quay("q-s4", "site-s4", "Tannery", 50.4305, 30.5145),
    Quay("q-nw1", "site-nw1", "Linden Park", 50.4545, 30.5085),
    Quay("q-nw2", "site-nw2", "Chalk Hill", 50.4590, 30.5030),
    Quay("q-nw3", "site-nw3", "Northwest Terminus", 50.4635, 30.4975),
    Quay("q-se1", "site-se1", "Tanners Bridge", 50.4460, 30.5205),
    Quay("q-se2", "site-se2", "Lime Wharf", 50.4420, 30.5260),
    Quay("q-se3", "site-se3", "Southeast Terminus", 50.4380, 30.5315),
    # A second stand at Market Hall, so Central is not the only Site where a
    # transfer costs a walk and granularity has something to hide.
    Quay("q-s1-b", "site-s1", "Market Hall, stand B", 50.4451, 30.5141),
    Quay("t-linden", "site-t-linden", "Linden Park tram stop", 50.4551, 30.5091),
    Quay("t-tanners", "site-t-tanners", "Tanners Bridge tram stop", 50.4466, 30.5211),
    # A third platform at Central. Sudbahn publishes at Site granularity, so
    # all three appear as one stop and a player boarding "Central Square" is
    # told nothing about which of them the train leaves from.
    Quay("r-central-3", "site-central", "Central Square, platform 3", 50.4492, 30.5126),
    Quay("r-northwest", "site-nw3", "Northwest Terminus, platform 1", 50.4632, 30.4972),
    Quay("r-southeast", "site-se3", "Southeast Terminus, platform 1", 50.4377, 30.5318),
)

H06, H22 = 6 * 3600, 22 * 3600

LINES: tuple[Line, ...] = (
    # ---- Nordline buses: three radial lines, all through Central ----------
    Line(
        "line-12",
        "12",
        "nordline",
        ("q-w4", "q-w3", "q-w2", "q-w1", "q-central-a", "q-e1", "q-e2", "q-e3", "q-e4"),
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
        ("q-n4", "q-n3", "q-n2", "q-n1", "q-central-b", "q-s1", "q-s2", "q-s3", "q-s4"),
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
    # A north-west to south-east diameter, calling at stand B and at Market
    # Hall's second stand — so a transfer to line 12 costs a walk, and one to
    # line 7 does not.
    Line(
        "line-9",
        "9",
        "nordline",
        ("q-nw3", "q-nw2", "q-nw1", "q-central-b", "q-se1", "q-se2", "q-se3"),
        H06,
        H22,
        18 * 60,
        7.5,
        30,
    ),
    # A short orbital that never touches Central. It is the only bus link
    # between the western and southern arms, so journeys between them either
    # wait for it or cross the city.
    Line(
        "line-21",
        "21",
        "nordline",
        ("q-w2", "q-nw1", "q-n1", "q-ne1", "q-e1", "q-se1", "q-s1-b"),
        H06,
        H22,
        24 * 60,
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
        ("t-foundry", "t-mill", "t-linden", "t-botanic", "t-university"),
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
        ("t-tanners", "t-market", "t-central", "t-cathedral", "t-riverside"),
        H06,
        H22,
        10 * 60,
        12.0,
        20,
    ),
    # ---- Sudbahn Regional: fast, infrequent, terminus to terminus ---------
    Line(
        "line-r1", "R1", "sudbahn", ("r-west", "r-central-1", "r-east"), H06, H22, 30 * 60, 20.0, 45
    ),
    Line(
        "line-r2",
        "R2",
        "sudbahn",
        ("r-north", "r-central-2", "r-south"),
        H06,
        H22,
        30 * 60,
        20.0,
        45,
    ),
    Line(
        "line-r3",
        "R3",
        "sudbahn",
        ("r-northwest", "r-central-3", "r-southeast"),
        H06,
        H22,
        40 * 60,
        20.0,
        45,
    ),
)

# The hand-picked core of the scored query set. Chosen so some journeys need no
# transfer, some need a free transfer at stand A, some need a walk across
# Central Square, and some are materially faster if you know the tram chord
# exists. Kept verbatim through P0M9 because each one encodes a structure worth
# exercising, and a generated set would cover them only by luck.
SEED_QUERIES: tuple[tuple[str, float, float, float, float, int], ...] = (
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
    # A city whose operators do not talk to each other is one where crossing
    # between their networks is common, not exceptional. These journeys all
    # need a hop no publication declares, so the query set reflects the problem
    # the project is actually about rather than under-sampling it.
    ("q17", 50.4501, 30.5001, 50.4551, 30.5146, 8 * 3600 + 1500),  # W2 -> N1
    ("q18", 50.4501, 30.4931, 50.4551, 30.5146, 12 * 3600 + 900),  # W3 -> N1
    ("q19", 50.4466, 30.5091, 50.4551, 30.5146, 13 * 3600 + 1800),  # SW1 -> N1
    ("q20", 50.4356, 30.5144, 50.4551, 30.5146, 15 * 3600 + 600),  # S3 -> N1
    ("q21", 50.4396, 30.4991, 50.4551, 30.5146, 9 * 3600 + 2400),  # SW3 -> N1
    ("q22", 50.4501, 30.5351, 50.4551, 30.5146, 16 * 3600 + 1200),  # E3 -> N1
)


def _flat_metres(alat: float, alon: float, blat: float, blon: float) -> float:
    """Distance using only +, -, *, / and sqrt.

    Deliberately not haversine. Query *selection* must not depend on the
    platform's libm: `math.sin` and `math.cos` differ in the last bits between
    builds, and a pair sitting on the distance cut-off would then be included on
    one machine and excluded on another, changing the query set and therefore
    every score. These four operations are IEEE-exact everywhere.

    See TECHNICAL-RESEARCH.md §11 and content_hash.py, which exist because the
    same trap bit the world bundle at P0M2.
    """
    dy = (alat - blat) * 111320.0
    dx = (alon - blon) * 111320.0 * 0.64
    return (dx * dx + dy * dy) ** 0.5


def _generate_queries(
    target: int,
    min_separation_m: float = 1500.0,
) -> tuple[tuple[str, float, float, float, float, int], ...]:
    """Systematic origin-destination pairs over the whole city.

    **Why this is generated rather than hand-written.** At 22 scored travellers
    one journey changing outcome was worth about 0.098 of the headline score,
    while Gate 3 has to decide whether conflicts cost 0.2 of it — the gate was
    reading a 0.1 signal with a 0.1 ruler and returned INCONCLUSIVE
    (KNOWN-ISSUES.md #4). Resolution scales with the number of travellers, and
    nobody should hand-author a hundred of them.

    Systematic, not random: every ordered pair of Sites far enough apart to
    need the network, taken in a fixed order at a fixed stride. A seeded sample
    would be reproducible too, but this is *inspectable* — the set can be
    derived by hand from the city, and no seed has to be trusted.
    """
    # An endpoint is a street address near a Site, not the stop itself, so the
    # access walk at both ends is charged (P0M1's teleport).
    points = tuple(
        (site.id, site.lat + 0.00008, site.lon + 0.00008) for site in SITES
    )
    reachable = tuple(
        pt
        for pt in points
        if any(_flat_metres(pt[1], pt[2], q.lat, q.lon) <= MAX_WALK_M for q in QUAYS)
    )

    pairs: list[tuple[str, str, float, float, float, float]] = []
    for oid, olat, olon in reachable:
        for did, dlat, dlon in reachable:
            if oid == did:
                continue
            if _flat_metres(olat, olon, dlat, dlon) < min_separation_m:
                continue
            pairs.append((oid, did, olat, olon, dlat, dlon))
    pairs.sort(key=lambda r: (r[0], r[1]))

    stride = max(1, len(pairs) // target)
    chosen = pairs[::stride][:target]

    out: list[tuple[str, float, float, float, float, int]] = []
    for k, (_oid, _did, olat, olon, dlat, dlon) in enumerate(chosen):
        # Spread departures across the working day. The stride is coprime with
        # the window so the times do not clump on a headway boundary, which
        # would make every traveller wait the same amount and hide exactly the
        # variation the extra travellers are here to provide.
        depart = 7 * 3600 + (k * 1237) % (11 * 3600)
        out.append((f"g{k:03d}", olat, olon, dlat, dlon, depart - depart % 60))
    return tuple(out)


# How many generated journeys to add. Sized so that one traveller changing
# outcome is worth well under the 0.2 of headline Gate 3 must decide, which is
# P0M9's exit condition rather than a round number.
GENERATED_QUERIES = 110


# Movement model. No defects yet, so vehicles run exactly to schedule and the
# per-line speed and dwell fully determine the timetable.
WALK_SPEED_MPS = 1.3
MAX_WALK_M = 400.0


QUERIES: tuple[tuple[str, float, float, float, float, int], ...] = (
    SEED_QUERIES + _generate_queries(GENERATED_QUERIES)
)
