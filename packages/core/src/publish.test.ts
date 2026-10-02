import { test } from "node:test";
import assert from "node:assert/strict";
import { publishCost } from "./publish.ts";

// Ставка mainnet на 2 октября 2026 (SIMD-0437, шаг 2).
const RATE = 5080;

test("одно место: залог места возвращается, аккаунт торга и подпись - нет", () => {
  const cost = publishCost([1], RATE);
  // Лот 179 байт и хранилище 165 байт: (128 + байты) * ставка.
  assert.equal(cost.backLamports, (128 + 179) * RATE + (128 + 165) * RATE);
  // Торг 139 байт и одна транзакция.
  assert.equal(cost.keptLamports, (128 + 139) * RATE + 5000);
  assert.equal(cost.totalLamports, cost.backLamports + cost.keptLamports);
});

test("залог считается по ставке сети: снизилась ставка - снизился залог", () => {
  // Ставка падает по шагам SIMD-0437; число в коде устарело бы молча.
  const now = publishCost([1], 5080);
  const later = publishCost([1], 696);
  assert.equal(later.backLamports, (128 + 179) * 696 + (128 + 165) * 696);
  assert.ok(later.totalLamports < now.totalLamports);
  // Подпись от ставки хранения не зависит.
  assert.equal(later.keptLamports - (128 + 139) * 696, now.keptLamports - (128 + 139) * 5080);
});

test("три места с одним сроком - один торг и одна транзакция", () => {
  const one = publishCost([1], RATE);
  const three = publishCost([3], RATE);
  assert.equal(three.backLamports, one.backLamports * 3);
  assert.equal(three.keptLamports, one.keptLamports);
});

test("больше трёх мест в торге - ещё транзакция, торг один", () => {
  assert.equal(publishCost([4], RATE).keptLamports, publishCost([1], RATE).keptLamports + 5000);
});

test("разные сроки закрытия - отдельные торги, за каждый свой аккаунт", () => {
  assert.equal(publishCost([2, 1], RATE).keptLamports, publishCost([1], RATE).keptLamports * 2);
});
