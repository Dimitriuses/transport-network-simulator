// Generates the committed OpenAPI documents under contract/.
//
//   node src/schema/scripts/generate-openapi.ts           write
//   node src/schema/scripts/generate-openapi.ts --check   verify, exit 1 on drift
//
// ROADMAP.md P0M0 settles where generated API documents live:
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
import { stringify } from "yaml";

import {
  CATALOGUE,
  CONTRACT_VERSION,
  DEFAULT_DISRUPTION_POLICY,
  LADDER,
  LADDER_VERSION,
  SHAPES,
  controlApiDocument,
  playerApiDocument,
} from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const outDir = join(repoRoot, "contract");

const GENERATED_HEADER =
  "# GENERATED FILE — DO NOT EDIT.\n" +
  "#\n" +
  "# Source: src/schema (Zod definitions).\n" +
  "# Regenerate: npm run contract:generate\n" +
  "# CI asserts this file matches its source; see ROADMAP.md P0M0.\n";

const DOCUMENTS: ReadonlyArray<readonly [string, unknown]> = [
  ["player-api.yaml", playerApiDocument()],
  ["control-api.yaml", controlApiDocument()],
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

// ---- the conflict catalogue ------------------------------------------------
//
// Python consumes this: `tools/worldbuild` needs the conflict-free defaults,
// the catalogue names, the plausibility ceilings and the cosmetic/structural
// labels, and holding a second copy of them in Python is how the two drift.
// JSON rather than YAML because nothing reads it by hand.
{
  const path = join(outDir, "catalogue.json");
  const next =
    JSON.stringify(
      {
        $comment:
          "GENERATED FILE — DO NOT EDIT. Source: src/schema/src/catalogue.ts. " +
          "Regenerate: npm run contract:generate",
        contract_version: CONTRACT_VERSION,
        settings: CATALOGUE,
        // **The ladder, and not the five views over it.** Python derives the
        // same views from this list, so a rung inserted here reaches the
        // generator without a second edit (ROADMAP.md P1M5).
        ladder_version: LADDER_VERSION,
        ladder: LADDER,
        // The second axis. Not part of a rung, deliberately: a shape is a kind
        // of place rather than an amount of difficulty (`shape.ts`).
        shapes: SHAPES,
        // The generator has to hold `D-staleness` against `noticeLeadS`: a lag
        // shorter than the shortest announcement lead conceals nothing, on any
        // operator. Emitted so the comparison happens against one number rather
        // than two copies of it (KNOWN-ISSUES.md #19).
        disruption_policy: DEFAULT_DISRUPTION_POLICY,
      },
      null,
      2,
    ) + "\n";

  if (check) {
    const current = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (current !== next) {
      drift++;
      console.error(
        "drift: contract/catalogue.json does not match src/schema.\n" +
          "  Run: npm run contract:generate",
      );
    } else {
      console.log("ok: contract/catalogue.json");
    }
  } else {
    writeFileSync(path, next, "utf8");
    console.log("wrote: contract/catalogue.json");
  }
}

if (check && drift > 0) process.exit(1);
