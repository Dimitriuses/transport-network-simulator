// The defect audit.
//
// Specification: DATA-MODEL.md §7, gate 4.
//
// Verifies that every conflict a world *declares* is actually *present* in what
// its operators publish. This is the gate that catches the failure nobody would
// otherwise notice: a manifest claiming a defect against a projection that is
// in fact clean produces a world silently easier than it says it is, which
// corrupts difficulty calibration and makes two "equal" worlds unequal.
//
// It lives on this side of the language seam, unlike the other four validation
// gates, because it is the only one that has to inspect L3 output — and L3 is
// TypeScript. The structural gates stay in tools/validate.
//
// The audit checks *consequences*, not settings. Reading the manifest back and
// confirming it says what it says would prove nothing.

import type { World } from "@tns/schema";
import { projectOperator } from "./project.ts";
import { projectRealtime } from "./realtime.ts";
import type { OperatorManifest } from "./defects.ts";
import { generateDisruptions, type Disruption } from "@tns/core";

export interface AuditFinding {
  readonly conflict: string;
  readonly present: boolean;
  readonly evidence: string;
}

export interface AuditReport {
  readonly declared: readonly string[];
  readonly findings: readonly AuditFinding[];
  readonly missing: readonly string[];
  readonly ok: boolean;
}

const isNumeric = (v: unknown): boolean => typeof v === "number";
const looksIso = (v: unknown): boolean =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(v);
const looksNaive = (v: unknown): boolean =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v);

/** Decimal places actually used by a published coordinate. */
function decimals(n: number): number {
  const s = String(n);
  const dot = s.indexOf(".");
  return dot < 0 ? 0 : s.length - dot - 1;
}

