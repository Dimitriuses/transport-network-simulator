// A player started before the simulator must still become ready.
//
// Specification: KNOWN-ISSUES.md #46, PLAYER-CONTRACT.md §3.
//
// The harness spawns the player, *then* brings up the control and operator
// APIs, so the first ingestion attempt failing is the normal case rather than
// an error. Nothing tested that, and the recovery path was broken: the failed
// attempt left its listener bound, every retry died on EADDRINUSE, and
// `/v1/health` answered `starting` from the orphaned socket until the
// simulator gave up. It reproduced only when the player won the race, which on
// a warm machine it never does and on a cold CI runner it eventually must.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";

import { startPlayer } from "../src/player.ts";

const PORTS = { player: 8391, control: 9391, operator: 9392 };

const json = (body: unknown) => JSON.stringify(body);

/** The smallest control and operator pair `ingest()` will accept. */
function fakeSimulator(): Promise<[Server, Server]> {
  const operator = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(json({ operator: "op", stops: [], routes: [], trips: [] }));
  });
  const control = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      json({
        world: { utc_offset: "+03:00" },
        operators: [{ id: "op", base_url: `http://127.0.0.1:${PORTS.operator}` }],
      }),
    );
  });
  return Promise.all([
    new Promise<Server>((r) => operator.listen(PORTS.operator, "127.0.0.1", () => r(operator))),
    new Promise<Server>((r) => control.listen(PORTS.control, "127.0.0.1", () => r(control))),
  ]);
}

const health = async (): Promise<string | null> => {
  try {
    const res = await fetch(`http://127.0.0.1:${PORTS.player}/v1/health`);
    return ((await res.json()) as { status?: string }).status ?? null;
  } catch {
    return null;
  }
};

test("a player started before the control API waits, then becomes ready", async () => {
  const booting = startPlayer({
    port: PORTS.player,
    controlUrl: `http://127.0.0.1:${PORTS.control}`,
    mode: "naive",
    ingestBudgetMs: 30_000,
  });

  // It is listening and honest about not being ready. This is what the
  // simulator's own poll sees, and what it saw for sixty seconds before.
  let status: string | null = null;
  for (let i = 0; i < 200 && status === null; i++) {
    status = await health();
    if (status === null) await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(status, "starting", "the player should answer /v1/health while it waits");

  const [operator, control] = await fakeSimulator();
  try {
    const server = await booting;
    assert.equal(await health(), "ready", "the player never noticed the control API appear");
    server.close();
  } finally {
    operator.close();
    control.close();
  }
});

test("a control API that never appears is an error, and the port goes back", async () => {
  // The budget is the whole point: a player that waits for ever is a CI job
  // that hangs instead of failing.
  await assert.rejects(
    startPlayer({
      port: PORTS.player,
      controlUrl: "http://127.0.0.1:9",
      mode: "naive",
      ingestBudgetMs: 300,
    }),
    /could not read the brief/,
  );
  assert.equal(await health(), null, "the listener outlived the attempt that opened it");
});
