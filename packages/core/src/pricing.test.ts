import { strict as assert } from "node:assert";
import { test } from "node:test";
import { minDaysFor, orderTotalCents, type Listing } from "./pricing.ts";

const week: Listing = { pricing: "term", priceCents: 50_000, termDays: 7 };
const daily: Listing = { pricing: "daily", priceCents: 4_000, termDays: 3 };

test("пакет стоит свою цену, сколько бы дней ни спросили", () => {
  assert.equal(orderTotalCents(week, 7), 50_000);
});

test("пакет продаётся только целиком: другой срок — ошибка", () => {
  assert.throws(() => orderTotalCents(week, 6));
  assert.throws(() => orderTotalCents(week, 8));
});

test("цена за день умножается на дни", () => {
  assert.equal(orderTotalCents(daily, 3), 12_000);
  assert.equal(orderTotalCents(daily, 10), 40_000);
});

test("меньше минимального срока продавец не пускает", () => {
  assert.throws(() => orderTotalCents(daily, 2));
  assert.equal(orderTotalCents(daily, 3), 12_000, "ровно минимум — можно");
});

test("дни — целое положительное число", () => {
  for (const days of [0, -1, 2.5, Number.NaN]) {
    assert.throws(() => orderTotalCents(daily, days), `прошло ${days}`);
  }
});

test("срок заказа: у пакета фиксирован, у ставки за день — минимум", () => {
  assert.equal(minDaysFor(week), 7);
  assert.equal(minDaysFor(daily), 3);
});

test("цена за день не теряет центы на нечётных ставках", () => {
  const odd: Listing = { pricing: "daily", priceCents: 333, termDays: 1 };
  assert.equal(orderTotalCents(odd, 3), 999);
});
