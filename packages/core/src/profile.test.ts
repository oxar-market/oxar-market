import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME_MAX, cleanProfile, passReach } from "./profile.ts";

test("профиль: пробелы по краям и внутри сжимаются, @ у X снимается", () => {
  assert.deepEqual(cleanProfile({ name: "  Danylo   L ", brand: " OXAR ", x: "@oxar_app" }), {
    ok: true,
    value: { display_name: "Danylo L", brand: "OXAR", x_handle: "oxar_app" },
  });
});

test("пустые поля - не ошибка, а «не указано»", () => {
  assert.deepEqual(cleanProfile({ name: " ", brand: "", x: "" }), {
    ok: true,
    value: { display_name: null, brand: null, x_handle: null },
  });
});

test("имя длиннее предела не проходит", () => {
  const result = cleanProfile({ name: "x".repeat(NAME_MAX + 1), brand: "", x: "" });
  assert.equal(result.ok, false);
});

test("X - только как у колонки в базе: латиница, цифры, подчёркивание, до 15", () => {
  assert.equal(cleanProfile({ name: "", brand: "", x: "bad handle" }).ok, false);
  assert.equal(cleanProfile({ name: "", brand: "", x: "a".repeat(16) }).ok, false);
});

test("бренд длиннее предела ставки не проходит", () => {
  assert.equal(cleanProfile({ name: "", brand: "b".repeat(41), x: "" }).ok, false);
});

test("охват пропуска - сумма по вещам, где стоял логотип, крупные первыми", () => {
  const pass = passReach(["tee", "van"], { van: { reach: 50000, checked: false }, tee: { reach: 6000, checked: true } });
  assert.equal(pass.total, 56000);
  assert.deepEqual(pass.lines.map((one) => one.thingId), ["van", "tee"]);
  // Хоть одна цифра - оценка, значит и вся сумма - оценка.
  assert.equal(pass.estimated, true);
});

test("вещь без охвата в сумму не идёт и строкой не показывается", () => {
  const pass = passReach(["van", "tie"], { van: { reach: 50000, checked: true }, tie: { reach: null, checked: false } });
  assert.equal(pass.total, 50000);
  assert.deepEqual(pass.lines.map((one) => one.thingId), ["van"]);
  assert.equal(pass.estimated, false);
});

test("одна вещь дважды - один раз в сумме", () => {
  assert.equal(passReach(["van", "van"], { van: { reach: 1000, checked: true } }).total, 1000);
});

test("ничего не выиграл - ноль и пусто", () => {
  assert.deepEqual(passReach([], {}), { total: 0, lines: [], estimated: false });
});
