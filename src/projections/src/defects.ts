// The defect library.
//
// Specification: CORECONCEPT.md §2.1 (the catalogue), DATA-MODEL.md §4.
//
// Each function here implements one way an operator can differ from the
// conventional presentation. They are pure functions of their inputs — no wall
// clock, no call counter — because a projection must be a pure function of τ
// (PLAYER-CONTRACT.md §6.4).
//
// The distinction that matters (CORECONCEPT.md §2.1): none of these is a
// *cosmetic* variation. Renaming a field would be busywork — one adapter and
// it is solved forever. These change what the data *means*: which physical
// thing an identifier denotes, where a stop actually is, what instant a
// timestamp refers to. No adapter fixes that; only understanding does.

export type Granularity = "quay" | "site";
export type IdScheme = "prefixed" | "bare_int";
export type NamingVariant = "official" | "abbreviated" | "colloquial";
export type RouteLabel = "name" | "code" | "terminus_pair";
export type Headsign = "destination" | "route_and_destination" | "via";
export type CoordinateSource = "quay" | "site";
export type LatLonOrder = "lat_lon" | "lon_lat";
export type TimeEncoding = "iso_offset" | "epoch_s" | "epoch_ms" | "local_naive";

export interface OperatorManifest {
  readonly id: string;
  readonly name: string;
  readonly dialect: string;
  readonly identity: {
    readonly granularity: Granularity;
    readonly id_scheme: IdScheme;
    readonly prefix: string;
  };
  readonly naming: {
    readonly variant: NamingVariant;
    /**
     * Optional, and read through a default — a bundle built before these
     * existed is a valid bundle, and its operators label routes and headsigns
     * the conventional way (`KNOWN-ISSUES.md` #43).
     */
    readonly route_label?: RouteLabel;
    readonly headsign?: Headsign;
  };
  readonly geometry: {
    readonly precision: number;
    readonly source: CoordinateSource;
    readonly latlon_order: LatLonOrder;
    /** Systematic displacement in metres — a legacy datum, converted badly. */
    readonly offset_m: number;
  };
  readonly time: {
    readonly encoding: TimeEncoding;
    /**
     * Seconds added to the *claimed* UTC offset, leaving the local reading
     * alone. A stale timezone table, or a DST transition applied the wrong way
     * (`KNOWN-ISSUES.md` #48). Optional: a bundle built before it existed is a
     * valid bundle and claims the offset it actually uses.
     */
    readonly offset_shift_s?: number;
  };
  readonly realtime: {
    readonly staleness_s: number;
    readonly cancellations: "explicit" | "silent_drop";
    readonly delay_unit: "seconds" | "minutes";
    readonly publishes_delays: boolean;
    /** What this operator calls a cancellation. Optional; defaults to the word. */
    readonly cancelled_token?: string;
  };
}

// ---------------------------------------------------------------- identity

/**
 * Published identifiers.
 *
 * `bare_int` is the interesting one: two operators both numbering from 1 means
 * stop `7` denotes a different physical place depending on who you asked. A
 * player that keys its model on the identifier alone silently fuses them
 * (catalogue A: ID collisions).
 */
export function publishedId(scheme: IdScheme, prefix: string, kind: "S" | "T" | "R", n: number): string {
  return scheme === "bare_int" ? String(n) : `${prefix}-${kind}${String(n).padStart(4, "0")}`;
}

const ABBREVIATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bStreet\b/g, "St"],
  [/\bSquare\b/g, "Sq"],
  [/\bGarden\b/g, "Gdn"],
  [/\bTerminus\b/g, "Term"],
  [/\bplatform\b/g, "pl"],
  [/\bstand\b/g, "std"],
  [/\btram stop\b/g, "tram"],
  [/\bDepot\b/g, "Dep"],
  [/\bUniversity\b/g, "Univ"],
  [/\bObservatory\b/g, "Obs"],
];

/**
 * Published names.
 *
 * A name is not an identifier, but players use it as one — so the same place
 * appearing as "Central Square, stand A", "Central Sq" and "Tsentralna" is a
 * genuine reconciliation problem rather than a cosmetic one.
 */
