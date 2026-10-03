import { test } from "node:test";
import assert from "node:assert/strict";
import { outlineInBox } from "./outline.ts";

test("точки в долях своей рамки - в процентах, для SVG и clip-path", () => {
  const box = { x: 0.1, y: 0.2, w: 0.4, h: 0.5 };
  assert.deepEqual(outlineInBox([[0.1, 0.2], [0.5, 0.7], [0.3, 0.45]], box), [[0, 0], [100, 100], [50, 50]]);
});
