// P2M7's exit, as a test: a player can read everything the contract lets them
// rely on and everything each operator documents — and the site cannot say
// anything the JSON does not.
//
// Specification: ROADMAP.md P2M7; CORECONCEPT.md §2.1 F.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld, generateDisruptions } from "@tns/core";
import { operatorDocs } from "@tns/projections";
import { MAX_REPLANS } from "@tns/router";
import { NON_ARRIVAL_PENALTY_S, WAIT_WEIGHT } from "@tns/scoring";
import { NOT_YET_HONOURED, controlApiDocument, playerApiDocument, type World } from "@tns/schema";
import {
  GUARD_WALL_S,
  MIN_TICK_INTERVAL_S,
  PLAN_DEADLINE_S,
  PLAN_LEAD_S,
  startOperatorApi,
} from "@tns/server";
import { OPERATOR_CHROME, buildSite, fieldRows, operatorPageBody, type JsonSchema } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const WORLDS = ["m1", "gen-t3", "gen-t5"].map((n) => join(repoRoot, "worlds", `${n}.world.db`));
const skip = (p: string) => (existsSync(p) ? false : `no world bundle at ${p}`);

const NUMBERS = {
  planLeadS: PLAN_LEAD_S,
  deadlineS: PLAN_DEADLINE_S,
  guardWallS: GUARD_WALL_S,
  maxReplans: MAX_REPLANS,
  minTickIntervalS: MIN_TICK_INTERVAL_S,
  nonArrivalS: NON_ARRIVAL_PENALTY_S,
  waitWeight: WAIT_WEIGHT,
};

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

/** The words a page says, without its markup. */
const wordsOf = (html: string): string[] =>
  decode(html.replace(/<[^>]+>/g, " "))
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((w) => w.length >= 3);

/** Words on an operator's page that neither its document nor the page frame supplies. */
function unsupportedWords(world: World, operatorId: string, body: string): string[] {
  const doc = JSON.stringify(operatorDocs(world, operatorId));
  const allowed = new Set([...OPERATOR_CHROME.flatMap((c) => wordsOf(c)), "array", "object", "shapes"]);
  return [...new Set(wordsOf(body))].filter((w) => !allowed.has(w) && !doc.includes(w));
}

