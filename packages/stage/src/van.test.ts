import { test } from "node:test";
import assert from "node:assert/strict";
import { VAN, VAN_SPOTS } from "./van.ts";

test("у вана одиннадцать мест с разными кодами, вещь не ткань", () => {
  const codes = VAN_SPOTS.map((spot) => spot.code);
  assert.equal(codes.length, 11);
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(VAN.cloth, false);
});

test("капот и крыша размечены сверху, остальное - на бортах и корме", () => {
  const top = VAN_SPOTS.filter((spot) => spot.top).map((spot) => spot.code).sort();
  assert.deepEqual(top, ["van_hood", "van_roof"]);
  for (const spot of VAN_SPOTS.filter((one) => !one.top)) {
    assert.ok([0, 180, -90].includes(spot.azimuth), spot.code);
  }
});

test("места вана не вылезают за габарит: длина в сцене 0.62, ширина 0.24", () => {
  for (const spot of VAN_SPOTS) {
    // Место сверху смотрит лицом вперёд: ширина - поперёк вана, высота - вдоль.
    const along = spot.top ? spot.size[1] : spot.azimuth === -90 ? 0 : spot.size[0];
    assert.ok(Math.abs(spot.shift ?? 0) + along / 2 <= 0.31, spot.code);
    if (spot.top || spot.azimuth === -90) assert.ok(spot.size[0] <= 0.24, spot.code);
  }
});

test("места на одном борту не налезают друг на друга", () => {
  const right = VAN_SPOTS.filter((spot) => !spot.top && spot.azimuth === 0 && spot.height > 0.45)
    .sort((a, b) => (a.shift ?? 0) - (b.shift ?? 0));
  for (let at = 1; at < right.length; at++) {
    const gap = (right[at].shift ?? 0) - (right[at - 1].shift ?? 0);
    assert.ok(gap >= (right[at].size[0] + right[at - 1].size[0]) / 2, right[at].code);
  }
});

test("стикеры на ване: по очереди перёд и корма, ячейки не повторяются", () => {
  const slots = VAN.stickers!.slots;
  assert.ok(slots.length >= 50, `ячеек ${slots.length}`);
  // Любые первые n покупок делятся между бамперами поровну, с разницей не
  // больше одной.
  for (let n = 1; n <= slots.length; n++) {
    const front = slots.slice(0, n).filter((slot) => slot.azimuth === 90).length;
    assert.ok(Math.abs(front - (n - front)) <= 1, `на ${n}`);
  }
  for (const slot of slots) assert.ok([90, -90].includes(slot.azimuth));
  const keys = slots.map((slot) => `${slot.azimuth}:${slot.height}:${slot.shift}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("стикеры вразброс: подряд не идут ячейки одного ряда", () => {
  const front = VAN.stickers!.slots.filter((slot) => slot.azimuth === 90);
  // Не построчно слева направо: хоть одна пара соседних покупок - в разных рядах.
  assert.ok(front.slice(0, 6).some((slot, at, all) => at > 0 && slot.height !== all[at - 1]!.height));
});