export function publishedName(
  variant: NamingVariant,
  official: string,
  names?: Readonly<Record<string, string>>,
): string {
  if (variant === "official") return official;

  // **The world carries its names; this looks them up.** Derivation below is a
  // fallback for an entity the bundle has no row for, and after P1M3 there
  // should be none — `place_names` is written for every site, quay, line and
  // operator. It is kept because a projection that returned an empty string
  // when a name was missing would be a worse failure than an approximate one.
  const stored = names?.[variant];
  if (stored !== undefined && stored !== "") return stored;

  if (variant === "abbreviated") {
    let out = official;
    for (const [pattern, replacement] of ABBREVIATIONS) out = out.replace(pattern, replacement);
    // Drop any qualifier after the comma: the abbreviating operator does not
    // distinguish stands, so two quays end up sharing a published name.
    return out.split(",")[0]!.trim();
  }

  // Colloquial: what locals call it, which is rarely what the sign says.
  //
  // The table is the hand-authored city's, and it stays exactly as it was so
  // that world's published names do not change. **It cannot be the whole rule.**
  // A generated city's places are not in it, so `A-naming` rewrote one name in
  // thirty-three there and the defect audit reported MISS on an operator whose
  // stops it did not happen to know (`KNOWN-ISSUES.md` #39). A lookup of one
  // city's names is not a naming *defect*, it is that city's phrasebook.
  const colloquial: Record<string, string> = {
    "Central Square": "Tsentralna",
    "West Terminus": "Zakhidnyi",
    "East Terminus": "Skhidnyi",
    "North Terminus": "Pivnichnyi",
    "South Terminus": "Pivdennyi",
  };
  const base = official.split(",")[0]!.trim();
  const known = colloquial[base];
  if (known !== undefined) return known;

  // Otherwise the rule locals actually follow: keep the distinctive part and
  // drop the descriptive tail. "Linden Park tram stop" is "Linden" to anybody
  // who catches it, and "Foundry Gate" is "Foundry". Two places whose names
  // differ only in that tail collapse onto one published name, which is the
  // reconciliation problem `A-naming` exists to pose.
  //
  // P1M3 replaces this with generated variants; until then it is what makes the
  // conflict expressible on a city nobody wrote a phrasebook for.
  const words = base.split(/\s+/).filter(Boolean);
  const DESCRIPTIVE = new Set([
    "tram",
    "stop",
    "station",
    "street",
    "square",
    "park",
    "gate",
    "hall",
    "terminus",
    "depot",
    "platform",
    "bridge",
    "lane",
    "wharf",
    "landing",
    "garden",
  ]);
  const kept = words.filter((w) => !DESCRIPTIVE.has(w.toLowerCase()));
  return (kept.length > 0 ? kept : words).join(" ");
}

// ---------------------------------------------------------------- geometry

/**
 * Published coordinates.
 *
 * Truncating precision is the subtle one. Three decimal places is roughly
 * 110 m of error — far too small to look broken, and far too large for a
 * coordinate-threshold matcher to trust. It does not make matching impossible;
 * it makes it *unreliable*, which is worse and more realistic.
 */
export function publishedCoords(
  precision: number,
  order: LatLonOrder,
  offsetM: number,
  lat: number,
  lon: number,
): { lat: number; lon: number } {
  // A systematic offset is the one that actually defeats coordinate matching.
  // Truncation adds noise a generous threshold can absorb; a consistent
  // displacement moves every stop the same way, so widening the threshold does
  // not recover the right pairs — it only adds wrong ones.
  //
  // Degrees per metre at this latitude, as a constant: the core may not call
  // transcendental functions, and this is close enough for a defect whose
  // whole purpose is to be wrong.
  if (offsetM !== 0) lat += offsetM / 111_320;
  // Integer arithmetic on a scaled value: `toFixed` would go through a
  // formatting path, and this stays exact for the precisions in use.
  const scale = precision >= 6 ? 1e6 : precision === 5 ? 1e5 : precision === 4 ? 1e4 : 1e3;

  const rlat = Math.round(lat * scale) / scale;
  const rlon = Math.round(lon * scale) / scale;
  return order === "lon_lat" ? { lat: rlon, lon: rlat } : { lat: rlat, lon: rlon };
}

