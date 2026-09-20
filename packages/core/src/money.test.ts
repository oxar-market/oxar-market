import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  FEE_BPS,
  FEE_RATE,
  USDC_DECIMALS,
  formatUsd,
  fromUsdcBaseUnits,
  parseUsd,
  splitPayout,
  toUsdcBaseUnits,
} from "./money.ts";

test("комиссия берётся с продавца, покупатель платит ровно свою ставку", () => {
  const split = splitPayout(50_000);
  assert.equal(split.grossCents, 50_000);
  assert.equal(split.feeCents, 5_000);
  assert.equal(split.netCents, 45_000);
});

test("комиссия и остаток всегда складываются в полную сумму", () => {
  // Округление комиссии не должно создавать и не должно терять центы.
  for (const gross of [1, 7, 99, 333, 1_001, 12_345, 999_999]) {
    const { feeCents, netCents } = splitPayout(gross);
    assert.equal(feeCents + netCents, gross, `не сошлось на ${gross}`);
  }
});

test("нулевая сделка не даёт комиссии", () => {
  assert.deepEqual(splitPayout(0), { grossCents: 0, feeCents: 0, netCents: 0 });
});

test("дробные и отрицательные центы отклоняются", () => {
  for (const bad of [1.5, -1, NaN, Infinity]) {
    assert.throws(() => splitPayout(bad), `должно быть отклонено: ${bad}`);
  }
});

test("комиссия в сотых долях процента совпадает с долей", () => {
  // Одно и то же число по обе стороны: здесь и в поле fee_bps у лота в
  // программе. Разойдутся - сумма на экране не сойдётся с цепочкой.
  assert.equal(FEE_BPS, 1_000);
  assert.equal(FEE_BPS / 10_000, FEE_RATE);
});

test("центы переводятся в базовые единицы USDC и обратно", () => {
  assert.equal(USDC_DECIMALS, 6);
  assert.equal(toUsdcBaseUnits(1), 10_000);
  assert.equal(toUsdcBaseUnits(50_000), 500_000_000);
  assert.equal(fromUsdcBaseUnits(500_000_000), 50_000);
});

test("перевод туда и обратно возвращает исходное", () => {
  for (const cents of [0, 1, 99, 100, 12_345]) {
    assert.equal(fromUsdcBaseUnits(toUsdcBaseUnits(cents)), cents);
  }
});

test("единицы, не складывающиеся в целый цент, отклоняются", () => {
  // Иначе половина цента молча потерялась бы при округлении.
  assert.throws(() => fromUsdcBaseUnits(5_000));
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