function checkOperator(
  world: World,
  operatorId: string,
  tau: number,
  disruptions: readonly Disruption[],
): { findings: AuditFinding[] } {
  const info = world.manifest.operators.find((o) => o.id === operatorId)!;
  const m = info.manifest as OperatorManifest;
  const { timetable, resolution } = projectOperator(world, operatorId, tau);
  const findings: AuditFinding[] = [];

  const add = (conflict: string, present: boolean, evidence: string): void => {
    findings.push({ conflict: `${conflict}:${operatorId}`, present, evidence });
  };

  // A-granularity: one published stop must stand for several quays.
  if (m.identity.granularity === "site") {
    const multi = [...resolution.stopToQuays.entries()].filter(([, qs]) => qs.length > 1);
    add(
      "A-granularity",
      multi.length > 0,
      multi.length > 0
        ? `${multi.length} stops cover several quays, e.g. ${multi[0]![0]} → ${multi[0]![1].join(", ")}`
        : "every published stop maps to exactly one quay",
    );
  }

  // A-id-scheme: identifiers must actually be bare integers.
  if (m.identity.id_scheme === "bare_int") {
    const bare = timetable.stops.every((s) => /^\d+$/.test(s.stop_id));
    add(
      "A-id-scheme",
      bare,
      bare ? `stop ids are bare integers, e.g. ${timetable.stops[0]?.stop_id}` : "stop ids are prefixed",
    );
  }

  // A-naming: published names must differ from the canonical ones.
  if (m.naming.variant !== "official") {
    const canonical = new Set(
      world.quays.map((q) => q.name).concat(world.sites.map((s) => s.name)),
    );
    const changed = timetable.stops.filter((s) => !canonical.has(s.stop_name));
    add(
      "A-naming",
      changed.length > 0,
      changed.length > 0
        ? `${changed.length}/${timetable.stops.length} names rewritten, e.g. "${changed[0]!.stop_name}"`
        : "published names are identical to the canonical ones",
    );
  }

  // A-coordinate-precision: coordinates must actually be truncated.
  if (m.geometry.precision < 6) {
    const worst = Math.max(...timetable.stops.map((s) => Math.max(decimals(s.lat), decimals(s.lon))));
    add(
      "A-coordinate-precision",
      worst <= m.geometry.precision,
      `deepest published coordinate uses ${worst} dp (manifest declares ${m.geometry.precision})`,
    );
  }

  // A-coordinate-source: published positions must not sit on the quays.
  if (m.geometry.source === "site") {
    const quayCoords = new Set(world.quays.map((q) => `${q.lat},${q.lon}`));
    const offset = timetable.stops.filter((s) => !quayCoords.has(`${s.lat},${s.lon}`));
    add(
      "A-coordinate-source",
      offset.length > 0,
      `${offset.length}/${timetable.stops.length} published positions sit on no quay`,
    );
  }

  // C-coordinate-offset: published positions must be systematically displaced.
  if (m.geometry.offset_m !== 0) {
    const own = new Set(resolution.quayToStop.keys());
    const quays = world.quays.filter((q) => own.has(q.id));
    const drifts = timetable.stops.map((s, i) => {
      const q = quays[i];
      return q ? Math.abs(s.lat - q.lat) * 111_320 : 0;
    });
    const median = drifts.sort((a, b) => a - b)[Math.floor(drifts.length / 2)] ?? 0;
    add(
      "C-coordinate-offset",
      median > m.geometry.offset_m * 0.5,
      `published positions sit a median ${median.toFixed(0)} m from their quays ` +
        `(manifest declares ${m.geometry.offset_m} m)`,
    );
  }

  // C-latlon-order.
  if (m.geometry.latlon_order === "lon_lat") {
    const swapped = timetable.stops.every((s) => s.lat > 20 && s.lat < 40);
    add("C-latlon-order", swapped, swapped ? "latitudes are in the longitude range" : "not swapped");
  }

  // B-time-encoding: a published timestamp must be in the declared form.
  if (m.time.encoding !== "iso_offset") {
    const sample = timetable.trips[0]?.stop_times[0]?.depart;
    const matches =
      m.time.encoding === "epoch_s" || m.time.encoding === "epoch_ms"
        ? isNumeric(sample)
        : looksNaive(sample) && !looksIso(sample);
    add(
      "B-time-encoding",
      matches,
      `published departure is ${JSON.stringify(sample)} (declared ${m.time.encoding})`,
    );
  }

  // ---- realtime (catalogue D) --------------------------------------------
  //
  // These are checked by *comparing the feed against the truth*, which is the
  // only way to tell a lagging feed from an honest one. Reading the policy
  // back would prove nothing.
  if (
    m.realtime.staleness_s > 0 ||
    m.realtime.cancellations !== "explicit" ||
    m.realtime.delay_unit !== "seconds" ||
    !m.realtime.publishes_delays
  ) {
    // A moment by which plenty has been announced.
    const probe = 12 * 3600;
    const feed = projectRealtime(world, operatorId, disruptions, m.realtime, probe);
    const mine = new Set(resolution.tripToJourney.values());
    const knownNow = disruptions.filter((d) => d.announcedAtS <= probe && mine.has(d.journeyId));
    const knownStale = disruptions.filter(
      (d) => d.announcedAtS <= probe - m.realtime.staleness_s && mine.has(d.journeyId),
    );

    if (m.realtime.staleness_s > 0) {
      add(
        "D-staleness",
        knownNow.length > knownStale.length || feed.as_of !== probe,
        `feed is stamped τ−${m.realtime.staleness_s}s, and hides ` +
          `${knownNow.length - knownStale.length} disruption(s) that are already true`,
      );
    }

    if (m.realtime.cancellations === "silent_drop") {
      const cancelled = knownStale.filter((d) => d.kind === "cancellation");
      const reported = feed.updates.filter((u) => u.status === "cancelled").length;
      add(
        "D-silent-cancellation",
        reported === 0 && cancelled.length > 0,
        `${cancelled.length} cancellations known, ${reported} reported — the trips ` +
          `simply vanish from the feed`,
      );
    }

    if (m.realtime.delay_unit === "minutes") {
      const delayed = feed.updates.filter((u) => u.status === "delayed" && u.delay !== undefined);
      const truth = new Map(knownStale.map((d) => [d.journeyId, d.delayS]));
      const anyTruncated = delayed.some((u) => {
        const journeyId = resolution.tripToJourney.get(u.trip_id);
        const real = journeyId ? truth.get(journeyId) : undefined;
        return real !== undefined && u.delay !== real;
      });
      add(
        "C-delay-unit",
        anyTruncated,
        anyTruncated
          ? `delays published in minutes, so the figure differs from the truth in seconds`
          : "published delays match the underlying seconds",
      );
    }

    if (!m.realtime.publishes_delays) {
      const anyDelay = feed.updates.some((u) => u.status === "delayed");
      add("D-no-delays", !anyDelay, anyDelay ? "delays are published" : "no delay is ever reported");
    }
  }

  return { findings };
}

export function auditWorld(world: World, tau = 0): AuditReport {
  const declared = [...world.manifest.activeConflicts].sort();
  const findings: AuditFinding[] = [];

  // The same day the run would see: disruptions come from the world seed.
  const disruptions = generateDisruptions(world.journeys, world.manifest.seed);

  for (const op of world.manifest.operators) {
    findings.push(...checkOperator(world, op.id, tau, disruptions).findings);
  }

  // Cross-operator: bare integer ids from two operators must actually collide.
  const bare = world.manifest.operators.filter(
    (o) => (o.manifest as OperatorManifest).identity.id_scheme === "bare_int",
  );
  if (bare.length > 1) {
    const sets = bare.map(
      (o) => new Set(projectOperator(world, o.id, tau).timetable.stops.map((s) => s.stop_id)),
    );
    const shared = [...sets[0]!].filter((id) => sets.every((s) => s.has(id)));
    findings.push({
      conflict: `A-id-collision:${bare.map((o) => o.id).sort().join("+")}`,
      present: shared.length > 0,
      evidence:
        shared.length > 0
          ? `${shared.length} stop ids denote a different place per operator, e.g. "${shared[0]}"`
          : "no identifier is reused across operators",
    });
  }

  const present = new Set(findings.filter((f) => f.present).map((f) => f.conflict));
  const missing = declared.filter((c) => !present.has(c));

  return {
    declared,
    findings: findings.sort((a, b) => (a.conflict < b.conflict ? -1 : 1)),
    missing,
    ok: missing.length === 0 && findings.every((f) => f.present),
  };
}
