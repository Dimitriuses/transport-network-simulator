// An operator's key must survive a rename, and must not invent a distinction.
//
// The memorising reference solution keyed its answers by operator id, and since
// P1M6 no two worlds of a rung share one — so on any different world it read no
// feed at all, and the transfer test certified two identical worlds as
// non-memorisable (`KNOWN-ISSUES.md` #59). These are the properties a key needs
// instead, with the case each one rejects built in.
//
// The shapes are the committed ladder's own, read off `metro-town` and
// `towns-and-rail` worlds from different city seeds.

import { test } from "node:test";
import assert from "node:assert/strict";

import { operatorKeys, operatorKind } from "../src/index.ts";

const op = (operator: string, name: string, lines: number, trips: number) => ({
  operator,
  operator_name: name,
  routes: Array.from({ length: lines }, () => 0),
  trips: Array.from({ length: trips }, () => 0),
});

test("an operator keeps its key when every name in the world changes", () => {
  // `metro-town`, as two seeds actually generated it: the same roster, the same
  // shares, different ids and different place names in front of the kind.
  const home = [
    op("akademichnaline", "Akademichnaline Transit", 4, 384),
    op("universytetline", "Universytetline Tram", 5, 874),
    op("kameniariv", "Kameniariv Metro", 2, 1052),
  ];
  const away = [
    op("verbovaline", "Verbovaline Transit", 4, 328),
    op("soliankaline", "Soliankaline Tram", 5, 874),
    op("vapnianabahn", "Vapnianabahn Metro", 2, 1052),
  ];

  const h = operatorKeys(home);
  const a = operatorKeys(away);
  for (let i = 0; i < home.length; i += 1) {
    const key = h.get(home[i]!.operator);
    assert.ok(key, `${home[i]!.operator} has no key`);
    assert.equal(a.get(away[i]!.operator), key, "the same role on another world got another key");
    // The thing an id-keyed answer key could not do.
    assert.notEqual(key, away[i]!.operator);
  }
});

test("two operators of one kind are told apart by what they run", () => {
  // `towns-and-rail` runs two bus companies. Same kind, same number of lines,
  // and the same 21 % of the quays each — reach cannot separate them. Trips can.
  const keys = operatorKeys([
    op("a", "Verbova Transit", 3, 306),
    op("b", "Solianka Transit", 3, 274),
    op("c", "Kamin Tram", 7, 1134),
  ]);
  assert.equal(keys.get("a"), "Transit#0");
  assert.equal(keys.get("b"), "Transit#1");
  assert.equal(keys.get("c"), "Tram#0");
});

test("a tie has no key, and the ids do not break it", () => {
  // A polycentric region's towns are symmetric, so their trams run the same
  // lines and trips. Anything that separated them would have to be something
  // the seed renames — and a key that did that is the defect again.
  const tied = [op("x", "Nord Tram", 4, 712), op("y", "Sud Tram", 4, 712), op("z", "Ost Tram", 4, 700)];
  const keys = operatorKeys(tied);
  assert.equal(keys.get("x"), null);
  assert.equal(keys.get("y"), null);
  assert.equal(keys.get("z"), "Tram#2", "an untied operator keeps a key beside a tie");

  const swapped = operatorKeys([op("y", "Nord Tram", 4, 712), op("x", "Sud Tram", 4, 712), tied[2]!]);
  assert.equal(swapped.get("x"), null, "swapping ids must not resolve a tie");
});

test("the order operators arrive in does not matter", () => {
  const ops = [
    op("m", "Kameniariv Metro", 3, 1578),
    op("r", "Vapniana Regional", 4, 190),
    op("t", "Kamin Tram", 7, 1134),
    op("a", "Verbova Transit", 3, 306),
    op("b", "Solianka Transit", 3, 274),
  ];
  const forward = operatorKeys(ops);
  const backward = operatorKeys([...ops].reverse());
  for (const o of ops) assert.equal(backward.get(o.operator), forward.get(o.operator));
});

test("the kind is the last word of the name", () => {
  assert.equal(operatorKind("Kameniariv Metro"), "Metro");
  assert.equal(operatorKind("  Vapnianabahn   Regional "), "Regional");
  assert.equal(operatorKind("Tram"), "Tram");
});
