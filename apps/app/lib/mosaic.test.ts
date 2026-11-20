import { test } from "node:test";
import assert from "node:assert/strict";
import { mosaic } from "./mosaic.ts";

const area = (one: { w: number; h: number }) => one.w * one.h;

test("площадь плитки пропорциональна доле, вместе - весь прямоугольник", () => {
  const tiles = mosaic([600, 300, 100], 100, 60);
  const total = tiles.reduce((sum, one) => sum + area(one), 0);
  assert.ok(Math.abs(total - 6000) < 1e-6);
  assert.ok(Math.abs(area(tiles[0]!) - 3600) < 1e-6);
  assert.ok(Math.abs(area(tiles[1]!) - 1800) < 1e-6);
  assert.ok(Math.abs(area(tiles[2]!) - 600) < 1e-6);
});

test("плитки внутри прямоугольника и не налезают друг на друга", () => {
  const tiles = mosaic([1001, 950, 900, 750, 750, 600, 450, 300, 300], 160, 90);
  for (const one of tiles) {
    assert.ok(one.x >= -1e-9 && one.y >= -1e-9 && one.x + one.w <= 160 + 1e-9 && one.y + one.h <= 90 + 1e-9);
  }
  for (let a = 0; a < tiles.length; a++) {
    for (let b = a + 1; b < tiles.length; b++) {
      const p = tiles[a]!;
      const q = tiles[b]!;
      const overlap =
        Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) *
        Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
      assert.ok(overlap < 1e-6, `плитки ${a} и ${b} налезают`);
    }
  }
});

test("одна плитка - весь прямоугольник, порядок плиток - как у значений", () => {
  assert.deepEqual(mosaic([5], 10, 4), [{ x: 0, y: 0, w: 10, h: 4 }]);
  const tiles = mosaic([1, 9], 10, 10);
  assert.ok(area(tiles[1]!) > area(tiles[0]!));
});

test("пусто - пусто", () => {
  assert.deepEqual(mosaic([], 10, 10), []);
});
