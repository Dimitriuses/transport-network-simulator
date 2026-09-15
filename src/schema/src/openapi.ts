// The two OpenAPI documents stable across every world: what the simulator calls
// on a player, and what a player calls on the simulator.
//
// Specification: PLAYER-CONTRACT.md §5, §6.
//
// **Built here rather than in the generator** (P2M7) so that `contract/`, which
// is committed and drift-checked, and the portal, which renders these for a
// person to read, are two views of one object rather than two copies of it.

import { z } from "zod";

import { CONTRACT_VERSION } from "./index.ts";
import { Health, Identity, Problem } from "./contract/identity.ts";
import { PlanRequest, PlanResponse } from "./contract/plan.ts";
import { ReplanRequest, ReplanResponse } from "./contract/replan.ts";
import {
  Brief,
  Clock,
  NOT_YET_HONOURED,
  NotifyAccepted,
  NotifyRequest,
  RunEndNotice,
  RunStartNotice,
  TickRequest,
  TickResponse,
} from "./contract/session.ts";

/** Zod schemas rendered into components/schemas, keyed by their `id`. */
const COMPONENTS = {
  Identity,
  Health,
  Problem,
  PlanRequest,
  PlanResponse,
  ReplanRequest,
  ReplanResponse,
  TickRequest,
  TickResponse,
  RunStartNotice,
  RunEndNotice,
  Brief,
  Clock,
  NotifyRequest,
  NotifyAccepted,
};

function components(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(COMPONENTS)) {
    const json = z.toJSONSchema(schema, {
      target: "draft-2020-12",
      io: "output",
    }) as Record<string, unknown>;
    // OpenAPI supplies its own dialect; a per-schema $schema is noise.
    delete json["$schema"];
    // Zod lifts every schema with an id into `$defs` — **the one being rendered
    // included**, leaving the top level a bare `$ref` to itself. OpenAPI keeps
    // named schemas in components, so each def becomes a component, and the
    // schema being rendered is its own def's body rather than a pointer to it.
    // Until this was noticed every component was a self-reference, which a check
    // for dangling references passes, because a self-reference resolves.
    const defs = (json["$defs"] ?? {}) as Record<string, Record<string, unknown>>;
    delete json["$defs"];
    const toComponents = (v: unknown): Record<string, unknown> =>
      JSON.parse(JSON.stringify(v).replaceAll('"#/$defs/', '"#/components/schemas/')) as Record<string, unknown>;
    for (const [defName, def] of Object.entries(defs)) {
      if (defName !== name && !(defName in out)) out[defName] = toComponents(def);
    }
    out[name] = toComponents(json["$ref"] === `#/$defs/${name}` && defs[name] ? defs[name] : json);
  }
  return out;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const jsonBody = (name: string) => ({
  content: { "application/json": { schema: ref(name) } },
});

const requestBody = (name: string) => ({ required: true, ...jsonBody(name) });

/** Rendered into both documents, so nobody reads the schema and misses the gap. */
const GAP =
  "\n\n**Specified and not yet honoured** (KNOWN-ISSUES.md #72):\n\n" +
  NOT_YET_HONOURED.map((g) => `* ${g.what} (${g.spec})`).join("\n");

const problem = (status: string, description: string) => ({
  [status]: {
    description,
    content: { "application/problem+json": { schema: ref("Problem") } },
  },
});

export function playerApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Player API",
      version: CONTRACT_VERSION,
      summary: "Endpoints the simulator calls on the player's service.",
      description:
        "The player's surface is small, fixed, and — unlike the operator " +
        "APIs — documented exactly and honestly. That contrast is " +
        "pedagogical and should be preserved. See PLAYER-CONTRACT.md §5." +
        GAP,
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
      "/plan": {
        post: {
          operationId: "plan",
          summary: "Plan journeys for travellers about to set out",
          description:
            "Issued half an hour before a traveller departs. An answer takes effect at `deadline`, " +
            "in simulated time, however fast it arrived. A response that does not match this " +
            "schema is recorded as `player_error`, and the traveller falls back to the reference policy.",
          requestBody: requestBody("PlanRequest"),
          responses: { "200": { description: "One result per request", ...jsonBody("PlanResponse") } },
        },
      },
      "/replan": {
        post: {
          operationId: "replan",
          summary: "A plan broke in front of a traveller",
          description:
            "Carries what the traveller perceived and where they stand, in the operator's own " +
            "identifiers, and the part of the plan not yet travelled. Not the destination: you " +
            "were told it when you planned.",
          requestBody: requestBody("ReplanRequest"),
          responses: { "200": { description: "One result per request", ...jsonBody("ReplanResponse") } },
        },
      },
      "/tick": {
        post: {
          operationId: "tick",
          summary: "Fetch from the operators now",
          description:
            "Sent at the cadence you declare in `/v1/identity`, and only if you claim `tick`. " +
            "At an instant holding both a tick and an obligation, the tick comes first.",
          requestBody: requestBody("TickRequest"),
          responses: { "200": { description: "Acknowledged", ...jsonBody("TickResponse") } },
        },
      },
      "/run-start": {
        post: {
          operationId: "runStart",
          summary: "The run has started",
          requestBody: requestBody("RunStartNotice"),
          responses: { "2XX": { description: "Ignored" } },
        },
      },
      "/run-end": {
        post: {
          operationId: "runEnd",
          summary: "The run has ended",
          requestBody: requestBody("RunEndNotice"),
          responses: { "2XX": { description: "Ignored" } },
        },
      },
    },
    components: { schemas: components() },
  };
}

export function controlApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Control API",
      version: CONTRACT_VERSION,
      summary: "Endpoints the player calls on the simulator.",
      description:
        "Carries the brief, the simulated clock, and the scored " +
        "dissemination channel. See PLAYER-CONTRACT.md §6." +
        GAP,
      license: { name: "MIT", identifier: "MIT" },
    },
    servers: [{ url: "{control_url}/v1", variables: { control_url: { default: "http://localhost:9000" } } }],
    paths: {
      "/brief": {
        get: {
          operationId: "getBrief",
          summary: "Where the operators are, and the rules of the world",
          responses: { "200": { description: "The brief", ...jsonBody("Brief") } },
        },
      },
      "/clock": {
        get: {
          operationId: "getClock",
          summary: "Simulated time and run state",
          description: "Unmetered, excluded from API cost, and never queued.",
          responses: { "200": { description: "The clock", ...jsonBody("Clock") } },
        },
      },
      "/notify": {
        post: {
          operationId: "notify",
          summary: "Warn a traveller",
          requestBody: requestBody("NotifyRequest"),
          responses: {
            "202": { description: "Recorded", ...jsonBody("NotifyAccepted") },
            ...problem("400", "No `traveller_ref`, or not JSON"),
          },
        },
      },
    },
    components: { schemas: components() },
  };
}
