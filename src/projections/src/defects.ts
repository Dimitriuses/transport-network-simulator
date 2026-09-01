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
  readonly naming: { readonly variant: NamingVariant };
  readonly geometry: {
    readonly precision: number;
    readonly source: CoordinateSource;
    readonly latlon_order: LatLonOrder;
    /** Systematic displacement in metres — a legacy datum, converted badly. */
    readonly offset_m: number;
  };
  readonly time: { readonly encoding: TimeEncoding };
  readonly realtime: {
    readonly staleness_s: number;
    readonly cancellations: "explicit" | "silent_drop";
    readonly delay_unit: "seconds" | "minutes";
    readonly publishes_delays: boolean;
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
export function publishedName(variant: NamingVariant, official: string): string {
  if (variant === "official") return official;

  if (variant === "abbreviated") {
    let out = official;
    for (const [pattern, replacement] of ABBREVIATIONS) out = out.replace(pattern, replacement);
    // Drop any qualifier after the comma: the abbreviating operator does not
    // distinguish stands, so two quays end up sharing a published name.
    return out.split(",")[0]!.trim();
  }

  // Colloquial: what locals call it, which is rarely what the sign says.
  const colloquial: Record<string, string> = {
    "Central Square": "Tsentralna",
    "West Terminus": "Zakhidnyi",
    "East Terminus": "Skhidnyi",
    "North Terminus": "Pivnichnyi",
    "South Terminus": "Pivdennyi",
  };
  const base = official.split(",")[0]!.trim();
  return colloquial[base] ?? base;
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
): string | number {
  switch (encoding) {
    case "iso_offset":
      return isoWithOffset;
    case "epoch_s":
      return epochS;
    case "epoch_ms":
      return epochS * 1000;
    case "local_naive":
      // The same wall-clock reading, with the offset simply removed.
      return isoWithOffset.slice(0, 19);
  }
}
