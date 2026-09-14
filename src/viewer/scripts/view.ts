// npm run view -- <run.ndjson> <world.db> [--port 8765] [--attribution <file.json>] [--disclosure <level>]
//
// A local page that explains one run (OBSERVABILITY.md §9): the scorecard, every
// traveller's timeline with the player's knowledge band beneath it, the API
// requests each obligation caused with the bodies regenerated on demand, and —
// at `full` disclosure — map replay.
//
// Disclosure comes from the run's own header, and `--disclosure` can only
// narrow it: a viewer that could widen it would make §8 a suggestion.

import { createServer, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { generateDisruptions, loadWorld } from "@tns/core";
import { scoreRun } from "@tns/scoring";
import type { IngestionRecord, RunHeader } from "@tns/schema";
import { readRunLog } from "@tns/server";
import {
  bodyOf,
  buildMap,
  buildTimelines,
  discloseAttribution,
  regenerate,
  type Disclosure,
  type PlayerAttribution,
} from "../src/index.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    port: { type: "string", default: "8765" },
    attribution: { type: "string" },
    disclosure: { type: "string" },
  },
});
const [runPath, worldPath] = positionals;
if (!runPath || !worldPath) {
  console.error("usage: npm run view -- <run.ndjson> <world.db> [--port N] [--attribution file] [--disclosure level]");
  process.exit(2);
}

const log = readRunLog(resolve(runPath));
const world = loadWorld(resolve(worldPath));
const header = log.find((r): r is RunHeader => r.kind === "run_header");
if (!header) throw new Error(`${runPath} has no run header`);

const ORDER: Disclosure[] = ["outcome", "attributed", "full"];
const recorded: Disclosure = header.disclosure ?? "attributed";
const asked = (values.disclosure ?? recorded) as Disclosure;
if (!ORDER.includes(asked)) throw new Error(`--disclosure must be one of ${ORDER.join(", ")}`);
if (ORDER.indexOf(asked) > ORDER.indexOf(recorded)) {
  throw new Error(`this run was recorded at \`${recorded}\` disclosure, and a viewer may narrow that but not widen it`);
}
const disclosure = asked;

process.stderr.write(`replaying ${runPath} to regenerate movements… `);
const started = Date.now();
const regenerated = await regenerate(world, log);
const timelines = buildTimelines(world, log, regenerated, disclosure);
process.stderr.write(`${((Date.now() - started) / 1000).toFixed(1)} s\n`);

const card = scoreRun(log, { tier: world.manifest.tier });
const ingestion = log.filter((r): r is IngestionRecord => r.kind === "ingestion");
const day = generateDisruptions(world.journeys, world.manifest.seed);

let attribution: PlayerAttribution | null = null;
if (values.attribution) {
  attribution = JSON.parse(readFileSync(resolve(values.attribution), "utf8")) as PlayerAttribution;
  if (attribution.worldContentHash !== world.manifest.contentHash) {
    throw new Error(`${values.attribution} attributes a different world`);
  }
}

function mergeBuckets<T extends { cause: string; travellers: number; captureLost: number }>(rows: T[]): T[] {
  const merged = new Map<string, T>();
  for (const r of rows) {
    const seen = merged.get(r.cause);
    merged.set(r.cause, seen ? { ...seen, travellers: seen.travellers + r.travellers, captureLost: seen.captureLost + r.captureLost } : r);
  }
  return [...merged.values()].sort((a, b) => b.captureLost - a.captureLost);
}

const byRef = new Map(timelines.map((t) => [t.travellerRef, t]));
const runSummary = {
  header,
  disclosure,
  recordedDisclosure: recorded,
  world: {
    seed: world.manifest.seed,
    tier: world.manifest.tier,
    sites: world.sites.length,
    quays: world.quays.length,
    operators: world.manifest.operators.map((o) => ({ id: o.id, name: o.name })),
  },
  card: {
    verdict: card.verdict,
    verdictReason: card.verdictReason,
    comparable: card.comparable,
    notComparableBecause: card.notComparableBecause,
    headline: card.headline,
    profile: card.profile,
    service: card.service,
    information: card.information,
    cost: card.cost,
    obligations: card.obligations,
    // Stage one's buckets name failure reasons, and some of those name a canonical
    // quay; redacted, buckets that differed only by the quay become one.
    attribution: mergeBuckets(
      card.attribution.map((a) => ({
        ...a,
        cause: disclosure === "full" ? a.cause : a.cause.replace(/(destination_unreachable|unknown_pattern):\S+/, "$1"),
      })),
    ),
  },
  attribution: attribution ? discloseAttribution(attribution, disclosure) : null,
  travellers: timelines.map((t) => ({
    travellerRef: t.travellerRef,
    departAfterS: t.departAfterS,
    arrived: t.outcome.arrived,
    journeyS: t.outcome.journeyS,
    forgone: t.outcome.forgone,
    appUser: t.outcome.appUser !== false,
    scored: t.scored,
    lossS: t.lossS,
    replans: t.obligations.filter((o) => o.obligation === "replan").length,
    bands: t.knowledge.map((b) => b.verdict),
    failureReason: t.outcome.failureReason,
  })),
};

// Built once: map replay is `full` only, and on a 200-journey world it is a few hundred kilobytes.
const mapPayload =
  disclosure === "full"
    ? JSON.stringify({
        ...buildMap(world),
        travellers: Object.fromEntries(timelines.map((t) => [t.travellerRef, t.steps])),
      })
    : null;

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;

  if (path === "/api/run") return json(res, 200, runSummary);

  if (path.startsWith("/api/traveller/")) {
    const t = byRef.get(decodeURIComponent(path.slice("/api/traveller/".length)));
    return t ? json(res, 200, t) : json(res, 404, { error: "no such traveller" });
  }

  if (path === "/api/calls") {
    return json(
      res,
      200,
      ingestion.map((c, i) => ({
        i,
        tau: c.tau,
        operator: c.operator,
        endpoint: c.endpoint,
        status: c.status,
        bytes: c.bytes,
        cause: c.cause,
      })),
    );
  }

  if (path.startsWith("/api/body/")) {
    const call = ingestion[Number(path.slice("/api/body/".length))];
    if (!call) return json(res, 404, { error: "no such call" });
    return json(res, 200, bodyOf(world, day, call));
  }

  if (path === "/api/map") {
    return mapPayload
      ? json(res, 200, mapPayload)
      : json(res, 403, {
          error:
            `map replay is shown at \`full\` disclosure and this run is viewed at \`${disclosure}\`: ` +
            "true positions and the day's disruptions are what the conflicts disagree about (OBSERVABILITY.md §8)",
        });
  }

  const file = path === "/" ? "index.html" : path.slice(1);
  if (!/^[\w.-]+$/.test(file) || !TYPES[extname(file)]) return json(res, 404, { error: "not found" });
  try {
    const body = readFileSync(join(publicDir, file));
    res.writeHead(200, { "content-type": TYPES[extname(file)]! });
    res.end(body);
  } catch {
    json(res, 404, { error: "not found" });
  }
});

const port = Number(values.port);
server.listen(port, "127.0.0.1", () => {
  console.log(`${runPath} · ${timelines.length} travellers · disclosure ${disclosure}`);
  console.log(`http://127.0.0.1:${port}/`);
});
