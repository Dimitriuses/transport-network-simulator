// Run logs on disk.
//
// Specification: OBSERVABILITY.md §7.
//
// Two files, for two different failures. While the run goes, every record is
// appended to `<name>.partial.ndjson` as it happens, so a run that crashes still
// leaves what it did. When it finishes, the canonical log — the harness's own
// record order, the order the golden hash is taken over — is written to
// `<name>.ndjson` and the partial file is removed. A partial file left behind
// is therefore a run that did not finish.
//
// **SQLite compaction is not built.** §7 compacts to SQLite at run end for
// analysis; measured at P2M3 a whole day's log is 0.3–0.9 MB of NDJSON, which
// a viewer loads whole, and nothing yet needs to query one.

import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord } from "@tns/schema";
import type { RunStream } from "./harness.ts";

/**
 * The cap on a `verbatim` log's inline bodies, and it is enforced (decided at
 * P0M6). Past it the log carries on at `trace` and says where it stopped:
 * a truncated verbatim log looks complete until the moment you need what is
 * missing. Measured at P2M3, a whole day inlines 16–79 MB.
 */
export const VERBATIM_CAP_BYTES = 250 * 1024 * 1024;

export type LogLevel = "trace" | "verbatim";

export interface RunFile {
  readonly stream: RunStream;
  /** The canonical log's path, once written. */
  readonly path: string;
  finish(log: readonly RunRecord[]): void;
  /** For a run that failed: close the partial file and leave it where it is. */
  abandon(): void;
}

export function openRunFile(
  dir: string,
  name: string,
  level: LogLevel = "trace",
  capBytes: number = VERBATIM_CAP_BYTES,
): RunFile {
  mkdirSync(dir, { recursive: true });
  const partialPath = join(dir, `${name}.partial.ndjson`);
  const path = join(dir, `${name}.ndjson`);
  let fd: number | null = openSync(partialPath, "w");

  // Bodies in the order their ingestion records arrive, which is the order the
  // canonical log holds them in. Bounded by the cap.
  const bodies: (string | undefined)[] = [];
  let bodyBytes = 0;
  let downgrade: { tau: number; note: string } | null = null;

  const write = (record: RunRecord): void => {
    if (fd !== null) writeSync(fd, JSON.stringify(record) + "\n");
  };

  const stream: RunStream = {
    record(record, body) {
      if (record.kind !== "ingestion" || level !== "verbatim") return write(record);

      const bytes = body === undefined ? 0 : Buffer.byteLength(body);
      if (downgrade === null && body !== undefined && bodyBytes + bytes <= capBytes) {
        bodyBytes += bytes;
        bodies.push(body);
        return write({ ...record, body });
      }
      if (downgrade === null) {
        downgrade = {
          tau: record.tau,
          note:
            `verbatim cap of ${Math.round(capBytes / 1048576)} MB reached at τ ${record.tau} ` +
            `after ${bodies.length} bodies; the log continues at trace (OBSERVABILITY.md §7)`,
        };
        write({ kind: "log_note", ...downgrade });
      }
      bodies.push(undefined);
      write(record);
    },
  };

  return {
    stream,
    path,
    finish(log) {
      if (fd !== null) closeSync(fd);
      fd = null;
      const out = openSync(path, "w");
      try {
        let i = 0;
        for (const record of log) {
          if (record.kind === "ingestion") {
            const body = bodies[i++];
            writeSync(out, JSON.stringify(body === undefined ? record : { ...record, body }) + "\n");
          } else {
            writeSync(out, JSON.stringify(record) + "\n");
          }
        }
        if (downgrade) writeSync(out, JSON.stringify({ kind: "log_note", ...downgrade }) + "\n");
      } finally {
        closeSync(out);
      }
      rmSync(partialPath, { force: true });
    },
    abandon() {
      if (fd !== null) closeSync(fd);
      fd = null;
    },
  };
}

/** Read a run log written by `openRunFile`, canonical or partial. */
export function readRunLog(path: string): RunRecord[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RunRecord);
}
