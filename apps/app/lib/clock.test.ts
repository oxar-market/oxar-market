import { test } from "node:test";
import assert from "node:assert/strict";
import { heroClock, left } from "./clock.ts";

const now = Date.parse("2026-10-03T12:00:00Z");
const at = (seconds: number) => now + seconds * 1000;

test("сколько осталось: часы-минуты-секунды, дни - впереди", () => {
  assert.equal(left(at(28 * 60 + 30), now), "00:28:30");
  assert.equal(left(at(2 * 86_400 + 3600), now), "2d 01:00:00");
  assert.equal(left(at(-5), now), "00:00:00");
});

test("идущий торг: закрытие, красная точка в последние сутки", () => {
  assert.deepEqual(heroClock(null, at(28 * 60 + 30), now), { text: "Closes in 00:28:30", urgent: true });
  assert.deepEqual(heroClock(at(-3600), at(3 * 86_400), now), { text: "Closes in 3d 00:00:00", urgent: false });
});

test("ровно сутки до закрытия - ещё не срочно", () => {
  assert.equal(heroClock(null, at(86_400), now).urgent, false);
  assert.equal(heroClock(null, at(86_399), now).urgent, true);
});

test("торг ещё не открылся: открытие, без красной точки", () => {
  assert.deepEqual(heroClock(at(3600), at(5 * 3600), now), { text: "Opens in 01:00:00", urgent: false });
});
