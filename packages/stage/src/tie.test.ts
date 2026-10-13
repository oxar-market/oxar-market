import { test } from "node:test";
import assert from "node:assert/strict";
import { TIE, TIE_SPOTS } from "./tie.ts";

test("галстук продаётся одним местом, узором на весь галстук", () => {
  assert.equal(TIE_SPOTS.length, 1);
  assert.equal(TIE_SPOTS[0]?.tile, true);
  assert.equal(TIE_SPOTS[0]?.code, "tie_pattern");
});

test("узор лежит на полотне, ниже узла и петли", () => {
  const [spot] = TIE_SPOTS;
  const half = spot!.size[1] / 2 / 0.62;
  assert.ok(spot!.height - half >= 0, "не ниже острия");
  assert.ok(spot!.height + half <= 0.72, "не выше узла");
});

test("галстук не ткань под перекраску в белое, а свой цвет", () => {
  assert.equal(TIE.cloth, false);
  assert.equal(typeof TIE.paint, "number");
});
