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

// Сделка, на которой считается всё ниже. Числа настоящие: ровно этот стрим
// открывался на девнете, и контракт разложил его так же.
const PLAN = streamPlan({
  priceCents: 15_000,
  startDate: "2026-11-03",
  endDate: "2026-11-09",
});

test("сделка раскладывается на минутные доли без потерь", () => {
  assert.equal(PLAN.periods, 10_080, "семь суток по минуте");
  assert.equal(PLAN.amountPerPeriod, 14_880);
  assert.equal(PLAN.dustBaseUnits, 9_600);
  assert.equal(
    PLAN.amountPerPeriod * PLAN.periods + PLAN.dustBaseUnits,
    PLAN.depositedBaseUnits,
  );
});

test("до старта продавцу ничего, возвращается вся сумма", () => {
  const s = settle(PLAN, PLAN.startUnix - 1);
  assert.equal(s.earnedBaseUnits, 0);
  assert.equal(s.feeBaseUnits, 0);
  assert.equal(s.refundBaseUnits, PLAN.depositedBaseUnits);
});

test("через две с половиной минуты продавцу остаток и две целых доли", () => {
  // Именно это показал контракт на девнете: 9600 + 2 * 14880 = 39360.
  const s = settle(PLAN, PLAN.startUnix + 150);
  assert.equal(s.earnedBaseUnits, 39_360);
  assert.equal(s.refundBaseUnits, PLAN.depositedBaseUnits - 39_360);
});

test("неполная минута продавцу не засчитывается", () => {
  const almost = settle(PLAN, PLAN.startUnix + 119);
  const full = settle(PLAN, PLAN.startUnix + 120);
  assert.equal(almost.earnedBaseUnits, PLAN.dustBaseUnits + PLAN.amountPerPeriod);
  assert.equal(full.earnedBaseUnits, PLAN.dustBaseUnits + PLAN.amountPerPeriod * 2);
});

test("срок дошёл до конца — возврата нет", () => {
  const s = settle(PLAN, PLAN.endUnix);
  assert.equal(s.refundBaseUnits, 0);
  assert.equal(s.earnedBaseUnits, PLAN.depositedBaseUnits);
});

test("после конца срока больше полной суммы не начисляется", () => {
  const s = settle(PLAN, PLAN.endUnix + 86_400);
  assert.equal(s.refundBaseUnits, 0);
  assert.equal(s.earnedBaseUnits, PLAN.depositedBaseUnits);
});

test("комиссия берётся только с заработанного, и ничего не теряется", () => {
  for (const at of [0, 1, 60, 150, 4_000, 302_400, 999_999]) {
    const s = settle(PLAN, PLAN.startUnix + at);
    assert.equal(
      s.earnedBaseUnits + s.refundBaseUnits,
      s.grossBaseUnits,
      `сумма разошлась на ${at} с`,
    );
    assert.equal(
      s.feeBaseUnits + s.netBaseUnits,
      s.earnedBaseUnits,
      `выплата разошлась на ${at} с`,
    );
    assert.equal(s.feeBaseUnits, Math.round(s.earnedBaseUnits * FEE_RATE));
  }
});

test("дробные и отрицательные суммы не принимаются", () => {
  assert.throws(() => splitPayout(10.5));
  assert.throws(() => splitPayout(-1));
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
