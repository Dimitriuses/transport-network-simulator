// Driving a run from outside it (P2M8): pause at a boundary, queue while paused,
// change speed without τ jumping, stop — and write down every one of them.
//
// Specification: TIME-MODEL.md §3, §2.3; PLAYER-CONTRACT.md §6.2, §6.4.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadWorld, makeVirtualClock } from "@tns/core";
import { scoreRun } from "@tns/scoring";
import type { RunRecord } from "@tns/schema";
import { RunControl } from "../src/control.ts";
import { runOpenLoop, type HarnessOptions } from "../src/harness.ts";
import { makePacer, type WallTimer } from "../src/pacing.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const worldPath = join(repoRoot, "worlds", "m1.world.db");
const skip = existsSync(worldPath) ? false : "no world bundle; run: npm run world:build";

function fakeTimer(): WallTimer & { advance(ms: number): void } {
  let now = 0;
  return {
    nowMs: () => now,
    sleepMs: (ms) => {
      now += ms;
      return Promise.resolve();
    },
    advance: (ms) => {
      now += ms;
    },
  };
}

test("a pause lands at the boundary, holds calls in order, and refuses past the queue's depth", async () => {
  const control = new RunControl(2);
  const applied: string[] = [];

  // Nothing is paused yet: calls go straight through.
  assert.equal(await control.admit(), true);

  control.request({ action: "pause" });
  control.request({ action: "pause" }); // a second pause changes nothing and is not applied
  let boundaryDone = false;
  const boundary = control.boundary((r) => applied.push(r.action)).then((v) => {
    boundaryDone = true;
    return v;
  });
  await Promise.resolve();
  assert.deepEqual(applied, ["pause"]);
  assert.equal(control.paused, true);
  assert.equal(boundaryDone, false, "the run went on while paused");

  const order: number[] = [];
  const first = control.admit().then((ok) => order.push(ok ? 1 : -1));
  const second = control.admit().then((ok) => order.push(ok ? 2 : -2));
  assert.equal(await control.admit(), false, "a third waiting call is past the depth of two, and is refused");
  assert.equal(control.queued, 2);

  control.request({ action: "resume" });
  assert.equal(await boundary, "continue");
  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2], "held calls are served in the order they arrived");
  assert.deepEqual(applied, ["pause", "resume"]);

  control.request({ action: "stop" });
  assert.equal(await control.boundary((r) => applied.push(r.action)), "stop");
  control.request({ action: "pause" });
  assert.equal(control.pending, false, "nothing is asked of a stopped run");
});

test("changing speed or mode never makes τ jump, and a hold does not count its wall time", async () => {
  const timer = fakeTimer();
  const clock = makeVirtualClock(1000);
  const pacer = makePacer("scaled", clock, 60, timer);
  pacer.start();
  timer.advance(1000);
  assert.equal(pacer.tau(), 1060);

  pacer.retime("scaled", 600);
  assert.equal(pacer.tau(), 1060, "a change of speed moved τ");
  timer.advance(1000);
  assert.equal(pacer.tau(), 1660);

  pacer.hold();
  timer.advance(60_000);
  assert.equal(pacer.tau(), 1660, "τ moved during a hold");
  pacer.release();
  assert.equal(pacer.tau(), 1660, "a hold's wall time was counted");
  timer.advance(100);
  assert.equal(pacer.tau(), 1720);

  pacer.retime("virtual", undefined);
  assert.equal(pacer.tau(), 1720, "switching to virtual moved τ");
  assert.equal(pacer.pausesForHandlers, true);
  // An event the wall-driven stretch already passed is issued at once, late.
  assert.equal(await pacer.waitFor(1700), 20);
  assert.equal(await pacer.waitFor(1800), 0);
  assert.equal(pacer.tau(), 1800);

  pacer.retime("scaled", 3600);
  assert.equal(pacer.tau(), 1800);
  // A wait is interrupted when a change is waiting, so it can land at once.
  assert.equal(await pacer.waitFor(99_999, () => true), null);
});

