import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  FEE_RATE,
  formatUsd,
  parseBudgetCents,
  settle,
  splitPayout,
} from "./money.ts";

test("комиссия 10% с продавца, покупатель платит ровно цену", () => {
  const split = splitPayout(10_000);
  assert.equal(split.grossCents, 10_000);
  assert.equal(split.feeCents, 1_000);
  assert.equal(split.netCents, 9_000);
  assert.equal(split.feeCents + split.netCents, split.grossCents);
});

test("комиссия не теряет и не создаёт центы на некруглых суммах", () => {
  for (const gross of [1, 7, 99, 333, 1_234, 99_999]) {
    const { feeCents, netCents } = splitPayout(gross);
    assert.equal(feeCents + netCents, gross, `сумма разошлась на ${gross}`);
  }
  assert.equal(FEE_RATE, 0.1);
});

test("размещение отстояло весь срок — возврата нет", () => {
  const s = settle(10_000, 7, 7);
  assert.equal(s.refundCents, 0);
  assert.equal(s.netCents, 9_000);
});

test("сняли на третий день из пяти — платим за три, остальное возвращаем", () => {
  const s = settle(10_000, 5, 3);
  assert.equal(s.refundCents, 4_000);
  assert.equal(s.feeCents, 600, "комиссия берётся только с заработанного");
  assert.equal(s.netCents, 5_400);
  assert.equal(s.netCents + s.feeCents + s.refundCents, s.grossCents);
});

test("сняли сразу — продавец не получает ничего, комиссии нет", () => {
  const s = settle(10_000, 7, 0);
  assert.equal(s.netCents, 0);
  assert.equal(s.feeCents, 0);
  assert.equal(s.refundCents, 10_000);
});

test("простояло дольше срока — считаем как полный срок, не больше", () => {
  const s = settle(10_000, 7, 30);
  assert.equal(s.refundCents, 0);
  assert.equal(s.netCents, 9_000);
});

test("дробные и отрицательные суммы не принимаются", () => {
  assert.throws(() => splitPayout(10.5));
  assert.throws(() => splitPayout(-1));
  assert.throws(() => settle(10_000, 0, 0));
  assert.throws(() => settle(10_000, 7, -1));
});

test("формат денег без лишних нулей", () => {
  assert.equal(formatUsd(10_000), "$100");
  assert.equal(formatUsd(10_050), "$100.50");
  assert.equal(formatUsd(0), "$0");
});

test("бюджет из того, что набрали руками", () => {
  assert.equal(parseBudgetCents("2000"), 200_000);
  assert.equal(parseBudgetCents("$2,000"), 200_000);
  assert.equal(parseBudgetCents(" 2k "), 200_000);
  assert.equal(parseBudgetCents("2.5k"), 250_000);
  assert.equal(parseBudgetCents("1500.50"), 150_050);
});

test("центы получаются целыми даже из дробных долларов", () => {
  // 0.1 + 0.2 в долларах даёт 0.30000000000000004, в центах - ровно 30.
  assert.equal(parseBudgetCents("0.105"), 11);
  assert.equal(Number.isInteger(parseBudgetCents("19.99")), true);
});

test("бюджет, которого не может быть, не принимаем", () => {
  assert.equal(parseBudgetCents(""), null);
  assert.equal(parseBudgetCents("free"), null);
  assert.equal(parseBudgetCents("-100"), null);
  assert.equal(parseBudgetCents("0"), null);
  assert.equal(parseBudgetCents("999999999"), null);
});
