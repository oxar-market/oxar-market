import { test } from "node:test";
import assert from "node:assert/strict";
import { facing } from "./facing.ts";
import { SUITCASE_SPOTS } from "./suitcase.ts";
import { VAN_SPOTS } from "./van.ts";
import { SPOTS } from "./spots.ts";

const all = () => true;

test("направление - единичный вектор и смотрит чуть сверху", () => {
  const [x, y, z] = facing(SPOTS, all);
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
  assert.ok(y > 0);
});

test("футболка с местами на груди - спереди, вполоборота", () => {
  const [x, , z] = facing(SPOTS, all);
  assert.ok(z > 0.8 && x > 0);
});

test("чемодан с панелью сбоку - с той же стороны", () => {
  const [x] = facing(SUITCASE_SPOTS, all);
  assert.ok(x < -0.8, "панель под углом -90, значит и взгляд слева");
});

test("ван - к правому борту, а не к капоту: места сверху грань не выбирают", () => {
  const [x, , z] = facing(VAN_SPOTS, all);
  assert.ok(z > 0.8 && x > 0);
});

test("непроданное место грань не выбирает: правый борт пуст - смотрим на левый", () => {
  const right = VAN_SPOTS.filter((spot) => spot.azimuth === 0 && !spot.top).map((spot) => spot.code);
  const [, , z] = facing(VAN_SPOTS, (code) => !right.includes(code));
  assert.ok(z < -0.8);
});

test("без проданных мест - спереди", () => {
  const [x, , z] = facing(VAN_SPOTS, () => false);
  assert.ok(z > 0.8 && x > 0);
});
