import { test } from "node:test";
import assert from "node:assert/strict";
import { fitInside } from "./fit.ts";

test("широкая картинка упирается в бока, поля сверху и снизу", () => {
  const box = fitInside({ width: 200, height: 100 }, { width: 100, height: 100 });
  assert.equal(box.width, 100);
  assert.equal(box.height, 50);
  assert.equal(box.x, 0);
  assert.equal(box.y, 25);
});

test("высокая картинка упирается в верх и низ, поля по бокам", () => {
  const box = fitInside({ width: 100, height: 200 }, { width: 100, height: 100 });
  assert.equal(box.width, 50);
  assert.equal(box.height, 100);
  assert.equal(box.x, 25);
  assert.equal(box.y, 0);
});

test("пропорции картинки не меняются - иначе логотип напечатают кривым", () => {
  const image = { width: 300, height: 120 };
  const box = fitInside(image, { width: 512, height: 331 });
  assert.ok(
    Math.abs(box.width / box.height - image.width / image.height) < 1e-9,
    "соотношение сторон уехало",
  );
});

test("картинка меньше места всё равно занимает его целиком по одной оси", () => {
  // Маленький логотип надо увеличить: место оплачено целиком, и печатать его
  // маркой в углу никто не просил.
  const box = fitInside({ width: 10, height: 10 }, { width: 100, height: 200 });
  assert.equal(box.width, 100);
  assert.equal(box.height, 100);
});

test("пустая картинка - это ошибка, а не молча пустое место", () => {
  assert.throws(() => fitInside({ width: 0, height: 10 }, { width: 10, height: 10 }));
  assert.throws(() => fitInside({ width: 10, height: 10 }, { width: 10, height: 0 }));
});
