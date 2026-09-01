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

/** Precomputed walking access, in metres. Distances never computed at runtime. */
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

export interface WorldManifest {
  readonly schemaVersion: number;
  readonly engineVersion: string;
  readonly seed: number;
  readonly tier: number;
  readonly worldEpochIso: string;
  readonly timezone: string;
  readonly utcOffsetS: number;
  readonly operatorId: string;
  readonly operatorName: string;
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
