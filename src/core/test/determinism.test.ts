// The P0M0 exit condition, as an executable test.
//
// ROADMAP.md P0M0: "a deliberate Math.random() added to src/core fails CI".
// This asserts that, and the other three determinism rules with it, by linting
// a fixture that violates all four and checking ESLint rejects each one.
//
// If this test ever fails, the determinism rules have stopped being enforced
// and the project's reproducibility guarantee is gone — quietly, and in a way
// that would surface much later as unexplainable score differences.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const fixture = join(here, "fixtures", "violations.ts");

type LintMessage = { ruleId: string | null; message: string; line: number };
type LintResult = { filePath: string; errorCount: number; messages: LintMessage[] };

function lintFixture(): LintResult {
  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, "node_modules", "eslint", "bin", "eslint.js"),
      "--no-ignore",
      "--format",
      "json",
      fixture,
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 1 << 24 },
  );

  const stdout = result.stdout?.trim() ?? "";
  assert.ok(stdout.length > 0, `eslint produced no output.\nstderr:\n${result.stderr}`);

  const parsed = JSON.parse(stdout) as LintResult[];
  const first = parsed[0];
  assert.ok(first, "eslint returned no results for the fixture");
  return first;
}

test("the determinism fixture is rejected by lint", () => {
  const result = lintFixture();
  assert.ok(
    result.errorCount > 0,
    "The fixture violates all four determinism rules but lint accepted it. " +
      "The rules in eslint.config.mjs are not being applied to src/core.",
  );
});

test("each determinism rule is enforced", () => {
  const text = lintFixture()
    .messages.filter((m) => m.ruleId === "no-restricted-syntax")
    .map((m) => m.message)
    .join("\n");

  // Each expectation quotes the distinguishing phrase from the rule's message
  // in eslint.config.mjs.
  const expectations: ReadonlyArray<readonly [string, string]> = [
    ["async/await", "No async/await in the simulation core"],
    ["wall clock", "No wall-clock reads in the simulation core"],
    ["Math.random", "No Math.random in the simulation core"],
    ["transcendentals", "No transcendental Math functions"],
  ];

  for (const [label, phrase] of expectations) {
    assert.ok(
      text.includes(phrase),
      `The ${label} determinism rule did not fire on the fixture.\n` +
        `Expected a message containing: ${phrase}\n` +
        `Got:\n${text || "(no no-restricted-syntax messages at all)"}`,
    );
  }
});
