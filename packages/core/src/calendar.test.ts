import { strict as assert } from "node:assert";
import { test } from "node:test";
import { calendarDays, endDate, isWithin } from "./calendar.ts";

test("конец срока включительно: старт 10-го на 7 дней - это по 16-е", () => {
  assert.equal(endDate("2026-09-10", 7), "2026-09-16");
  assert.equal(endDate("2026-09-10", 1), "2026-09-10", "один день - тот же день");
});

test("конец срока перескакивает через границу месяца", () => {
  assert.equal(endDate("2026-09-28", 5), "2026-10-02");
});

test("пустой календарь: занятости нет, начать можно с любого дня", () => {
  const days = calendarDays({ from: "2026-09-10", count: 5, termDays: 3, busy: [] });
  assert.equal(days.length, 5);
  assert.deepEqual(
    days.map((day) => day.date),
    ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14"],
  );
  assert.ok(days.every((day) => day.canStart && !day.taken));
});

test("занятые дни помечены занятыми, и только они", () => {
  const days = calendarDays({
    from: "2026-09-10",
    count: 6,
    termDays: 1,
    busy: [{ startDate: "2026-09-12", endDate: "2026-09-13" }],
  });
  assert.deepEqual(
    days.filter((day) => day.taken).map((day) => day.date),
    ["2026-09-12", "2026-09-13"],
  );
});

test("начать нельзя, если срок налезает на занятые дни - но сам день свободен", () => {
  const days = calendarDays({
    from: "2026-09-10",
    count: 6,
    termDays: 3,
    busy: [{ startDate: "2026-09-12", endDate: "2026-09-12" }],
  });
  const byDate = new Map(days.map((day) => [day.date, day]));

  // 10-е свободно, но срок 10-12 задел бы занятое 12-е
  assert.equal(byDate.get("2026-09-10")?.taken, false);
  assert.equal(byDate.get("2026-09-10")?.canStart, false);
  assert.equal(byDate.get("2026-09-13")?.canStart, true, "после занятого дня можно");
});

test("срок может выйти за окно календаря, занятость там всё равно учитывается", () => {
  const days = calendarDays({
    from: "2026-09-10",
    count: 2,
    termDays: 5,
    busy: [{ startDate: "2026-09-14", endDate: "2026-09-14" }],
  });
  assert.equal(days[0]?.canStart, false, "10-14 задевает 14-е");
  assert.equal(days[1]?.canStart, false, "11-15 тоже");
});

test("попадание дня в отрезок - для подсветки выбранного срока", () => {
  assert.ok(isWithin("2026-09-12", "2026-09-10", "2026-09-16"));
  assert.ok(isWithin("2026-09-10", "2026-09-10", "2026-09-16"), "первый день входит");
  assert.ok(isWithin("2026-09-16", "2026-09-10", "2026-09-16"), "последний входит");
  assert.equal(isWithin("2026-09-17", "2026-09-10", "2026-09-16"), false);
});

test("число дней в календаре и срок - целые положительные", () => {
  assert.throws(() => calendarDays({ from: "2026-09-10", count: 0, termDays: 1, busy: [] }));
  assert.throws(() => calendarDays({ from: "2026-09-10", count: 5, termDays: 0, busy: [] }));
  assert.throws(() => endDate("2026-09-10", 0));
});

test("дата должна быть днём в формате YYYY-MM-DD", () => {
  assert.throws(() => endDate("10.09.2026", 3));
  assert.throws(() => calendarDays({ from: "сегодня", count: 3, termDays: 1, busy: [] }));
});
