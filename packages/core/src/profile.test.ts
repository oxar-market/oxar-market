import { test } from "node:test";
import assert from "node:assert/strict";
import { INVISIBLE, NAME_MAX, cleanProfile, passReach } from "./profile.ts";

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

test("имя не притворяется кошельком: ни адресом, ни коротким видом", () => {
  assert.equal(cleanProfile({ name: "7MvL..8LgV", brand: "", x: "" }).ok, false);
  assert.equal(cleanProfile({ name: "7MvL…8LgV", brand: "", x: "" }).ok, false);
  assert.equal(cleanProfile({ name: "7MvLvtgvPtTN4VgjCm1kmK6dkKDMPxq2u7q9pKfz8LgV", brand: "", x: "" }).ok, false);
});

test("невидимые знаки в имени и бренде не проходят", () => {
  assert.equal(cleanProfile({ name: "Ali​ce", brand: "", x: "" }).ok, false);
  assert.equal(cleanProfile({ name: "", brand: "Ac‮me", x: "" }).ok, false);
});

test("имя приводится к NFKC: широкие буквы - обычные", () => {
  assert.deepEqual(cleanProfile({ name: "Ａlice", brand: "", x: "" }), {
    ok: true,
    value: { display_name: "Alice", brand: null, x_handle: null },
  });
});

test("пустые знаки хангыля и Брайля и метки-теги - тоже невидимые", () => {
  assert.equal(cleanProfile({ name: "Aliceㅤ", brand: "", x: "" }).ok, false);
  assert.equal(cleanProfile({ name: "Alice⠀", brand: "", x: "" }).ok, false);
  assert.equal(cleanProfile({ name: "Alice\u{E0041}", brand: "", x: "" }).ok, false);
});

test("короткий кошелёк широкими знаками - всё равно кошелёк", () => {
  assert.equal(cleanProfile({ name: "７ＭｖＬ．．８ＬｇＶ", brand: "", x: "" }).ok, false);
});

test("база отбивает ровно те невидимые знаки, что и экран", async () => {
  // Класс знаков из правила экрана - диапазонами, как он записан в миграции.
  const hex = (c: number) => (c <= 0xffff ? `\\u${c.toString(16).toUpperCase().padStart(4, "0")}` : `\\U${c.toString(16).toUpperCase().padStart(8, "0")}`);
  const ranges: string[] = [];
  let start = -1;
  for (let c = 1; c <= 0x110000; c++) {
    const hit = c <= 0x10ffff && (c < 0xd800 || c > 0xdfff) && INVISIBLE.test(String.fromCodePoint(c));
    if (hit && start < 0) start = c;
    if (!hit && start >= 0) {
      ranges.push(start === c - 1 ? hex(start) : `${hex(start)}-${hex(c - 1)}`);
      start = -1;
    }
  }
  const { readFile } = await import("node:fs/promises");
  // [[:cntrl:]] в базе - сверх списка: что он ловит, зависит от локали базы,
  // и лишним он быть не может.
  const sql = await readFile(new URL("../../../supabase/migrations/20261116040000_profile_separators.sql", import.meta.url), "utf8");
  assert.ok(sql.includes(`display_name !~ '[[:cntrl:]${ranges.join("")}]'`), "класс имени в базе разошёлся с экраном");
  assert.ok(sql.includes(`brand !~ '[[:cntrl:]${ranges.join("")}]'`), "класс бренда в базе разошёлся с экраном");
});

test("разделитель строки в имени становится пробелом, в бренде - не проходит", () => {
  // В базу уходит уже чистое имя: разделитель там запрещён, а пробел - нет.
  assert.deepEqual(cleanProfile({ name: "Ali\u2028ce", brand: "", x: "" }), {
    ok: true,
    value: { display_name: "Ali ce", brand: null, x_handle: null },
  });
  assert.equal(cleanProfile({ name: "", brand: "Ac\u2029me", x: "" }).ok, false);
});
