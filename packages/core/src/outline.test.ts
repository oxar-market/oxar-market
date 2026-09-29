import { test } from "node:test";
import assert from "node:assert/strict";
import { outlineBox, outlineInBox, simplifyOutline } from "./outline.ts";

test("рамка контура - крайние точки", () => {
  assert.deepEqual(
    outlineBox([[0.2, 0.3], [0.6, 0.1], [0.5, 0.7], [0.1, 0.4]]),
    { x: 0.1, y: 0.1, w: 0.5, h: 0.6 },
  );
});

test("точки на прямой выбрасываются, углы остаются", () => {
  const line: [number, number][] = [];
  for (let at = 0; at <= 10; at++) line.push([at / 10, 0]);
  line.push([1, 1], [0, 1]);
  const simple = simplifyOutline(line, 0.01);
  assert.deepEqual(simple, [[0, 0], [1, 0], [1, 1], [0, 1]]);
});

test("упрощение не делает фигуру из двух точек", () => {
  const simple = simplifyOutline([[0, 0], [0.5, 0.001], [1, 0]], 0.1);
  assert.ok(simple.length >= 3);
});

test("точек не больше предела, даже у дрожащей руки", () => {
  const shaky: [number, number][] = [];
  for (let at = 0; at < 500; at++) {
    const angle = (at / 500) * Math.PI * 2;
    shaky.push([0.5 + 0.3 * Math.cos(angle) + (at % 2) * 0.004, 0.5 + 0.3 * Math.sin(angle)]);
  }
  assert.ok(simplifyOutline(shaky, 0.002).length <= 64);
});

test("точки в долях своей рамки - в процентах, для SVG и clip-path", () => {
  const box = { x: 0.1, y: 0.2, w: 0.4, h: 0.5 };
  assert.deepEqual(outlineInBox([[0.1, 0.2], [0.5, 0.7], [0.3, 0.45]], box), [[0, 0], [100, 100], [50, 50]]);
});
