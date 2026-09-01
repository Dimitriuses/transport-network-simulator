// Generates the committed OpenAPI documents under contract/.
//
//   node src/schema/scripts/generate-openapi.ts           write
//   node src/schema/scripts/generate-openapi.ts --check   verify, exit 1 on drift
//
// ROADMAP.md M0 settles where generated API documents live:
//
//   contract/player-api.yaml, contract/control-api.yaml
//       Repository artefacts. One per contract version, identical for every
//       world. Committed so players and agents have a stable browsable URL;
//       CI asserts regeneration produces no diff, so they are always true.
//
//   operator API documents
//       NOT repository artefacts. They vary per world with the projection
//       manifest, and at higher tiers are deliberately imperfect — a property
//       of a world, not of the project. Emitted into the world bundle and
//       served at each operator's docs_url (PLAYER-CONTRACT.md §6.1).

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { stringify } from "yaml";

import {
  CONTRACT_VERSION,
  Identity,
  Health,
  Problem,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const outDir = join(repoRoot, "contract");

const GENERATED_HEADER =
  "# GENERATED FILE — DO NOT EDIT.\n" +
  "#\n" +
  "# Source: src/schema (Zod definitions).\n" +
  "# Regenerate: npm run contract:generate\n" +
  "# CI asserts this file matches its source; see ROADMAP.md M0.\n";

/** Zod schemas rendered into components/schemas, keyed by their `id`. */
const COMPONENTS = { Identity, Health, Problem };

function components(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(COMPONENTS)) {
    const json = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "output",
    }) as Record<string, unknown>;
    // OpenAPI supplies its own dialect; a per-schema $schema is noise.
    delete json["$schema"];
    out[name] = json;
  }
  return out;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const jsonBody = (name: string) => ({
  content: { "application/json": { schema: ref(name) } },
});

const problem = (status: string, description: string) => ({
  [status]: {
    description,
    content: { "application/problem+json": { schema: ref("Problem") } },
  },
});

function playerApi(): unknown {
  return {
    openapi: "3.1.0",
    info: {
      title: "Player API",
      version: CONTRACT_VERSION,
      summary: "Endpoints the simulator calls on the player's service.",
      description:
        "The player's surface is small, fixed, and — unlike the operator " +
        "APIs — documented exactly and honestly. That contrast is " +
        "pedagogical and should be preserved. See PLAYER-CONTRACT.md §5.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: "{player_base_url}/v1", variables: { player_base_url: { default: "http://localhost:8080" } } }],
    paths: {
      "/identity": {
        get: {
          operationId: "getIdentity",
          summary: "Who the player is and what it implements",
          description:
            "Read once before the run. Unclaimed capabilities are scored as " +
            "forgone rather than failed, so a partial solution is a valid " +
            "participant.",
          responses: {
            "200": { description: "Player identity", ...jsonBody("Identity") },
            ...problem("4XX", "Client error"),
          },
        },
      },
      "/health": {
        get: {
          operationId: "getHealth",
          summary: "Readiness",
          description:
            "Polled only before the run, with a bounded budget from the brief.",
          responses: {
            "200": { description: "Player readiness", ...jsonBody("Health") },
            ...problem("5XX", "Player not ready"),
          },
        },
      },
    },
    components: { schemas: components() },
  };
}

function controlApi(): unknown {
  return {
    openapi: "3.1.0",
    info: {
      title: "Control API",
      version: CONTRACT_VERSION,
      summary: "Endpoints the player calls on the simulator.",
      description:
        "Carries the brief, the simulated clock, and the scored " +
        "dissemination channel. See PLAYER-CONTRACT.md §6.",
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: "{control_url}/v1", variables: { control_url: { default: "http://localhost:9000" } } }],
    paths: {},
    components: { schemas: { Problem: components()["Problem"] } },
  };
}

const DOCUMENTS: ReadonlyArray<readonly [string, unknown]> = [
  ["player-api.yaml", playerApi()],
  ["control-api.yaml", controlApi()],
];

function render(doc: unknown): string {
  return GENERATED_HEADER + "\n" + stringify(doc, { lineWidth: 0 });
}

const check = process.argv.includes("--check");
let drift = 0;

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

for (const [name, doc] of DOCUMENTS) {
  const path = join(outDir, name);
  const next = render(doc);

  if (check) {
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (current !== next) {
      drift++;
      console.error(
        `drift: contract/${name} does not match src/schema.\n` +
          `  Run: npm run contract:generate`,
      );
    } else {
      console.log(`ok: contract/${name}`);
    }
  } else {
    writeFileSync(path, next, "utf8");
    console.log(`wrote: contract/${name}`);
  }
}

if (check && drift > 0) process.exit(1);
