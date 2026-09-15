// npm run portal -- [world.db] [--port 8700]
//
// The site to read before writing a solution, for one world, with no run needed
// (ROADMAP.md P2M7). Defaults to the committed world.

import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { loadWorld } from "@tns/core";
import { MAX_REPLANS } from "@tns/router";
import { NON_ARRIVAL_PENALTY_S, WAIT_WEIGHT } from "@tns/scoring";
import {
  ABORT_AFTER_CONSECUTIVE_FAILURES,
  GUARD_WALL_S,
  MIN_TICK_INTERVAL_S,
  PLAN_DEADLINE_S,
  PLAN_LEAD_S,
  PREPARATION_WALL_BUDGET_S,
} from "@tns/server";
import { buildSite } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { port: { type: "string", default: "8700" } },
});
const worldPath = resolve(positionals[0] ?? join(here, "..", "..", "..", "worlds", "m1.world.db"));
const world = loadWorld(worldPath);

const site = buildSite(world, {
  planLeadS: PLAN_LEAD_S,
  deadlineS: PLAN_DEADLINE_S,
  guardWallS: GUARD_WALL_S,
  maxReplans: MAX_REPLANS,
  minTickIntervalS: MIN_TICK_INTERVAL_S,
  nonArrivalS: NON_ARRIVAL_PENALTY_S,
  waitWeight: WAIT_WEIGHT,
  preparationS: PREPARATION_WALL_BUDGET_S,
  abortAfterFailures: ABORT_AFTER_CONSECUTIVE_FAILURES,
});

const server = createServer((req, res) => {
  const path = new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/$/, "") || "/";
  const doc = site.documents.get(path);
  if (doc) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return void res.end(JSON.stringify(doc, null, 2));
  }
  const page = site.pages.get(path);
  if (page) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    return void res.end(page.html);
  }
  res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
  res.end(site.pages.get("/")!.html.replace(/<main>[\s\S]*<\/main>/, `<main><h1>Not found</h1><p><a href="/">Start here</a></p></main>`));
});

const port = Number(values.port);
server.listen(port, "127.0.0.1", () => {
  console.log(`${worldPath} · ${site.pages.size} pages · ${world.manifest.operators.length} operators`);
  console.log(`http://127.0.0.1:${port}/`);
});
