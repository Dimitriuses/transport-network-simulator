"""Generating place names, and the several names one place goes by.

Specification: ROADMAP.md P1M3, CORECONCEPT.md §1 (Names) and §2.1 A.

**A name variant is a fact about a place, not a function of its official name.**
That is the whole finding of `KNOWN-ISSUES.md` #39, and it decides the shape of
this module. `publishedName` used to derive the colloquial variant with a
hard-coded lookup of the hand-authored city's five best-known places; on a
generated city it rewrote one name in thirty-three and the defect audit reported
MISS. A lookup of one city's names is that city's phrasebook.

Some variants *can* be derived — "Foundry Gate" abbreviates to "Foundry Gt" by
rule. **A transliteration cannot.** Nothing about the string "Central Square"
yields "Tsentralna"; you have to know. `CORECONCEPT.md` §2.1 asks for exactly
that — "abbreviations, transliterations, official versus colloquial" — so the
generator produces the variants alongside the name and the world carries them.

## What a place is called

Each place gets a stem and a descriptor, and the stem carries its own local
form:

    official      "Foundry Gate"      what the sign says
    colloquial    "Lyvarna"           what people say, and not derivable
    abbreviated   "Foundry Gt"        what fits in a timetable column
    former        "October Gate"      renamed, and still referenced by the old
                                      name in one operator's data

Two places may share a colloquial name — locals are not careful — and that is
the reconciliation problem `A-naming` exists to pose rather than a bug.

## Determinism

Only `Random.random()`. `choice`, `shuffle` and `sample` are helpers whose
implementations have changed between CPython releases, and a world that names
itself differently on another machine is worse than one with no names at all.
The shuffle below is an explicit Fisher-Yates over a single `random()` stream.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

#: Stems, each with the local form people actually use.
#:
#: The pairing is the point: the second column cannot be computed from the
#: first. Kyiv-flavoured, to match the hand-authored city, whose "Central
#: Square" is "Tsentralna" and whose termini are "Zakhidnyi" and "Skhidnyi".
STEMS: tuple[tuple[str, str], ...] = (
    ("Foundry", "Lyvarna"),
    ("Mill", "Mlynova"),
    ("Cathedral", "Soborna"),
    ("Riverside", "Naberezhna"),
    ("Botanic", "Botanichna"),
    ("University", "Universytet"),
    ("Market", "Rynok"),
    ("Harbour", "Havan"),
    ("Glassworks", "Sklozavod"),
    ("Observatory", "Zirkova"),
    ("Linden", "Lypky"),
    ("Chalk", "Kreidiana"),
    ("Tanners", "Kozhumiaky"),
    ("Lime", "Vapniana"),
    ("Quarry", "Kamianka"),
    ("Ferry", "Poromna"),
    ("Northgate", "Pivnichni Vorota"),
    ("Tannery", "Chynbarnia"),
    ("Brewery", "Brovarna"),
    ("Arsenal", "Arsenalna"),
    ("Meadow", "Luhova"),
    ("Willow", "Verbova"),
    ("Forge", "Kuznia"),
    ("Granary", "Zernova"),
    ("Salt", "Solianka"),
    ("Cooper", "Bondarska"),
    ("Weavers", "Tkatska"),
    ("Orchard", "Sadova"),
    ("Windmill", "Vitriak"),
    ("Stonecutters", "Kameniariv"),
    ("Bell", "Dzvinkova"),
    ("Fountain", "Fontanna"),
    ("Academy", "Akademichna"),
    ("Printworks", "Drukarska"),
    ("Vineyard", "Vynohradna"),
    ("Ropewalk", "Kanatna"),
    ("Bakers", "Pekarska"),
    ("Anchor", "Yakirna"),
    ("Lantern", "Likhtarna"),
    ("Chestnut", "Kashtanova"),
)

#: Descriptors, with the abbreviation a cramped timetable column uses.
DESCRIPTORS: tuple[tuple[str, str], ...] = (
    ("Street", "St"),
    ("Square", "Sq"),
    ("Gate", "Gt"),
    ("Park", "Pk"),
    ("Bridge", "Br"),
    ("Hall", "Hl"),
    ("Wharf", "Whf"),
    ("Garden", "Gdn"),
    ("Lane", "Ln"),
    ("Landing", "Ldg"),
)

#: What a place was called before it was renamed, for the places that were.
#:
#: Renaming is in `CORECONCEPT.md` §2.1 A — "renamed-but-still-referenced-by-old-
#: name" — and it is the variant a player is most likely to get wrong, because
#: nothing marks it as stale.
FORMER_PREFIXES: tuple[str, ...] = ("October", "Soviet", "Proletarian", "Komsomol")


@dataclass(frozen=True)
class PlaceNames:
    """Everything one place is called."""

    official: str
    colloquial: str
    abbreviated: str
    #: Present only for places that were renamed.
    former: str | None = None

    def as_rows(self, entity_id: str) -> list[tuple[str, str, str]]:
        """`(entity_id, variant, name)` for the bundle."""
        rows = [
            (entity_id, "official", self.official),
            (entity_id, "colloquial", self.colloquial),
            (entity_id, "abbreviated", self.abbreviated),
        ]
        if self.former is not None:
            rows.append((entity_id, "former", self.former))
        return rows


def _shuffled(rng: random.Random, items: tuple, count: int) -> list:
    """`count` items, without replacement, from a single `random()` stream.

    Fisher-Yates written out rather than `random.sample`, whose implementation
    has changed between CPython releases (see the module docstring).
    """
    pool = list(items)
    n = len(pool)
    for i in range(n - 1, 0, -1):
        j = int(rng.random() * (i + 1))
        pool[i], pool[j] = pool[j], pool[i]
    if count <= n:
        return pool[:count]
    # More places than stems: reuse them, which real cities also do — "Mill
    # Street" and "Mill Lane" are different places with the same stem, and an
    # operator publishing colloquially collapses them onto one name. That is
    # the reconciliation problem, not a collision to avoid.
    out = list(pool)
    while len(out) < count:
        out.extend(pool)
    return out[:count]


def generate_place_names(count: int, seed: int, rename_share: float = 0.15) -> list[PlaceNames]:
    """`count` distinct places, each with the names it goes by.

    Deterministic in `seed`. Officially distinct — two places never share an
    official name — while colloquial forms may collide, which is exactly what
    makes a name a poor identifier.
    """
    rng = random.Random(seed)
    stems = _shuffled(rng, STEMS, count)

    out: list[PlaceNames] = []
    used: set[str] = set()
    used_former: set[str] = set()
    for stem_en, stem_local in stems:
        # Draw a descriptor, then step through the list until the official name
        # is one nothing else has. A reused stem therefore lands on a different
        # descriptor — "Mill Street" and "Mill Lane" are different places, which
        # is what a real city does and what makes a colloquial name ambiguous.
        start = int(rng.random() * len(DESCRIPTORS))
        d_en, d_short = DESCRIPTORS[start]
        for step in range(len(DESCRIPTORS)):
            d_en, d_short = DESCRIPTORS[(start + step) % len(DESCRIPTORS)]
            if f"{stem_en} {d_en}" not in used:
                break
        official = f"{stem_en} {d_en}"
        if official in used:
            official = f"{stem_en} {d_en} {len(used)}"
        used.add(official)

        # A renamed place. The old name replaced the *stem*, as post-Soviet
        # renamings did, and no two places in one city carried the same one —
        # so it is drawn until it is unique rather than allowed to collide.
        former = None
        if rng.random() < rename_share:
            start = int(rng.random() * len(FORMER_PREFIXES))
            for step in range(len(FORMER_PREFIXES)):
                candidate = f"{FORMER_PREFIXES[(start + step) % len(FORMER_PREFIXES)]} {d_en}"
                if candidate not in used_former and candidate not in used:
                    former = candidate
                    used_former.add(candidate)
                    break

        out.append(
            PlaceNames(
                official=official,
                colloquial=stem_local,
                abbreviated=f"{stem_en} {d_short}",
                former=former,
            )
        )
    return out


#: Operator names, as several companies rather than one company three times.
OPERATOR_NAMES: dict[str, PlaceNames] = {
    "nordline": PlaceNames("Nordline Transit", "Nordline", "NL"),
    "ostline": PlaceNames("Ostline Tram", "Ostline", "OL"),
    "sudbahn": PlaceNames("Sudbahn Regional", "Sudbahn", "SB"),
}


#: What locals call the hand-authored city's best-known places.
#:
#: This is the phrasebook `KNOWN-ISSUES.md` #39 objected to — and it is fine
#: *here*, as data about one city, written beside that city. What it must not be
#: is a function in the projection layer pretending to work for every city.
HAND_CITY_COLLOQUIAL: dict[str, str] = {
    "Central Square": "Tsentralna",
    "West Terminus": "Zakhidnyi",
    "East Terminus": "Skhidnyi",
    "North Terminus": "Pivnichnyi",
    "South Terminus": "Pivdennyi",
    "Northwest Terminus": "Pivnichno-Zakhidnyi",
    "Southeast Terminus": "Pivdenno-Skhidnyi",
    "Southwest Depot": "Pivdenno-Zakhidne Depo",
    "Northeast Depot": "Pivnichno-Skhidne Depo",
    "Mill Street": "Mlynova",
    "Foundry Gate": "Lyvarna",
    "Cathedral": "Soborna",
    "Riverside": "Naberezhna",
    "Botanic Garden": "Botanichna",
    "University": "Universytet",
    "Market Hall": "Rynok",
    "Old Harbour": "Stara Havan",
    "Glassworks": "Sklozavod",
    "Observatory": "Zirkova",
    "Parkside": "Parkova",
    "Linden Park": "Lypky",
    "Chalk Hill": "Kreidiana",
    "Tanners Bridge": "Kozhumiaky",
    "Lime Wharf": "Vapniana",
    "Quarry Lane": "Kamianka",
    "Ferry Landing": "Poromna",
    "Northgate": "Pivnichni Vorota",
    "Tannery": "Chynbarnia",
    "Brewery": "Brovarna",
}

#: Mechanical shortenings, longest first so "Terminus" is not caught by "Term".
_ABBREVIATIONS: tuple[tuple[str, str], ...] = (
    ("Terminus", "Term"),
    ("Northwest", "NW"),
    ("Northeast", "NE"),
    ("Southwest", "SW"),
    ("Southeast", "SE"),
    ("Observatory", "Obs"),
    ("University", "Univ"),
    ("Glassworks", "Glass"),
    ("Cathedral", "Cath"),
    ("Riverside", "Rvrsd"),
    ("Landing", "Ldg"),
    ("Garden", "Gdn"),
    ("Street", "St"),
    ("Square", "Sq"),
    ("Bridge", "Br"),
    ("Harbour", "Hbr"),
    ("Market", "Mkt"),
    ("Depot", "Dep"),
    ("Wharf", "Whf"),
    ("Park", "Pk"),
    ("Gate", "Gt"),
    ("Hall", "Hl"),
    ("Hill", "Hl"),
    ("Lane", "Ln"),
)


def derive_variants(official: str, colloquial: str | None = None) -> PlaceNames:
    """The names a hand-authored place goes by, from its official one.

    **Derivation is the fallback, not the model.** An abbreviation follows from
    the string; a transliteration does not, which is why `colloquial` is passed
    in for the places the city knows. Where it is absent the rule locals follow
    is the next best thing: keep the distinctive part, drop the descriptive
    tail — "Foundry Gate" is "Foundry" to anybody who catches a bus there.

    Used at build time so the projection never has to derive anything.
    """
    base = official.split(",")[0].strip()

    short = base
    for long_form, abbrev in _ABBREVIATIONS:
        short = short.replace(long_form, abbrev)

    if colloquial is None:
        colloquial = HAND_CITY_COLLOQUIAL.get(base)
    if colloquial is None:
        # A tram stop beside Foundry Gate is Foundry Gate to anybody who
        # catches a tram there, so it answers to the same word. That is what
        # makes a colloquial name a poor identifier and a good clue: two quays
        # nobody declared to be the same place share one.
        for facility in (" tram stop", " station", " stop"):
            if base.endswith(facility):
                colloquial = HAND_CITY_COLLOQUIAL.get(base[: -len(facility)])
                break
    if colloquial is None:
        descriptive = {abbrev_from for abbrev_from, _ in _ABBREVIATIONS}
        kept = [w for w in base.split() if w not in descriptive]
        colloquial = " ".join(kept) if kept else base

    return PlaceNames(official=official, colloquial=colloquial, abbreviated=short)