async function run(ports: number, mode: string, extra: Partial<HarnessOptions>): Promise<RunRecord[]> {
  const world = loadWorld(worldPath);
  const player = spawn(
    process.execPath,
    ["--disable-warning=ExperimentalWarning", join(repoRoot, "src", "refplayer", "scripts", "serve.ts")],
    {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, TNS_PLAYER_PORT: String(ports + 10), TNS_CONTROL_URL: `http://127.0.0.1:${ports + 9}`, TNS_PLAYER_MODE: mode },
    },
  );
  try {
    return await runOpenLoop({
      world,
      playerBaseUrl: `http://127.0.0.1:${ports + 10}`,
      operatorPort: ports,
      controlPort: ports + 9,
      ...extra,
    });
  } finally {
    player.kill();
  }
}

const travellers = (log: RunRecord[]) => log.filter((r) => r.kind === "traveller");

test("a paused virtual run holds the operators, tells the clock, and decides every traveller as it would have", { skip }, async () => {
  const control = new RunControl();
  const observed = { started: false, clock: "", heldCallReturned: false };

  const log = await run(8410, "naive", {
    control,
    onState: (s) => {
      if (s !== "running" || observed.started) return;
      observed.started = true;
      control.request({ action: "pause" });
      void (async () => {
        // Let the pause land at the next boundary.
        await new Promise((r) => setTimeout(r, 300));
        const clock = (await (await fetch("http://127.0.0.1:8419/v1/clock")).json()) as { state: string };
        observed.clock = clock.state;
        const held = fetch("http://127.0.0.1:8410/realtime").then(() => (observed.heldCallReturned = true));
        await new Promise((r) => setTimeout(r, 300));
        const returnedWhilePaused = observed.heldCallReturned;
        control.request({ action: "resume" });
        await held;
        observed.heldCallReturned = returnedWhilePaused;
      })();
    },
  });

  assert.ok(observed.started, "the run never started");
  assert.equal(observed.clock, "paused", "/v1/clock did not say the run was paused");
  assert.equal(observed.heldCallReturned, false, "an operator call was served during a manual pause");

  const actions = log.filter((r) => r.kind === "control").map((r) => (r as { action: string }).action);
  assert.deepEqual(actions, ["pause", "resume"]);

  // In `virtual` a pause changes when, never what.
  const plain = await run(8430, "naive", {});
  assert.deepEqual(travellers(log), travellers(plain));

  const card = scoreRun(log);
  assert.equal(card.comparable, false);
  assert.match(card.notComparableBecause ?? "", /paused, re-sped or stopped/);
});

test("a run stopped from outside ends there, says so, and is never scored", { skip }, async () => {
  const control = new RunControl();
  let asked = false;
  const log = await run(8450, "naive", {
    control,
    onState: (s) => {
      if (s === "running" && !asked) {
        asked = true;
        control.request({ action: "stop" });
      }
    },
  });
  const end = log.find((r) => r.kind === "run_end") as Extract<RunRecord, { kind: "run_end" }> | undefined;
  assert.equal(end?.reason, "aborted");
  assert.ok(travellers(log).length < 98, "a stopped run carried on to the end of the day");
  assert.equal(scoreRun(log).verdict, "invalid");

  // Replayed, it stops where it stopped, rather than diverging on the first
  // request its recording never holds — which is what the viewer relies on.
  const replayed = await runOpenLoop({
    world: loadWorld(worldPath),
    playerBaseUrl: "http://127.0.0.1:0",
    operatorPort: 0,
    controlPort: 0,
    replay: log,
  });
  assert.deepEqual(travellers(replayed), travellers(log));
  assert.equal((replayed.find((r) => r.kind === "run_end") as { reason: string } | undefined)?.reason, "aborted");
});

test("a run can change from virtual to scaled and back, and records each change", { skip }, async () => {
  const control = new RunControl();
  let asked = false;
  const log = await run(8470, "naive", {
    control,
    onState: (s) => {
      if (s !== "running" || asked) return;
      asked = true;
      control.request({ action: "retime", timeMode: "scaled", speed: 36_000 });
      setTimeout(() => control.request({ action: "retime", timeMode: "virtual" }), 400);
    },
  });
  const retimes = log.filter((r) => r.kind === "control") as Extract<RunRecord, { kind: "control" }>[];
  assert.deepEqual(
    retimes.map((r) => [r.action, r.timeMode, r.speed]),
    [
      ["retime", "scaled", 36_000],
      ["retime", "virtual", 1],
    ],
  );
  assert.equal(travellers(log).length, 98, "the run did not finish after changing mode");
  const taus = retimes.map((r) => r.tau);
  assert.ok(taus[1]! >= taus[0]!, "τ went backwards across a change of mode");
});
