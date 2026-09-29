import { test } from "node:test";
import assert from "node:assert/strict";
import { SUITCASE, SUITCASE_SPOTS } from "./suitcase.ts";

test("места чемодана лежат на плоской полосе лицевой грани", () => {
  for (const spot of SUITCASE_SPOTS) {
    assert.ok(spot.height >= 0.1 && spot.height <= 0.62, spot.code);
    assert.ok(spot.azimuth >= -120 && spot.azimuth <= -60, spot.code);
  }
});

test("коды мест чемодана не повторяются", () => {
  const codes = SUITCASE_SPOTS.map((spot) => spot.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("чемодан не перекрашивается в ткань", () => {
  assert.equal(SUITCASE.cloth, false);
  assert.equal(SUITCASE.spots, SUITCASE_SPOTS);
});
