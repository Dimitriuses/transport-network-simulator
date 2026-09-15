// An OpenAPI schema as a table a person can read.
//
// One row per field, nested objects flattened to dotted paths (`requests[].origin.lat`),
// `$ref`s resolved against the document's own components, unions spelled out.
// **Every word in a row comes from the schema** — its type, its enum, its
// description — which is what lets the portal's test hold an operator's pages to
// its OpenAPI document.

import { esc, inline } from "./html.ts";

export type JsonSchema = {
  readonly $ref?: string;
  readonly type?: string | readonly string[];
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly enum?: readonly unknown[];
  readonly const?: unknown;
  readonly anyOf?: readonly JsonSchema[];
  readonly oneOf?: readonly JsonSchema[];
  readonly description?: string;
  readonly default?: unknown;
  readonly format?: string;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minItems?: number;
};

export interface FieldRow {
  readonly path: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

type Components = Record<string, JsonSchema>;

function resolve(schema: JsonSchema, components: Components, seen = new Set<string>()): JsonSchema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.split("/").at(-1)!;
  if (seen.has(name)) return {};
  seen.add(name);
  const target = components[name];
  return target ? resolve(target, components, seen) : {};
}

/** A short type label: `string`, `integer`, `array of object`, `"ok" | "no_route"`. */
function typeLabel(schema: JsonSchema, components: Components): string {
  const s = resolve(schema, components);
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(" | ");
  const variants = s.anyOf ?? s.oneOf;
  if (variants) {
    const labels = variants.map((v) => typeLabel(v, components));
    return [...new Set(labels)].join(" | ");
  }
  if (s.type === "array") return `array of ${s.items ? typeLabel(s.items, components) : "anything"}`;
  const t = typeof s.type === "string" ? s.type : s.type ? s.type.join(" | ") : s.properties ? "object" : "any";
  return s.format ? `${t} (${s.format})` : t;
}

function constraints(s: JsonSchema): string[] {
  const out: string[] = [];
  if (s.pattern) out.push(`pattern ${s.pattern}`);
  // Zod bounds every integer by JavaScript's safe range, which tells a reader nothing.
  if (s.minimum !== undefined && s.minimum > Number.MIN_SAFE_INTEGER) out.push(`≥ ${s.minimum}`);
  if (s.maximum !== undefined && s.maximum < Number.MAX_SAFE_INTEGER) out.push(`≤ ${s.maximum}`);
  if (s.minItems !== undefined && s.minItems > 0) out.push(`at least ${s.minItems}`);
  if (s.default !== undefined) out.push(`default ${JSON.stringify(s.default)}`);
  return out;
}

/** Flatten a schema to rows. A union of objects is listed variant by variant. */
export function fieldRows(schema: JsonSchema, components: Components, prefix = "", required = true): FieldRow[] {
  const s = resolve(schema, components);
  const rows: FieldRow[] = [];

  const variants = s.anyOf ?? s.oneOf;
  const objectVariants = variants?.map((v) => resolve(v, components)).filter((v) => v.properties);
  if (variants && objectVariants && objectVariants.length > 0) {
    if (prefix) {
      rows.push({
        path: prefix,
        type: `one of ${objectVariants.length} shapes`,
        required,
        description: s.description ?? "",
      });
    }
    objectVariants.forEach((v, i) => {
      const tag = Object.entries(v.properties ?? {}).find(([, p]) => resolve(p, components).const !== undefined);
      const label = tag ? `${tag[0]} = ${JSON.stringify(resolve(tag[1], components).const)}` : `shape ${i + 1}`;
      for (const r of fieldRows(v, components, prefix, required)) {
        rows.push({ ...r, path: r.path === prefix ? r.path : `${r.path}  (${label})` });
      }
    });
    return rows;
  }

  if (s.type === "array" && s.items) {
    const item = resolve(s.items, components);
    if (prefix) {
      rows.push({
        path: prefix,
        type: typeLabel(s, components),
        required,
        description: [s.description ?? "", ...constraints(s)].filter(Boolean).join(" · "),
      });
    }
    if (item.properties || item.anyOf || item.oneOf) rows.push(...fieldRows(item, components, `${prefix}[]`, true));
    return rows;
  }

  if (s.properties) {
    if (prefix && s.description) rows.push({ path: prefix, type: "object", required, description: s.description });
    for (const [key, child] of Object.entries(s.properties)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const c = resolve(child, components);
      const isRequired = (s.required ?? []).includes(key);
      const nested = c.properties || (c.type === "array" && c.items) || ((c.anyOf ?? c.oneOf)?.some((v) => resolve(v, components).properties));
      if (nested) {
        rows.push(...fieldRows(c, components, path, isRequired));
      } else {
        rows.push({
          path,
          type: typeLabel(c, components),
          required: isRequired,
          description: [c.description ?? "", ...constraints(c)].filter(Boolean).join(" · "),
        });
      }
    }
    return rows;
  }

  if (prefix) {
    rows.push({ path: prefix, type: typeLabel(s, components), required, description: [s.description ?? "", ...constraints(s)].filter(Boolean).join(" · ") });
  }
  return rows;
}

export function fieldTable(schema: JsonSchema, components: Components): string {
  const rows = fieldRows(schema, components);
  if (rows.length === 0) return `<p><code>${esc(typeLabel(schema, components))}</code></p>`;
  return (
    `<div class="scroll"><table><thead><tr><th>Field</th><th>Type</th><th>Description</th></tr></thead><tbody>` +
    rows
      .map(
        (r) =>
          `<tr><td class="field"><code>${esc(r.path)}</code>${r.required ? "" : ' <span class="req">optional</span>'}</td>` +
          `<td><code>${esc(r.type)}</code></td><td>${inline(r.description)}</td></tr>`,
      )
      .join("") +
    `</tbody></table></div>`
  );
}
