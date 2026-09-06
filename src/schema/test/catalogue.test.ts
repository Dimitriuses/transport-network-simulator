// A setting's values must follow from the world they act on.
//
// Specification: KNOWN-ISSUES.md #34, CORECONCEPT.md §2.1.
//
// Plausibility is necessary and not sufficient. `D-staleness` offered
// `[60, 300, 900]` — every value something a real operator does — and against
// an announcement lead drawn from `[300, 1800]` two of the three concealed
// nothing whatever, because a feed hides a disruption only when its lag
// outlasts that disruption's lead. The conflict was a switch pretending to be a
// ladder, and nothing compared the two numbers.
//
// The rung is now stated in **effect space** and solved backwards. This test is
// the thing that keeps the two in step: change `noticeLeadS` and it fails,
// naming what to re-derive.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CATALOGUE,
  DEFAULT_DISRUPTION_POLICY,
  derivedValues,
  type CatalogueSetting,
} from "../src/index.ts";

const derived = CATALOGUE.filter((s) => s.derived !== undefined);

test("some setting derives its range, or #34 was never implemented", () => {
  assert.ok(derived.length > 0, "no catalogue setting derives its values from the world");
});

test("every derived range matches what the world's parameters imply", () => {
  for (const setting of derived) {
    const expected = derivedValues(setting, DEFAULT_DISRUPTION_POLICY.noticeLeadS);
    assert.ok(expected, `${setting.conflict} declares a derivation that produced nothing`);
    assert.deepEqual(
      [...setting.generate],
      expected,
      `${setting.conflict}'s generate list is [${setting.generate.join(", ")}] but its own ` +
        `derivation against noticeLeadS=[${DEFAULT_DISRUPTION_POLICY.noticeLeadS.join(", ")}] ` +
        `gives [${expected.join(", ")}]. One of them moved and the other did not — which is ` +
        `exactly how KNOWN-ISSUES.md #34 happened. Re-derive the list, or the targets.`,
    );
  }
});

test("every derived value actually conceals something", () => {
  // The property the derivation exists to guarantee. A lag at or below the
  // shortest announcement lead is overtaken before anybody has to act on it:
  // plausible, declared, audited present, and inert.
  const [lo] = DEFAULT_DISRUPTION_POLICY.noticeLeadS;
  for (const setting of derived) {
    for (const value of setting.generate) {
      assert.ok(
        Number(value) > lo,
        `${setting.conflict}=${String(value)} is at or below the shortest announcement ` +
          `lead (${lo}s), so it conceals nothing from anybody`,
      );
    }
  }
});

test("the rungs are distinct, so the ladder has steps", () => {
  for (const setting of derived) {
    const values = [...setting.generate];
    assert.equal(
      new Set(values).size,
      values.length,
      `${setting.conflict} has a repeated rung: ${values.join(", ")}. A target beyond the ` +
        `plausibility ceiling was clamped onto another — the ceiling has been reached, and ` +
        `the ladder cannot be lengthened without leaving what two real operators would do.`,
    );
  }
});

test("no derived value exceeds its own plausibility ceiling", () => {
  // The realism constraint outranks the ladder. Every failing-gate pressure in
  // this project has pointed at "make the conflict bigger", and deriving a
  // range must not become a new way to do it.
  for (const setting of derived) {
    const max = setting.plausible?.max;
    if (typeof max !== "number") continue;
    for (const value of setting.generate) {
      assert.ok(
        Number(value) <= max,
        `${setting.conflict}=${String(value)} is past its ceiling of ${max} — ` +
          `${setting.plausible?.because}`,
      );
    }
  }
});

test("the derivation responds to the world it is given", () => {
  // A "derivation" that returns the same numbers whatever the world is a
  // constant with extra steps.
  const setting = derived[0] as CatalogueSetting;
  const tight = derivedValues(setting, [60, 300]);
  const loose = derivedValues(setting, [600, 3600]);
  assert.ok(tight && loose);
  assert.notDeepEqual(tight, loose, `${setting.conflict}'s derivation ignores its input`);
});
