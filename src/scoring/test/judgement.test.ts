// The M5 exit condition, as tests.
//
// ROADMAP.md M5: "a complete scorecard renders for a real run, and the
// information-set audit correctly flags a deliberately planted leak."

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld } from "@tns/core";
import { runOpenLoop } from "@tns/server";
import { scoreRun, renderScorecard, auditInformationSets, PROFILES } from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

async function run(mode: string, ports: { operator: number; control: number; player: number }) {
  const world = loadWorld(worldPath);
  const player = spawn(
    process.execPath,
    [join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
      env: {
        ...process.env,
        TNS_PLAYER_PORT: String(ports.player),
        TNS_CONTROL_URL: `http://127.0.0.1:${ports.control}`,
        TNS_PLAYER_MODE: mode,
      },
    },
  );
  try {
    const log = await runOpenLoop({
      world,
      playerBaseUrl: `http://127.0.0.1:${ports.player}`,
      operatorPort: ports.operator,
      controlPort: ports.control,
    });
    return { world, log };
  } finally {
    player.kill();
  }
}

test("a complete scorecard renders for a real run", { skip }, async () => {
  const { world, log } = await run("naive", { operator: 9300, control: 9309, player: 8300 });
  const card = scoreRun(log, { tier: world.manifest.tier });
  const text = renderScorecard(card, auditInformationSets(world, log));

  for (const section of ["SERVICE", "INFORMATION", "COST", "HEADLINE", "INFORMATION-SET AUDIT"]) {
    assert.ok(text.includes(section), `scorecard is missing the ${section} section`);
  }
  // The vector is canonical; the headline names the weighting it used.
  assert.ok(text.includes(`profile=${card.profile}`), "the headline does not name its profile");
  assert.notEqual(card.headline, null);
  assert.ok(card.attribution.length > 0, "nothing was attributed");
});

test("the information-set audit is clean for an honest player", { skip }, async () => {
  const { world, log } = await run("naive", { operator: 9310, control: 9319, player: 8310 });
  const audit = auditInformationSets(world, log);

  assert.ok(
    audit.clean,
    `an honest player was flagged: ${audit.findings.map((f) => f.explanation).join("; ")}`,
  );
  assert.ok(audit.obligationsChecked > 0, "the audit checked nothing");
});

test("the information-set audit flags a planted leak", { skip }, async () => {
  // `cheat` opens the world bundle directly and plans with the oracle's
  // information — every cancellation, including ones no feed has published.
  // An audit that has never fired on a real violation is an assertion, not a
  // check (OBSERVABILITY.md §5).
  const { world, log } = await run("cheat", { operator: 9320, control: 9329, player: 8320 });
  const audit = auditInformationSets(world, log);

  assert.equal(audit.clean, false, "a player planning with the oracle's information was not caught");
  assert.ok(audit.findings.length > 0);
  assert.match(audit.findings[0]!.explanation, /beat its information set/);
});

test("a cheat scores far above an honest player, which is why the audit exists", { skip }, async () => {
  const honest = await run("naive", { operator: 9330, control: 9339, player: 8330 });
  const cheat = await run("cheat", { operator: 9340, control: 9349, player: 8340 });

  const a = scoreRun(honest.log).service.capture!;
  const b = scoreRun(cheat.log).service.capture!;

  // The headline invariants cannot separate these: the cheat lands on 1.000,
  // not above it, so `capture > 1` never fires. Only the information-set audit
  // distinguishes earned from unearned.
  assert.ok(b > a, `cheating did not pay (${b} vs ${a})`);
  assert.ok(b <= 1.0001, "the cheat exceeded the oracle, which is a different bug");
});

test("profiles weight the same vector differently and say which they used", { skip }, async () => {
  const { log } = await run("naive", { operator: 9350, control: 9359, player: 8350 });

  const passenger = scoreRun(log, { profile: "passenger" });
  const realtime = scoreRun(log, { profile: "realtime" });

  assert.equal(passenger.profile, "passenger");
  assert.equal(realtime.profile, "realtime");
  // Same run, same vector, different headline — which is the whole reason the
  // weighting has to be named wherever a number is quoted (SCORING.md §7).
  assert.notEqual(passenger.headline, realtime.headline);
  assert.equal(passenger.service.capture, realtime.service.capture);
});

test("every profile is a declared, named weighting", () => {
  for (const [key, p] of Object.entries(PROFILES)) {
    assert.equal(key, p.name);
    assert.ok(p.service + p.information + p.cost > 0, `${key} weights nothing`);
  }
});
