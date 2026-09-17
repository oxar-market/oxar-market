import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  FEE_RATE,
  formatUsd,
  fromUsdcBaseUnits,
  settle,
  splitPayout,
  streamPlan,
  toUsdcBaseUnits,
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

test("центы переводятся в базовые единицы USDC и обратно", () => {
  // У USDC шесть знаков, значит один цент - это десять тысяч базовых единиц.
  assert.equal(toUsdcBaseUnits(1), 10_000);
  assert.equal(toUsdcBaseUnits(15_000), 150_000_000);
  assert.equal(fromUsdcBaseUnits(150_000_000), 15_000);
  assert.equal(fromUsdcBaseUnits(toUsdcBaseUnits(62_000)), 62_000);
});

test("базовые единицы не принимают дробь и минус", () => {
  assert.throws(() => toUsdcBaseUnits(1.5));
  assert.throws(() => toUsdcBaseUnits(-1));
  assert.throws(() => fromUsdcBaseUnits(10_001));
});

test("план стрима: вся сумма разложена без потерь", () => {
  const plan = streamPlan({
    priceCents: 15_000,
    startDate: "2026-11-03",
    endDate: "2026-11-09",
  });

  assert.equal(plan.days, 7, "даты включительно: с 3 по 9 - это семь дней");
  assert.equal(plan.period, 60);
  assert.equal(plan.periods, 7 * 24 * 60);
  assert.equal(plan.depositedBaseUnits, 150_000_000);
  // Главное свойство: разложение сходится копейка в копейку.
  assert.equal(
    plan.amountPerPeriod * plan.periods + plan.dustBaseUnits,
    plan.depositedBaseUnits,
  );
});

test("остаток меньше одной выплаты за период", () => {
  for (const cents of [1, 999, 15_000, 62_000, 123_457]) {
    const plan = streamPlan({
      priceCents: cents,
      startDate: "2026-11-03",
      endDate: "2026-11-09",
    });
    assert.ok(
      plan.dustBaseUnits < plan.periods,
      `остаток ${plan.dustBaseUnits} должен быть меньше числа периодов`,
    );
    assert.equal(
      plan.amountPerPeriod * plan.periods + plan.dustBaseUnits,
      toUsdcBaseUnits(cents),
    );
  }
});

test("бронь на один день - это один день, а не ноль", () => {
  const plan = streamPlan({
    priceCents: 1_000,
    startDate: "2026-11-03",
    endDate: "2026-11-03",
  });
  assert.equal(plan.days, 1);
  assert.equal(plan.periods, 24 * 60);
});

test("стрим начинается в полночь UTC дня начала", () => {
  const plan = streamPlan({
    priceCents: 1_000,
    startDate: "2026-11-03",
    endDate: "2026-11-09",
  });
  assert.equal(plan.startUnix, Date.UTC(2026, 10, 3) / 1000);
  assert.equal(plan.endUnix, plan.startUnix + plan.periods * plan.period);
});

test("бессмысленный срок и пустая сумма не проходят", () => {
  assert.throws(() =>
    streamPlan({ priceCents: 0, startDate: "2026-11-03", endDate: "2026-11-09" }),
  );
  assert.throws(() =>
    streamPlan({ priceCents: 100, startDate: "2026-11-09", endDate: "2026-11-03" }),
  );
});
