import { test } from "node:test";
import assert from "node:assert/strict";
import { houseShape, isShirt } from "./house.ts";
import { TIE } from "./tie.ts";

test("форма нашей вещи - по модели; футболке своей нет", () => {
  assert.equal(houseShape("/models/tie.glb"), TIE);
  assert.equal(houseShape("/models/shirt.glb"), undefined);
  assert.equal(houseShape(null), undefined);
});

test("футболка - и без модели, и с моделью футболки", () => {
  assert.equal(isShirt(null), true);
  assert.equal(isShirt("/models/shirt.glb"), true);
  assert.equal(isShirt("/models/tie.glb"), false);
});
