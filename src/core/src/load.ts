// Loading L1 from the world bundle.
//
// Specification: DATA-MODEL.md §6.
//
// node:sqlite is built in and, importantly, *synchronous* — which is exactly
// what a core forbidden from using async needs. One file, readable from Python
// on the build side and TypeScript here, with no third-party dependency on
// either side.

import { DatabaseSync } from "node:sqlite";
import type {
  Journey,
  Line,
  Pattern,
  PatternStop,
  Quay,
  Query,
  QueryAccess,
  Site,
  WalkLink,
  World,
  WorldManifest,
} from "@tns/schema";

type Row = Record<string, string | number | bigint | Uint8Array | null>;

const str = (r: Row, k: string): string => String(r[k]);
const num = (r: Row, k: string): number => Number(r[k]);

function readManifest(db: DatabaseSync): WorldManifest {
  const rows = db.prepare("SELECT key, value FROM manifest").all() as Row[];
  const m = new Map(rows.map((r) => [String(r["key"]), String(r["value"])]));

  const need = (k: string): string => {
    const v = m.get(k);
    if (v === undefined) throw new Error(`world bundle manifest is missing '${k}'`);
    return v;
  };

  const conflicts = need("active_conflicts");

  return {
    schemaVersion: Number(need("schema_version")),
    engineVersion: need("engine_version"),
    seed: Number(need("seed")),
    tier: Number(need("tier")),
    worldEpochIso: need("world_epoch_iso"),
    timezone: need("timezone"),
    utcOffsetS: Number(need("utc_offset_s")),
    operators: need("operators")
      .split(",")
      .map((entry) => {
        const [id, ...rest] = entry.split(":");
        return { id: id ?? entry, name: rest.join(":") };
      }),
    walkSpeedMps: Number(need("walk_speed_mps")),
    maxWalkM: Number(need("max_walk_m")),
    activeConflicts: conflicts === "" ? [] : conflicts.split(","),
  };
}

export function loadWorld(path: string): World {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const manifest = readManifest(db);

    const sites: Site[] = (db.prepare("SELECT * FROM sites ORDER BY id").all() as Row[]).map(
      (r) => ({ id: str(r, "id"), name: str(r, "name"), lat: num(r, "lat"), lon: num(r, "lon") }),
    );

    const quays: Quay[] = (db.prepare("SELECT * FROM quays ORDER BY id").all() as Row[]).map(
      (r) => ({
        id: str(r, "id"),
        siteId: str(r, "site_id"),
        name: str(r, "name"),
        lat: num(r, "lat"),
        lon: num(r, "lon"),
      }),
    );

    const lines: Line[] = (db.prepare("SELECT * FROM lines ORDER BY id").all() as Row[]).map(
      (r) => ({ id: str(r, "id"), name: str(r, "name"), operator: str(r, "operator") }),
    );

    const stopRows = db
      .prepare("SELECT * FROM pattern_stops ORDER BY pattern_id, seq")
      .all() as Row[];
    const stopsByPattern = new Map<string, PatternStop[]>();
    for (const r of stopRows) {
      const pid = str(r, "pattern_id");
      let list = stopsByPattern.get(pid);
      if (!list) stopsByPattern.set(pid, (list = []));
      list.push({
        seq: num(r, "seq"),
        quayId: str(r, "quay_id"),
        arriveOffsetS: num(r, "arrive_offset_s"),
        departOffsetS: num(r, "depart_offset_s"),
      });
    }

    const patterns: Pattern[] = (
      db.prepare("SELECT * FROM patterns ORDER BY id").all() as Row[]
    ).map((r) => {
      const id = str(r, "id");
      return {
        id,
        lineId: str(r, "line_id"),
        heading: str(r, "heading"),
        stops: stopsByPattern.get(id) ?? [],
      };
    });

    const journeys: Journey[] = (
      db.prepare("SELECT * FROM journeys ORDER BY start_s, id").all() as Row[]
    ).map((r) => ({
      id: str(r, "id"),
      patternId: str(r, "pattern_id"),
      startS: num(r, "start_s"),
    }));

    const walkLinks: WalkLink[] = (
      db.prepare("SELECT * FROM quay_distances ORDER BY from_quay, to_quay").all() as Row[]
    ).map((r) => ({
      fromQuay: str(r, "from_quay"),
      toQuay: str(r, "to_quay"),
      metres: num(r, "metres"),
    }));

    const queries: Query[] = (db.prepare("SELECT * FROM queries ORDER BY id").all() as Row[]).map(
      (r) => ({
        id: str(r, "id"),
        originLat: num(r, "origin_lat"),
        originLon: num(r, "origin_lon"),
        destLat: num(r, "dest_lat"),
        destLon: num(r, "dest_lon"),
        departAfterS: num(r, "depart_after_s"),
      }),
    );

    const queryAccess: QueryAccess[] = (
      db
        .prepare("SELECT * FROM query_access ORDER BY query_id, endpoint, quay_id")
        .all() as Row[]
    ).map((r) => ({
      queryId: str(r, "query_id"),
      endpoint: str(r, "endpoint") as "origin" | "destination",
      quayId: str(r, "quay_id"),
      metres: num(r, "metres"),
    }));

    return {
      manifest,
      sites,
      quays,
      lines,
      patterns,
      journeys,
      walkLinks,
      queries,
      queryAccess,
    };
  } finally {
    db.close();
  }
}
