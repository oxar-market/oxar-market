import { strict as assert } from "node:assert";
import { test } from "node:test";
import { estimate } from "./estimate.ts";

test("вилка, а не одно число, и она не вывернута", () => {
  const e = estimate(10_000);
  assert.ok(e.monthlyLow < e.monthlyHigh);
  assert.ok(e.monthlyLow > 0);
});

test("оценка растёт вместе с аудиторией", () => {
  const small = estimate(3_000);
  const big = estimate(50_000);
  assert.ok(big.monthlyHigh > small.monthlyHigh);
});

test("оценка остаётся скромной: не обещаем больше цены поста у KOL", () => {
  // Пост у аккаунта на 10 тыс. подписчиков стоит порядка сотни долларов.
  // Верхняя граница месячной оценки не должна выглядеть как обещание тысяч.
  const e = estimate(10_000);
  assert.ok(e.monthlyHigh < 1_000, `слишком оптимистично: ${e.monthlyHigh}`);
});

test("места перечислены со сроком и ценой за срок", () => {
  const e = estimate(10_000);
  assert.equal(e.perPlacement.length, 3);
  for (const p of e.perPlacement) {
    assert.ok(p.days > 0);
    assert.ok(p.pricePerTerm > 0);
    assert.ok(p.label.length > 0);
  }
});
