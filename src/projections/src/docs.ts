// Each operator's own API documentation, generated from its own manifest.
//
// Specification: DATA-MODEL.md §5, PLAYER-CONTRACT.md §6.1, CORECONCEPT.md §2.1 F.
//
// The brief advertises a `docs_url` for every operator and, until P1M1, nothing
// served it (`KNOWN-ISSUES.md` #11). A player had to discover each schema by
// fetching and reading, which is harder than intended and hard in the wrong
// way — endpoint archaeology rather than reconciliation — and a world whose
// documentation is absent teaches players to ignore documentation, which is the
// opposite of what §2.1 F is for.
//
// **Generated from the manifest at request time, not baked into the bundle.**
// One source for behaviour and description means they cannot drift by accident.
// Phase 3 introduces divergence deliberately and will need somewhere to keep
// the intended-but-untrue version; until then there is nothing to keep.
//
// ---
//
// ## What an operator documents, and what it does not
//
// This line materially changes how hard a world is, so it is stated here rather
// than left to accumulate case by case:
//
//   **Format and units are documented. Accuracy, freshness and completeness are
//   not.**
//
// The justification is that an operator can only document what it *intends*. A
// real agency states its time encoding, its identifier scheme, and whether a
// position refers to a station or to a boarding point — all deliberate choices,
// and all things its own engineers had to decide. No agency documents that its
// survey is 130 m out, that its feed lags five minutes, or that cancelled trips
// vanish without notice: those are things it either does not know or would not
// admit.
//
// Applied to the catalogue this lands as:
//
//   documented      A-granularity, A-id-scheme, A-coordinate-source,
//                   B-time-encoding, C-delay-unit, D-no-delays
//   not documented  A-naming, A-coordinate-precision, C-coordinate-offset,
//                   C-latlon-order, D-staleness, D-silent-cancellation
//
// So sections A and B become *readable* rather than archaeological, while every
// conflict about whether the data is **true** — which is where §2.1 says the
// difficulty lives — stays discoverable only by measurement.
//
// Nothing here says anything about another operator. How three feeds relate is
// the game, and no operator knows the answer.

import type { World } from "@tns/schema";
import type { OperatorManifest } from "./defects.ts";

/** A short prose note about one aspect of this feed. */
export interface OperatorNote {
  readonly title: string;
  readonly text: string;
}

function identityNotes(m: OperatorManifest): OperatorNote[] {
  return [
    m.identity.granularity === "site"
      ? {
          title: "Stops are stations",
          text:
            "A `stop_id` identifies a station as a whole. Where a station has " +
            "several boarding points they are published as one stop, and the " +
            "position given is the station's.",
        }
      : {
          title: "Stops are boarding points",
          text:
            "A `stop_id` identifies a single boarding point. A station with " +
            "several platforms appears here as several stops.",
        },
    m.identity.id_scheme === "bare_int"
      ? {
          title: "Identifier format",
          text:
            "`stop_id` is a decimal integer, unique within this API. It carries " +
            "no prefix and no meaning outside it.",
        }
      : {
          title: "Identifier format",
          text:
            `\`stop_id\` is prefixed with \`${m.identity.prefix ?? ""}\` and is ` +
            "unique within this API. It carries no meaning outside it.",
        },
  ];
}

function geometryNotes(m: OperatorManifest): OperatorNote[] {
  // Only the *source* of a coordinate is documented. Precision, offset and axis
  // order are accuracy, and an operator that knew about them would have fixed
  // them rather than written them down.
  return [
    {
      title: "Positions",
      text:
        "`lat` and `lon` are WGS 84 decimal degrees. " +
        (m.geometry.source === "site"
          ? "The position given is the centre of the station, not that of the " +
            "boarding point a service actually calls at."
          : "The position given is that of the boarding point itself."),
    },
  ];
}

