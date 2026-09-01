// L1 — the canonical world.
//
// Specification: DATA-MODEL.md §2.
//
// Plain TypeScript types rather than Zod: L1 never crosses an HTTP boundary.
// It is loaded from the world bundle, which the Python builder validated on
// write (DATA-MODEL.md §5).
//
// Every instant here is an integer count of seconds from the world epoch.
// There is no local time, no timezone and no calendar arithmetic in L1 — that
// is rendering, and rendering happens exactly once, at the operator API
// boundary (TIME-MODEL.md §8).

export interface Site {
  readonly id: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

export interface Quay {
  readonly id: string;
  readonly siteId: string;
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
}

export interface Line {
  readonly id: string;
  readonly name: string;
  readonly operator: string;
}

export interface PatternStop {
  readonly seq: number;
  readonly quayId: string;
  /** Offsets from journey start, in seconds. Absolute times are derived. */
  readonly arriveOffsetS: number;
  readonly departOffsetS: number;
}

export interface Pattern {
  readonly id: string;
  readonly lineId: string;
  readonly heading: string;
  readonly stops: readonly PatternStop[];
}

export interface Journey {
  readonly id: string;
  readonly patternId: string;
  /** Seconds from the world epoch at which the journey leaves its first quay. */
  readonly startS: number;
}

export interface Query {
  readonly id: string;
  readonly originLat: number;
  readonly originLon: number;
  readonly destLat: number;
  readonly destLon: number;
  readonly departAfterS: number;
}

/**
 * Precomputed walking access, in **integer** metres.
 *
 * Distances are never computed at runtime — the core may not call
 * transcendental Math functions. They are integers rather than reals because
 * the offline haversine goes through the platform libm, which differs between
 * operating systems in the last ULP (TECHNICAL-RESEARCH.md §11).
 */
export interface WalkLink {
  readonly fromQuay: string;
  readonly toQuay: string;
  readonly metres: number;
}

export interface QueryAccess {
  readonly queryId: string;
  readonly endpoint: "origin" | "destination";
  readonly quayId: string;
  readonly metres: number;
}

export interface OperatorInfo {
  readonly id: string;
  readonly name: string;
}

export interface WorldManifest {
  readonly schemaVersion: number;
  readonly engineVersion: string;
  readonly seed: number;
  readonly tier: number;
  readonly worldEpochIso: string;
  readonly timezone: string;
  readonly utcOffsetS: number;
  readonly operators: readonly OperatorInfo[];
  /**
   * Canonical hash of the bundle's logical rows.
   *
   * Names this world independently of the SQLite container, which stamps its
   * own version into the file header and is therefore not byte-comparable
   * across machines (DATA-MODEL.md §6).
   */
  readonly contentHash: string;
  readonly walkSpeedMps: number;
  readonly maxWalkM: number;
  /** Declared semantic conflicts. Empty at M1 — see CORECONCEPT.md §2.1. */
  readonly activeConflicts: readonly string[];
}

export interface World {
  readonly manifest: WorldManifest;
  readonly sites: readonly Site[];
  readonly quays: readonly Quay[];
  readonly lines: readonly Line[];
  readonly patterns: readonly Pattern[];
  readonly journeys: readonly Journey[];
  readonly walkLinks: readonly WalkLink[];
  readonly queries: readonly Query[];
  readonly queryAccess: readonly QueryAccess[];
}
