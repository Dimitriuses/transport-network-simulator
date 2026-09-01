import { test } from "node:test";
import assert from "node:assert/strict";

import { Identity, Health, CONTRACT_VERSION } from "../src/index.ts";

test("a well-formed identity parses", () => {
  const parsed = Identity.parse({
    name: "my-integrator",
    version: "0.4.1",
    contract_versions: [CONTRACT_VERSION],
    capabilities: ["plan", "replan", "tick", "notify"],
    tick: { interval_sim_s: 30 },
  });

  assert.equal(parsed.name, "my-integrator");
  assert.equal(parsed.tick?.interval_sim_s, 30);
});

test("tick is optional — a player may decline ingestion cues", () => {
  // Legal, and appropriate for a static-timetable Tier 0/1 world.
  const parsed = Identity.parse({
    name: "planner-only",
    version: "0.1.0",
    contract_versions: [CONTRACT_VERSION],
    capabilities: ["plan"],
  });

  assert.equal(parsed.tick, undefined);
  assert.deepEqual(parsed.capabilities, ["plan"]);
});

test("an unknown capability is rejected", () => {
  assert.throws(() =>
    Identity.parse({
      name: "x",
      version: "1",
      contract_versions: [CONTRACT_VERSION],
      capabilities: ["plan", "telepathy"],
    }),
  );
});

test("a non-positive tick interval is rejected", () => {
  assert.throws(() =>
    Identity.parse({
      name: "x",
      version: "1",
      contract_versions: [CONTRACT_VERSION],
      capabilities: ["tick"],
      tick: { interval_sim_s: 0 },
    }),
  );
});

test("health accepts the three declared states and nothing else", () => {
  for (const status of ["ready", "starting", "unavailable"]) {
    assert.equal(Health.parse({ status }).status, status);
  }
  assert.throws(() => Health.parse({ status: "probably" }));
});
