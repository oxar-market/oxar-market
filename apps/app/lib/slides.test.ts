import { test } from "node:test";
import assert from "node:assert/strict";
import { restingSlide, stepIndex, swipeStep } from "./slides.ts";

test("карусель на месте - править нечего", () => {
  assert.deepEqual(restingSlide(390, 390, 3), { index: 1, left: 390, off: false });
  assert.deepEqual(restingSlide(0, 390, 3), { index: 0, left: 0, off: false });
});

test("доли пикселя от округления не считаются сдвигом", () => {
  assert.equal(restingSlide(389.5, 390, 3).off, false);
  assert.equal(restingSlide(780.7, 390, 3).off, false);
});

test("застрявшая посреди карусель доезжает до ближайшего слайда", () => {
  // Так её оставлял iPhone: прокрутку ленты обрывал scrollIntoView.
  assert.deepEqual(restingSlide(295, 390, 2), { index: 1, left: 390, off: true });
  assert.deepEqual(restingSlide(70, 390, 2), { index: 0, left: 0, off: true });
});

test("за краями - крайний слайд, а не несуществующий", () => {
  assert.deepEqual(restingSlide(-30, 390, 2), { index: 0, left: 0, off: true });
  assert.deepEqual(restingSlide(900, 390, 2), { index: 1, left: 390, off: true });
});

test("пустая или невидимая лента - нулевой слайд без сдвига", () => {
  assert.deepEqual(restingSlide(0, 0, 3), { index: 0, left: 0, off: false });
  assert.deepEqual(restingSlide(120, 390, 0), { index: 0, left: 0, off: false });
});

test("листание фото идёт по кругу", () => {
  assert.equal(stepIndex(0, 1, 3), 1);
  assert.equal(stepIndex(2, 1, 3), 0);
  assert.equal(stepIndex(0, -1, 3), 2);
  assert.equal(stepIndex(0, 1, 1), 0);
});

test("свайп: влево - следующее фото, вправо - предыдущее, мелкое движение - тап", () => {
  assert.equal(swipeStep(-80), 1);
  assert.equal(swipeStep(80), -1);
  assert.equal(swipeStep(-10), 0);
  assert.equal(swipeStep(39), 0);
});
