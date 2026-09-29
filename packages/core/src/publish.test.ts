import { test } from "node:test";
import assert from "node:assert/strict";
import { publishCost } from "./publish.ts";

test("одно место: залог места возвращается, аккаунт торга и подпись - нет", () => {
  const cost = publishCost([1]);
  // Лот 179 байт и хранилище 165 байт: (128 + байты) * 6960 лампортов.
  assert.equal(cost.backLamports, (128 + 179) * 6960 + (128 + 165) * 6960);
  // Торг 139 байт и одна транзакция.
  assert.equal(cost.keptLamports, (128 + 139) * 6960 + 5000);
  assert.equal(cost.totalLamports, cost.backLamports + cost.keptLamports);
});

test("три места с одним сроком - один торг и одна транзакция", () => {
  const one = publishCost([1]);
  const three = publishCost([3]);
  assert.equal(three.backLamports, one.backLamports * 3);
  assert.equal(three.keptLamports, one.keptLamports);
});

test("больше трёх мест в торге - ещё транзакция, торг один", () => {
  assert.equal(publishCost([4]).keptLamports, publishCost([1]).keptLamports + 5000);
});

test("разные сроки закрытия - отдельные торги, за каждый свой аккаунт", () => {
  assert.equal(publishCost([2, 1]).keptLamports, publishCost([1]).keptLamports * 2);
});
