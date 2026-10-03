import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  USDC_DECIMALS,
  centsToUnits,
  formatSol,
  formatUsd,
  parseUsd,
  payoutSplit,
  percentToBps,
  unitsToCents,
} from "./money.ts";

test("центы переводятся в базовые единицы USDC и обратно", () => {
  assert.equal(USDC_DECIMALS, 6);
  assert.equal(centsToUnits(1), 10_000n);
  assert.equal(centsToUnits(50_000), 500_000_000n);
  assert.equal(unitsToCents(500_000_000n), 50_000);
  for (const cents of [0, 1, 99, 100, 12_345]) {
    assert.equal(unitsToCents(centsToUnits(cents)), cents);
  }
});

test("у тестовой монеты свои знаки", () => {
  assert.equal(centsToUnits(150, 9), 1_500_000_000n);
  assert.equal(unitsToCents(1_500_000_000n, "floor", 9), 150);
});

test("остаток меньше цента: баланс - вниз, минимум ставки - вверх", () => {
  assert.equal(unitsToCents(52_510_500n), 5_251, "на кошельке точно есть $52.51");
  assert.equal(unitsToCents(52_510_500n, "ceil"), 5_252, "меньше $52.52 программа не примет");
  assert.equal(unitsToCents(52_510_000n, "ceil"), 5_251, "ровный цент не округляется");
});

test("дробные и отрицательные суммы отклоняются", () => {
  for (const bad of [1.5, -1, NaN, Infinity]) {
    assert.throws(() => centsToUnits(bad), `должно быть отклонено: ${bad}`);
  }
  assert.throws(() => unitsToCents(-1n));
});

test("выплата делится как в программе: комиссия вниз, остаток продавцу", () => {
  assert.deepEqual(payoutSplit(500_000_000n, 1_000), { fee: 50_000_000n, toSeller: 450_000_000n });
  assert.deepEqual(payoutSplit(999n, 1_000), { fee: 99n, toSeller: 900n });
  for (const winning of [0n, 1n, 7n, 333n, 12_345_678n]) {
    const { fee, toSeller } = payoutSplit(winning, 1_000);
    assert.equal(fee + toSeller, winning, `не сошлось на ${winning}`);
  }
  assert.throws(() => payoutSplit(1n, 10_001));
});

test("SOL показываются с четырьмя знаками", () => {
  assert.equal(formatSol(3_123_456n), "0.0031 SOL");
  assert.equal(formatSol(1_000_000_000), "1.0000 SOL");
  assert.equal(formatSol(1_500_000_000n, 1), "1.5 SOL");
});

test("проценты из поля - в сотые доли процента", () => {
  assert.equal(percentToBps("50"), 5_000);
  assert.equal(percentToBps(" 33.33 "), 3_333);
  assert.equal(percentToBps("0"), 0);
  assert.equal(percentToBps("100"), 10_000);
  for (const bad of ["", " ", "abc", "-1", "100.01", "Infinity"]) {
    assert.equal(percentToBps(bad), null, `«${bad}» должно отклоняться`);
  }
});

test("суммы показываются без лишних нулей, но с центами, если они есть", () => {
  assert.equal(formatUsd(50_000), "$500");
  assert.equal(formatUsd(50_050), "$500.50");
  assert.equal(formatUsd(1), "$0.01");
  assert.equal(formatUsd(0), "$0");
});

test("большие суммы разделяются запятыми", () => {
  assert.equal(formatUsd(1_234_567), "$12,345.67");
});

test("поле ставки разбирается в целые центы", () => {
  assert.equal(parseUsd("12"), 1200);
  assert.equal(parseUsd("12.5"), 1250);
  assert.equal(parseUsd("12.50"), 1250);
  assert.equal(parseUsd("0.01"), 1);
  assert.equal(parseUsd(" 40 "), 4000);
});

test("запятая и точка равноправны", () => {
  assert.equal(parseUsd("12,50"), parseUsd("12.50"));
});

test("центы не уезжают на двоичной дроби", () => {
  // 12.10 * 100 в плавающей точке даёт 1209.9999999999998, и наивное
  // округление вниз стоило бы ставящему цент.
  assert.equal(parseUsd("12.10"), 1210);
  assert.equal(parseUsd("0.29"), 29);
  assert.equal(parseUsd("1.15"), 115);
});

test("не-число - это отказ, а не ноль", () => {
  // Ноль был бы хуже всего: поле пустое, а ставка ушла бы как нулевая.
  for (const bad of ["", " ", "abc", "-5", "1.2.3", "$5", "1e3", "."]) {
    assert.equal(parseUsd(bad), null, `«${bad}» должно отклоняться`);
  }
});

test("третий знак после запятой отклоняется, а не округляется молча", () => {
  // Человек видел бы одну сумму, а поставил другую.
  assert.equal(parseUsd("12.505"), null);
});
