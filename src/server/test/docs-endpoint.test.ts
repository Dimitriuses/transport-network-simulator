// The brief advertises `docs_url`. This asserts something answers it.
//
// Specification: PLAYER-CONTRACT.md §6.1, KNOWN-ISSUES.md #11.
//
// The unit tests in `src/projections/test/docs.test.ts` check that the document
// is *true*. This checks it is *reachable*, which is the half that was missing:
// the URL was advertised for the whole of Phase 0 and returned 404.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { startOperatorApi, type OperatorCall } from "../src/apis.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

// Above the walking skeleton's blocks, which start at 8200.
const PORT = 8391;

test("every operator serves its own documentation at /docs", { skip }, async () => {
  const world = loadWorld(worldPath);
  for (const [i, op] of world.manifest.operators.entries()) {
    const calls: OperatorCall[] = [];
    const server = await startOperatorApi(
      world,
      op.id,
      [],
      () => 0,
      (c) => calls.push(c),
      PORT + i,
    );
    try {
      const res = await fetch(`http://127.0.0.1:${PORT + i}/docs`);
      assert.equal(res.status, 200, `${op.id} does not serve its advertised docs_url`);
      const doc = (await res.json()) as { openapi: string; info: { title: string } };
      assert.equal(doc.openapi, "3.1.0");
      assert.ok(doc.info.title.includes(op.name), `${op.id} serves another operator's document`);

      // Reading the documentation is part of what a player did, and the log is
      // what `OBSERVABILITY.md` reconstructs a run from.
      assert.ok(
        calls.some((c) => c.endpoint === "GET /docs" && c.status === 200),
        `${op.id} served /docs without logging the call`,
      );

      // The snapshot rule (PLAYER-CONTRACT.md §6.4). Format does not change
      // during a run, so this one holds at every τ rather than merely at equal
      // ones — but it is the same rule and worth pinning.
      const again = await fetch(`http://127.0.0.1:${PORT + i}/docs`);
      assert.deepEqual(await again.json(), doc, `${op.id}'s documentation changed between calls`);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
});

test("an endpoint nobody advertised is still a 404", { skip }, async () => {
  // Serving /docs must not have turned the operator API into something that
  // answers anything, which would hide a player's typo from itself.
  const world = loadWorld(worldPath);
  const server = await startOperatorApi(world, world.manifest.operators[0]!.id, [], () => 0, () => {}, PORT + 50);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT + 50}/documentation`);
    assert.equal(res.status, 404);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