for (const path of WORLDS) {
  const name = path.split(/[\\/]/).at(-1);

  test(`${name}: an operator's pages say nothing its OpenAPI document does not`, { skip: skip(path) }, () => {
    const world = loadWorld(path);
    for (const op of world.manifest.operators) {
      for (const sub of ["", "timetable", "realtime"]) {
        const { body } = operatorPageBody(world, op.id, sub, `/operators/${op.id}`);
        assert.deepEqual(unsupportedWords(world, op.id, body), [], `${op.id} /${sub} says words its document does not`);
        // And every field the document describes is on the page.
        if (sub) {
          const schema = (operatorDocs(world, op.id) as any).paths[`/${sub}`].get.responses["200"].content["application/json"]
            .schema as JsonSchema;
          for (const row of fieldRows(schema, {})) assert.ok(body.includes(row.path), `${op.id} /${sub} omits ${row.path}`);
        }
      }
    }
  });

  test(`${name}: every link in the portal leads somewhere`, { skip: skip(path) }, () => {
    const world = loadWorld(path);
    const site = buildSite(world, NUMBERS);
    for (const page of site.pages.values()) {
      for (const [, href] of page.html.matchAll(/href="(\/[^"#]*)"/g)) {
        const target = href!.replace(/\/$/, "") || "/";
        assert.ok(site.pages.has(target) || site.documents.has(target), `${page.path} links to ${href}, which is not a page`);
      }
    }
  });
}

test("the page check rejects a page that says more than its document", { skip: skip(WORLDS[0]!) }, () => {
  const world = loadWorld(WORLDS[0]!);
  const op = world.manifest.operators[0]!.id;
  const { body } = operatorPageBody(world, op, "realtime", `/operators/${op}`);
  assert.deepEqual(unsupportedWords(world, op, body), []);
  const found = unsupportedWords(world, op, body + "<p>Cancelled services may be silently dropped from this feed.</p>");
  assert.ok(found.includes("silently") && found.includes("dropped"), found.join());
});

test("the contract pages carry every endpoint and every field the documents publish", { skip: skip(WORLDS[0]!) }, () => {
  const site = buildSite(loadWorld(WORLDS[0]!), NUMBERS);
  for (const [slug, doc] of [
    ["player", playerApiDocument()],
    ["control", controlApiDocument()],
  ] as const) {
    const html = decode(site.pages.get(`/contract/${slug}`)!.html);
    const components = ((doc as any).components?.schemas ?? {}) as Record<string, JsonSchema>;
    for (const [path, ops] of Object.entries((doc as any).paths as Record<string, Record<string, any>>)) {
      assert.ok(html.includes(`/v1${path}`), `${slug} reference has no section for ${path}`);
      for (const op of Object.values(ops)) {
        const request = op.requestBody?.content?.["application/json"]?.schema as JsonSchema | undefined;
        for (const row of request ? fieldRows(request, components) : []) {
          assert.ok(html.includes(row.path), `${slug} ${path}: request field ${row.path} is not shown`);
        }
      }
    }
  }
  // The plan request's traveller fields, by name, so the check above is not vacuous.
  assert.ok(decode(site.pages.get("/contract/player")!.html).includes("requests[].origin.lat"));
});

test("the guide quotes the numbers the simulator enforces, and lists every gap", { skip: skip(WORLDS[0]!) }, () => {
  const site = buildSite(loadWorld(WORLDS[0]!), NUMBERS);
  const text = (p: string) => decode(site.pages.get(p)!.html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  assert.ok(text("/guide/run").includes(`${PLAN_LEAD_S / 60} minutes before each traveller departs`));
  assert.ok(text("/guide/run").includes(`You have ${PLAN_DEADLINE_S} simulated seconds`));
  assert.ok(text("/guide/run").includes(`you have ${GUARD_WALL_S} seconds`));
  assert.ok(text("/guide/answering").includes(`remade ${MAX_REPLANS} times`));
  assert.ok(text("/guide/scoring").includes(`${NON_ARRIVAL_PENALTY_S / 60} minutes`));
  const gaps = decode(site.pages.get("/guide/gaps")!.html);
  for (const g of NOT_YET_HONOURED) {
    assert.ok(gaps.includes(g.spec), `the gaps page omits ${g.spec}`);
  }
  assert.equal((gaps.match(/<li>/g) ?? []).length, NOT_YET_HONOURED.length);
});

test("an operator serves its pages to a browser at /docs during a run, and JSON to everyone else", { skip: skip(WORLDS[0]!) }, async () => {
  const world = loadWorld(WORLDS[0]!);
  const op = world.manifest.operators[0]!;
  const calls: { endpoint: string; status: number }[] = [];
  const server = await startOperatorApi(world, op.id, generateDisruptions(world.journeys, world.manifest.seed), () => 30000, (c) => calls.push(c), 8393);
  try {
    const base = "http://127.0.0.1:8393";
    const html = await fetch(`${base}/docs`, { headers: { accept: "text/html,application/xhtml+xml" } });
    assert.match(html.headers.get("content-type") ?? "", /text\/html/);
    const page = await html.text();
    assert.ok(page.includes(op.name), "the operator's pages do not name it");
    assert.ok(!page.includes("Player portal"), "an operator's own site mentions the simulator's portal");

    const json = await fetch(`${base}/docs`);
    assert.match(json.headers.get("content-type") ?? "", /application\/json/);
    assert.equal(((await json.json()) as { openapi: string }).openapi, "3.1.0");

    assert.equal((await fetch(`${base}/docs/timetable`)).status, 200);
    assert.equal((await fetch(`${base}/docs/nothing`)).status, 404);

    assert.deepEqual(
      calls.map((c) => `${c.endpoint} ${c.status}`),
      ["GET /docs (html) 200", "GET /docs 200", "GET /docs/timetable (html) 200", "GET /docs/nothing 404"],
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
