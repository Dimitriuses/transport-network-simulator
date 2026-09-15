// The portal: every page a player may read before writing a solution.
//
// Specification: ROADMAP.md P2M7; PLAYER-CONTRACT.md §5, §6; CORECONCEPT.md §2.1 F.
//
// **Rendered from the objects that are true, never written beside them.** The
// contract pages render `playerApiDocument()` and `controlApiDocument()` — the
// objects `contract/` is generated from — and an operator's pages render the
// OpenAPI document its API serves at `/docs`. Nothing on an operator's pages
// comes from anywhere else, which `portal.test.ts` checks word by word: *the
// site cannot say anything the JSON does not*.
//
// An operator's pages exist twice with different chrome: inside the portal,
// beside the guide and the other operators, and at the operator's own `/docs`
// during a run, where the operator knows nothing of the simulator or of anyone
// else — as a real agency's developer site would not.

import type { World } from "@tns/schema";
import { CONTRACT_VERSION, controlApiDocument, playerApiDocument } from "@tns/schema";
import { operatorDocs } from "@tns/projections";

import { esc, inline, layout, markdown, type NavGroup } from "./html.ts";
import { fieldTable, type JsonSchema } from "./schema.ts";
import { guidePages, type GuideNumbers } from "./guide.ts";

type OpenApi = {
  info: { title: string; description?: string; summary?: string; version: string };
  servers?: { url: string }[];
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, JsonSchema> };
};
type Operation = {
  operationId?: string;
  summary?: string;
  description?: string;
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: JsonSchema }> }>;
};

export interface Page {
  readonly path: string;
  readonly title: string;
  readonly html: string;
}

/** The fixed words an operator's pages add around its document. Everything else must come from the document. */
export const OPERATOR_CHROME = [
  "Endpoints",
  "Response",
  "Field",
  "Type",
  "Description",
  "optional",
  "OpenAPI document",
  "GET",
] as const;

const operatorSubpages = (doc: OpenApi): string[] =>
  Object.keys(doc.paths)
    .filter((p) => p !== "/docs")
    .map((p) => p.slice(1));

/** One operation's section: method and path, what it is, request and responses. */
function operationHtml(method: string, path: string, op: Operation, components: Record<string, JsonSchema>, base: string): string {
  const parts = [
    `<h2 id="${esc(op.operationId ?? path)}"><span class="endpoint"><span class="method">${esc(method.toUpperCase())}</span>${esc(base + path)}</span></h2>`,
  ];
  if (op.summary) parts.push(`<p class="lede">${inline(op.summary)}</p>`);
  if (op.description) parts.push(markdown(op.description));
  const request = op.requestBody?.content?.["application/json"]?.schema;
  if (request) parts.push(`<h3>Request body</h3>`, fieldTable(request, components));
  for (const [status, response] of Object.entries(op.responses ?? {})) {
    const schema = Object.values(response.content ?? {})[0]?.schema;
    parts.push(`<h3>Response <code>${esc(status)}</code></h3>`);
    if (response.description) parts.push(`<p>${inline(response.description)}</p>`);
    if (schema) parts.push(fieldTable(schema, components));
  }
  return parts.join("\n");
}

/** The body of an operator's pages: its overview, or one endpoint. Document words only. */
export function operatorPageBody(world: World, operatorId: string, subpage: string, hrefBase: string): { title: string; body: string } {
  const doc = operatorDocs(world, operatorId) as OpenApi;
  const components = doc.components?.schemas ?? {};
  if (subpage === "") {
    const endpoints = operatorSubpages(doc)
      .map((p) => `<li><a href="${esc(`${hrefBase}/${p}`)}"><code>GET /${esc(p)}</code></a> — ${inline(doc.paths[`/${p}`]!["get"]?.summary ?? "")}</li>`)
      .join("");
    return {
      title: doc.info.title,
      body:
        `<h1>${esc(doc.info.title)}</h1>` +
        markdown(doc.info.description ?? "") +
        `<h2>Endpoints</h2><ul>${endpoints}</ul>` +
        `<p><a href="${esc(`${hrefBase}/openapi.json`)}">OpenAPI document</a></p>`,
    };
  }
  const op = doc.paths[`/${subpage}`]?.["get"];
  if (!op) throw new Error(`${operatorId} has no /${subpage}`);
  return {
    title: `GET /${subpage} · ${doc.info.title}`,
    body: `<h1>${esc(doc.info.title)}</h1>` + operationHtml("get", `/${subpage}`, op, components, ""),
  };
}

/** An operator's own site, as served at its `/docs` during a run. It knows nothing of the portal. */
export function operatorSite(world: World, operatorId: string, subpage: string): string {
  const doc = operatorDocs(world, operatorId) as OpenApi;
  const nav: NavGroup[] = [
    {
      title: doc.info.title,
      links: [{ href: "/docs", label: "Overview" }, ...operatorSubpages(doc).map((p) => ({ href: `/docs/${p}`, label: `GET /${p}` }))],
    },
  ];
  const { title, body } = operatorPageBody(world, operatorId, subpage, "/docs");
  return layout({ title, siteTitle: doc.info.title, nav, current: subpage ? `/docs/${subpage}` : "/docs", body });
}