function timeNotes(m: OperatorManifest): OperatorNote[] {
  const text: Record<string, string> = {
    iso_offset:
      "Departure times are ISO 8601 with an explicit UTC offset, e.g. " +
      "`2026-01-01T08:14:00+02:00`.",
    epoch_s: "Departure times are integer seconds since the Unix epoch, UTC.",
    epoch_ms: "Departure times are integer milliseconds since the Unix epoch, UTC.",
    local_naive:
      "Departure times are ISO 8601 local time with no offset, e.g. " +
      "`2026-01-01T08:14:00`. The applicable offset is not part of this feed.",
  };
  return [
    { title: "Time format", text: text[m.time.encoding] ?? "Departure times are ISO 8601." },
  ];
}

function realtimeNotes(m: OperatorManifest): OperatorNote[] {
  if (!m.realtime.publishes_delays) {
    // A capability, not a quality claim: the field is genuinely absent from
    // every response, and saying so is what any API reference would do.
    return [
      {
        title: "Delays",
        text:
          "This feed reports which services are running. It does not report how " +
          "late they are and carries no delay field.",
      },
    ];
  }
  return [
    {
      title: "Delays",
      text:
        "`delay` is the deviation from the timetable, positive when late, in " +
        (m.realtime.delay_unit === "minutes" ? "**minutes**." : "**seconds**."),
    },
  ];
}

function manifestOf(world: World, operatorId: string): OperatorManifest {
  const info = world.manifest.operators.find((o) => o.id === operatorId);
  if (!info) throw new Error(`no such operator: ${operatorId}`);
  return info.manifest as OperatorManifest;
}

/** Everything this operator says about itself, in the order a reader wants it. */
export function operatorNotes(world: World, operatorId: string): OperatorNote[] {
  const m = manifestOf(world, operatorId);
  return [...identityNotes(m), ...geometryNotes(m), ...timeNotes(m), ...realtimeNotes(m)];
}

/**
 * An OpenAPI 3.1 document for one operator, describing what it actually serves.
 *
 * A plain object rather than YAML, so the boundary can serve it as JSON without
 * a serialiser and tests can assert on it directly.
 */
export function operatorDocs(world: World, operatorId: string): Record<string, unknown> {
  const info = world.manifest.operators.find((o) => o.id === operatorId)!;
  const m = manifestOf(world, operatorId);
  const notes = operatorNotes(world, operatorId);
  const noteText = (title: string): string => notes.find((n) => n.title === title)?.text ?? "";

  const departure =
    m.time.encoding === "epoch_s" || m.time.encoding === "epoch_ms"
      ? { type: "integer", description: noteText("Time format") }
      : {
          type: "string",
          ...(m.time.encoding === "iso_offset" ? { format: "date-time" } : {}),
          description: noteText("Time format"),
        };

  const update = {
    type: "object",
    properties: {
      trip_id: { type: "string" },
      ...(m.realtime.publishes_delays
        ? {
            delay: {
              type: "integer",
              description: `Deviation from the timetable, in ${m.realtime.delay_unit}.`,
            },
          }
        : {}),
    },
  };

  const stopIdNote = noteText("Identifier format");
  const granularityNote = notes[0]!.text;

  return {
    openapi: "3.1.0",
    info: {
      title: `${info.name} — public data API`,
      version: "1.0.0",
      description:
        notes.map((n) => `### ${n.title}\n\n${n.text}`).join("\n\n") +
        "\n\n---\n\nThis document describes the *format* of this feed. It makes " +
        "no claim about the accuracy, freshness or completeness of the data, " +
        "and says nothing about any other operator.",
    },
    paths: {
      "/timetable": {
        get: {
          summary: "The published timetable.",
          responses: {
            "200": {
              description: "The whole timetable. Not paginated.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      stops: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            stop_id: { type: "string", description: stopIdNote },
                            stop_name: { type: "string" },
                            lat: { type: "number", description: noteText("Positions") },
                            lon: { type: "number", description: noteText("Positions") },
                          },
                        },
                        description: granularityNote,
                      },
                      departures: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: { stop_id: { type: "string" }, departure },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/realtime": {
        get: {
          summary: m.realtime.publishes_delays
            ? "Current deviations from the timetable."
            : "Which services are currently running.",
          responses: {
            "200": {
              description: "The current picture, as this feed has it.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { updates: { type: "array", items: update } },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
