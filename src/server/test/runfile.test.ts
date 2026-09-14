// Run logs on disk (OBSERVABILITY.md §7): a partial file while running, the
// canonical log at the end, and a verbatim cap that downgrades rather than truncates.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunRecord } from "@tns/schema";
import { hashLog } from "../src/harness.ts";
import { openRunFile, readRunLog } from "../src/runfile.ts";

const header: RunRecord = {
  kind: "run_header",
  runId: "t",
  worldSeed: 1,
  worldContentHash: "h",
  engineVersion: "e",
  scorerVersion: "s",
  contractVersion: "c",
  timeMode: "virtual",
  latencyMode: "none",
  referenceCompetence: "timetable",
  hardwareProfile: null,
};
const call = (tau: number): RunRecord => ({
  kind: "ingestion",
  tau,
  operator: "op",
  endpoint: "GET /realtime",
  status: 200,
  bytes: 10,
  bodyHash: `h${tau}`,
  cause: null,
});
const note: RunRecord = { kind: "notification", tau: 5, travellerRef: "trv-1", notificationKind: "disruption", message: "m" };

function withDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "tns-runfile-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("records stream to a partial file, and the canonical log replaces it at the end", () =>
  withDir((dir) => {
    const file = openRunFile(dir, "run");
    file.stream.record(header);
    file.stream.record(call(1), "0123456789");
    const partial = join(dir, "run.partial.ndjson");
    assert.equal(readRunLog(partial).length, 2, "what happened so far is on disk before the run ends");
    assert.ok(!readFileSync(partial, "utf8").includes("0123456789"), "a trace log carries no bodies");

    // The canonical order is the harness's, not the order things happened in.
    const log = [header, note, call(1)];
    file.finish(log);
    assert.ok(!existsSync(partial), "a finished run leaves no partial file");
    assert.deepEqual(readRunLog(file.path), log);
  }));

test("a run that fails keeps its partial file", () =>
  withDir((dir) => {
    const file = openRunFile(dir, "run");
    file.stream.record(header);
    file.abandon();
    assert.ok(existsSync(join(dir, "run.partial.ndjson")));
    assert.ok(!existsSync(file.path));
  }));

test("verbatim inlines bodies, hashes like trace, and downgrades at its cap rather than truncating", () =>
  withDir((dir) => {
    // A cap of 25 bytes holds two ten-byte bodies and not a third.
    const file = openRunFile(dir, "run", "verbatim", 25);
    const log = [header, call(1), call(2), call(3), call(4)];
    file.stream.record(header);
    for (const [i, r] of log.slice(1).entries()) file.stream.record(r, `body-${i}----`.slice(0, 10));
    file.finish(log);

    const written = readRunLog(file.path);
    const ingestion = written.filter((r): r is Extract<RunRecord, { kind: "ingestion" }> => r.kind === "ingestion");
    assert.deepEqual(
      ingestion.map((r) => r.body),
      ["body-0----", "body-1----", undefined, undefined],
      "bodies up to the cap, and none after it",
    );
    assert.equal(ingestion.length, 4, "every call is still recorded past the cap");
    const notes = written.filter((r) => r.kind === "log_note");
    assert.equal(notes.length, 1);
    assert.match((notes[0] as { note: string }).note, /cap .* reached at τ 3/);

    // Bodies are regenerable, so a verbatim log of a run hashes as its trace log does.
    assert.equal(hashLog(written.filter((r) => r.kind !== "log_note")), hashLog(log));
  }));