// -------------------------------------------------------------------- time

/**
 * Published timestamps.
 *
 * `local_naive` is the dangerous one, and deliberately so: it looks like a
 * timestamp, parses like a timestamp, and denotes a different instant than the
 * player assumes unless they work out the world's offset from somewhere else
 * (catalogue B).
 */
export function publishedTime(
  encoding: TimeEncoding,
  isoWithOffset: string,
  epochS: number,
  /**
   * Seconds added to the offset this timestamp *claims* to be in, leaving the
   * local reading untouched (`B-dst-offset`).
   *
   * Only `iso_offset` carries an offset to be wrong about; the catalogue makes
   * the two mutually exclusive, and this ignores the shift for the other
   * encodings rather than relying on that.
   */
  offsetShiftS = 0,
): string | number {
  switch (encoding) {
    case "iso_offset":
      return offsetShiftS === 0 ? isoWithOffset : withClaimedOffset(isoWithOffset, offsetShiftS);
    case "epoch_s":
      return epochS;
    case "epoch_ms":
      return epochS * 1000;
    case "local_naive":
      // The same wall-clock reading, with the offset simply removed.
      return isoWithOffset.slice(0, 19);
  }
}

/**
 * Rewrite the offset an ISO timestamp claims, keeping its local reading.
 *
 * `2031-04-07T08:15:00+03:00` shifted by `-3600` becomes
 * `2031-04-07T08:15:00+02:00`: the same eight-fifteen on the same platform,
 * asserted to be a different instant.
 */
function withClaimedOffset(isoWithOffset: string, shiftS: number): string {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(isoWithOffset);
  if (!m) return isoWithOffset;
  const currentS = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3600 + Number(m[3]) * 60);
  const claimed = currentS + shiftS;
  const sign = claimed < 0 ? "-" : "+";
  const abs = Math.abs(claimed);
  const hh = String(Math.floor(abs / 3600)).padStart(2, "0");
  const mm = String(Math.floor((abs % 3600) / 60)).padStart(2, "0");
  return `${isoWithOffset.slice(0, isoWithOffset.length - m[0].length)}${sign}${hh}:${mm}`;
}

// ------------------------------------------------------- route presentation

/**
 * How a route is labelled.
 *
 * **Texture, and it has to look like texture.** A feed publishing `12` where
 * another publishes `Ringline` is the ordinary state of the world; nothing that
 * matches trips across operators reads either, because `route_id` is right
 * there. It exists so a world is recognisable as the real problem, and so the
 * cosmetic end of the ladder has more than one thing in it (`#43`).
 */
export function publishedRouteLabel(
  style: RouteLabel,
  routeId: string,
  name: string,
  /** The line's two ends, published the way this operator publishes any name. */
  termini: readonly [string, string] | null,
): string {
  if (style === "code") return routeId;
  if (style === "terminus_pair" && termini && termini[0] !== termini[1]) {
    return `${termini[0]} - ${termini[1]}`;
  }
  return name;
}

/**
 * What a trip says about where it is going.
 *
 * `via` is the one worth having: an operator whose line has two branches
 * disambiguates them by naming a stop on the way, so the same destination
 * appears under several headsigns. That is a name collision a player might try
 * to reason from, and it is still cosmetic — the trip's stop sequence says
 * which branch it is, and the sequence is what a solver reads.
 *
 * `via` with nothing to name falls back to the destination rather than
 * publishing a dangling "via": a pattern of two stops has no midpoint, and an
 * operator would not print one.
 */
export function publishedHeadsign(
  style: Headsign,
  routeId: string,
  destination: string,
  via: string | null,
): string {
  if (style === "route_and_destination") return `${routeId} ${destination}`;
  if (style === "via" && via !== null && via !== destination) return `${destination} via ${via}`;
  return destination;
}