/** The world's rules as a player may know them: what the brief says, nothing it does not. */
function worldBody(world: World): string {
  const m = world.manifest;
  const offset = `${m.utcOffsetS < 0 ? "-" : "+"}${String(Math.floor(Math.abs(m.utcOffsetS) / 3600)).padStart(2, "0")}:${String(Math.floor((Math.abs(m.utcOffsetS) % 3600) / 60)).padStart(2, "0")}`;
  const rows: [string, string][] = [
    ["Tier", `${m.tier}${m.rungId ? ` (\`${m.rungId}\`)` : ""}`],
    ...(m.shape ? ([["Shape", `\`${m.shape}\``]] as [string, string][]) : []),
    ["Time zone", `\`${m.timezone}\`, UTC${offset}`],
    ["Farthest a traveller will walk to or from a stop", `${m.maxWalkM} m`],
    ["Walking speed", `${m.walkSpeedMps} m/s`],
    ["Operators", m.operators.map((o) => `[${o.name}](/operators/${o.id})`).join(", ")],
    ["Seed", String(m.seed)],
  ];
  return (
    `<h1>This world</h1>` +
    `<p class="lede">What the brief tells every player. Nothing here says how the operators' data relates, or how good it is.</p>` +
    `<div class="scroll"><table><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${inline(v)}</td></tr>`).join("")}</tbody></table></div>` +
    `<p>An operator's address changes with every run, and is in the brief: <code>GET /v1/brief</code> on the control API.</p>`
  );
}

export interface Site {
  readonly title: string;
  readonly pages: ReadonlyMap<string, Page>;
  /** Machine-readable documents, by path. */
  readonly documents: ReadonlyMap<string, unknown>;
}

export function buildSite(world: World, numbers: GuideNumbers): Site {
  const title = "Player portal";
  const player = playerApiDocument() as OpenApi;
  const control = controlApiDocument() as OpenApi;
  const guide = guidePages(numbers);

  const nav: NavGroup[] = [
    { title: "Guide", links: guide.map((g) => ({ href: g.slug ? `/guide/${g.slug}` : "/", label: g.title })) },
    {
      title: "Reference",
      links: [
        { href: "/world", label: "This world" },
        { href: "/contract/player", label: "Player API" },
        { href: "/contract/control", label: "Control API" },
      ],
    },
    {
      title: "Operators",
      links: world.manifest.operators.map((o) => ({ href: `/operators/${o.id}`, label: o.name })),
    },
  ];

  const pages = new Map<string, Page>();
  const add = (path: string, pageTitle: string, body: string) =>
    pages.set(path, { path, title: pageTitle, html: layout({ title: pageTitle, siteTitle: title, nav, current: path, body }) });

  for (const g of guide) {
    add(g.slug ? `/guide/${g.slug}` : "/", g.title, `<h1>${esc(g.title)}</h1>` + markdown(g.markdown));
  }
  add("/world", "This world", worldBody(world));

  for (const [slug, doc, base, label] of [
    ["player", player, "/v1", "Player API"],
    ["control", control, "/v1", "Control API"],
  ] as const) {
    const components = doc.components?.schemas ?? {};
    const sections = Object.entries(doc.paths).flatMap(([path, ops]) =>
      Object.entries(ops).map(([method, op]) => operationHtml(method, path, op, components, base)),
    );
    add(
      `/contract/${slug}`,
      label,
      `<h1>${esc(doc.info.title)} <small class="req">contract ${esc(CONTRACT_VERSION)}</small></h1>` +
        `<p class="lede">${inline(doc.info.summary ?? "")}</p>` +
        markdown(doc.info.description ?? "") +
        sections.join("\n") +
        `<p><a href="/contract/${slug}.json">OpenAPI document</a></p>`,
    );
  }

  add(
    "/operators",
    "Operators",
    `<h1>Operators</h1><p class="lede">Each documents its own API, and only its own.</p><ul>` +
      world.manifest.operators
        .map((o) => `<li><a href="/operators/${esc(o.id)}">${esc((operatorDocs(world, o.id) as OpenApi).info.title)}</a></li>`)
        .join("") +
      `</ul>`,
  );
  const documents = new Map<string, unknown>([
    ["/contract/player.json", player],
    ["/contract/control.json", control],
  ]);
  for (const o of world.manifest.operators) {
    const doc = operatorDocs(world, o.id) as OpenApi;
    const base = `/operators/${o.id}`;
    for (const sub of ["", ...operatorSubpages(doc)]) {
      const { title: t, body } = operatorPageBody(world, o.id, sub, base);
      add(sub ? `${base}/${sub}` : base, t, body);
    }
    documents.set(`${base}/openapi.json`, doc);
  }

  return { title, pages, documents };
}
