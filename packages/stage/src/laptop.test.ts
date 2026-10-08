import { test } from "node:test";
import assert from "node:assert/strict";
import { LAPTOP, LAPTOP_SPOTS } from "./laptop.ts";

test("все места ноутбука на крышке: азимут 0, сцена не разворачивает вещь боком", () => {
  for (const spot of LAPTOP_SPOTS) assert.equal(spot.azimuth, 0, spot.code);
});

test("места ноутбука не вылезают за крышку и не налезают друг на друга", () => {
  // Ширина крышки в сцене 0.62, высота 0.438.
  for (const spot of LAPTOP_SPOTS) {
    assert.ok(Math.abs(spot.shift ?? 0) + spot.size[0] / 2 < 0.31, spot.code);
    const half = spot.size[1] / 2 / 0.438;
    assert.ok(spot.height - half > 0 && spot.height + half < 1, spot.code);
  }
  const top = LAPTOP_SPOTS.filter((spot) => spot.height > 0.5);
  for (let at = 1; at < top.length; at++) {
    assert.ok((top[at].shift ?? 0) - (top[at - 1].shift ?? 0) >= top[at].size[0], top[at].code);
  }
});

test("коды мест ноутбука не повторяются, вещь не ткань", () => {
  const codes = LAPTOP_SPOTS.map((spot) => spot.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(LAPTOP.cloth, false);
});
