import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SPOTS } from "./spots.ts";

/**
 * Разметка живёт в двух местах, и по-другому не выходит: геометрия привязана к
 * модели и лежит в коде, а каталог мест нужен базе, чтобы лот мог сослаться на
 * место. Разъедутся - место без пары просто не найдётся на вещи, и это ничем
 * не крикнет: экран покажет футболку без одного пятна.
 *
 * Поэтому пара проверяется здесь: коды, подписи и порядок.
 */

const sql = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260920170000_tee_grid.sql",
    import.meta.url,
  ),
  "utf8",
);

/** Строки каталога из миграции: ('код', 'подпись', порядок). */
const catalog = [...sql.matchAll(/\(\s*'(slot_\w+)',\s*'([^']+)',\s*(\d+)\s*\)/g)].map(
  (row) => ({ code: row[1], label: row[2], sort: Number(row[3]) }),
);

// Каталог шире разметки, и это не рассинхрон, а история: на местах, которых
// на вещи больше нет, висят старые торги, и внешний ключ не даст их удалить.
// Продаётся только то, что размечено, - лот на месте вне разметки на экран
// просто не попадёт.

test("каждое место разметки есть в каталоге базы", () => {
  const known = new Map(catalog.map((spot) => [spot.code, spot]));
  for (const spot of SPOTS) {
    assert.ok(known.has(spot.code), `места ${spot.code} нет в каталоге`);
  }
});

test("подписи мест совпадают: человек видит одно имя в обоих местах", () => {
  const known = new Map(catalog.map((spot) => [spot.code, spot]));
  for (const spot of SPOTS) {
    assert.equal(known.get(spot.code)!.label, spot.label);
  }
});

test("разметка идёт в порядке каталога, без перестановок", () => {
  // Сам каталог шире и своего порядка не меняет; здесь важно, что разметка
  // не тасует места - иначе «третье» на экране оказалось бы не третьим в
  // списке торга.
  const sorts = SPOTS.map(
    (spot) => catalog.find((one) => one.code === spot.code)!.sort,
  );
  assert.deepEqual([...sorts].sort((a, b) => a - b), sorts);
});

test("каждое место стоит на вещи, а не в воздухе", () => {
  for (const spot of SPOTS) {
    // Ниже 0.34 ткань уходит раструбом и рамка встаёт косо, выше 0.9 - ворот.
    assert.ok(
      spot.height > 0.34 && spot.height < 0.9,
      `${spot.code}: высота ${spot.height} вне ткани`,
    );
    assert.ok(
      spot.size[0] > 0 && spot.size[1] > 0,
      `${spot.code}: размер места должен быть положительным`,
    );
  }
});
