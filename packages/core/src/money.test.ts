import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  FEE_RATE,
  formatUsd,
  fromUsdcBaseUnits,
  settle,
  splitPayout,
  buyerMayClose,
  dealPlan,
  earnedAt,
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

// Сделка, на которой считается всё ниже: поток на семь суток.
const PLAN = dealPlan({
  priceCents: 15_000,
  startDate: "2026-11-03",
  endDate: "2026-11-09",
  shape: "stream",
});

test("поток: срок считается включительно и начинается в полночь UTC", () => {
  assert.equal(PLAN.days, 7, "с 3 по 9 - это семь дней");
  assert.equal(PLAN.startsAt, Date.UTC(2026, 10, 3) / 1000);
  assert.equal(PLAN.endsAt, PLAN.startsAt + 7 * 86_400);
  assert.equal(PLAN.amountBaseUnits, 150_000_000);
  assert.equal(PLAN.refundableUntil, PLAN.endsAt, "у потока отказ доступен весь срок");
});

test("до начала продавцу не натекает ничего", () => {
  const s = settle(PLAN, PLAN.startsAt - 1);
  assert.equal(s.earnedBaseUnits, 0);
  assert.equal(s.feeBaseUnits, 0);
  assert.equal(s.refundBaseUnits, PLAN.amountBaseUnits);
});

test("в момент старта ноль, а не весь срок", () => {
  assert.equal(settle(PLAN, PLAN.startsAt).earnedBaseUnits, 0);
});

test("на середине срока половина", () => {
  const half = PLAN.startsAt + (PLAN.endsAt - PLAN.startsAt) / 2;
  assert.equal(settle(PLAN, half).earnedBaseUnits, PLAN.amountBaseUnits / 2);
});

test("в конце срока вся сумма, остаток от деления не теряется", () => {
  const s = settle(PLAN, PLAN.endsAt);
  assert.equal(s.refundBaseUnits, 0);
  assert.equal(s.earnedBaseUnits, PLAN.amountBaseUnits);
});

test("после конца больше суммы не бывает", () => {
  const s = settle(PLAN, PLAN.endsAt + 86_400);
  assert.equal(s.refundBaseUnits, 0);
  assert.equal(s.earnedBaseUnits, PLAN.amountBaseUnits);
});

test("начисление не убывает и не превышает сделку", () => {
  let previous = 0;
  for (let at = -10; at < 7 * 86_400 + 10; at += 997) {
    const now = earnedAt(PLAN, PLAN.startsAt + at);
    assert.ok(now >= previous, `начисление убыло на секунде ${at}`);
    assert.ok(now <= PLAN.amountBaseUnits, `начислено больше сделки на ${at}`);
    previous = now;
  }
});

test("комиссия берётся только с заработанного и ничего не теряется", () => {
  for (const at of [0, 1, 60, 150, 4_000, 302_400, 999_999]) {
    const s = settle(PLAN, PLAN.startsAt + at);
    assert.equal(
      s.earnedBaseUnits + s.refundBaseUnits,
      s.grossBaseUnits,
      `сумма разошлась на ${at} с`,
    );
    assert.equal(s.feeBaseUnits + s.netBaseUnits, s.earnedBaseUnits);
    assert.equal(s.feeBaseUnits, Math.round(s.earnedBaseUnits * FEE_RATE));
  }
});

test("поток: покупатель волен отменить в любой момент", () => {
  for (const at of [-1, 0, 1, 302_400, 604_800, 999_999]) {
    assert.ok(buyerMayClose(PLAN, PLAN.startsAt + at), `отказ закрыт на ${at}`);
  }
});

// Заморозка: футболка, чемодан, сингапурский случай.
const HOLD = dealPlan({
  priceCents: 15_000,
  startDate: "2026-11-03",
  endDate: "2026-11-09",
  shape: "hold",
});

test("заморозка: до конца срока не натекает никому", () => {
  assert.equal(HOLD.startsAt, HOLD.endsAt, "заморозка - это нулевой срок в конце");
  assert.equal(earnedAt(HOLD, HOLD.endsAt - 1), 0, "продавцу натекло раньше срока");
  assert.equal(earnedAt(HOLD, HOLD.endsAt), HOLD.amountBaseUnits);
});

test("заморозка: окно отказа кончается, когда размещение должно было встать", () => {
  const placementStart = Date.UTC(2026, 10, 3) / 1000;
  assert.equal(HOLD.refundableUntil, placementStart);
  assert.ok(buyerMayClose(HOLD, placementStart - 1), "до начала отказ должен быть свободен");
  assert.ok(!buyerMayClose(HOLD, placementStart), "отказ прошёл в момент начала расходов");
  assert.ok(!buyerMayClose(HOLD, HOLD.endsAt - 1), "покупатель достал деньги из заморозки");
  assert.ok(buyerMayClose(HOLD, HOLD.endsAt), "после конца закрыть нельзя");
});

test("окно отказа не может пережить сделку", () => {
  assert.throws(() =>
    dealPlan({
      priceCents: 100,
      startDate: "2026-11-03",
      endDate: "2026-11-09",
      shape: "stream",
      refundableUntil: Date.UTC(2026, 10, 11) / 1000,
    }),
  );
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

test("бронь на один день - это один день, а не ноль", () => {
  const plan = dealPlan({
    priceCents: 1_000,
    startDate: "2026-11-03",
    endDate: "2026-11-03",
    shape: "stream",
  });
  assert.equal(plan.days, 1);
  assert.equal(plan.endsAt - plan.startsAt, 86_400);
});

test("бессмысленный срок и пустая сумма не проходят", () => {
  assert.throws(() =>
    dealPlan({ priceCents: 0, startDate: "2026-11-03", endDate: "2026-11-09", shape: "stream" }),
  );
  assert.throws(() =>
    dealPlan({ priceCents: 100, startDate: "2026-11-09", endDate: "2026-11-03", shape: "stream" }),
  );
});
