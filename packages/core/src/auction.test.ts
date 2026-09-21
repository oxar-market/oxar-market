import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  BID_STEP_RATE,
  BRAND_MAX,
  EXTEND_MS,
  cleanBrand,
  closesAfterBid,
  hasOpened,
  isOpen,
  minBidCents,
  winner,
  type Bid,
} from "./auction.ts";

const CLOSE = Date.parse("2026-10-01T18:00:00Z");

test("первая ставка равна резервной цене", () => {
  assert.equal(minBidCents(50_000, null), 50_000);
});

test("следующая ставка выше текущей на шаг", () => {
  assert.equal(minBidCents(50_000, 50_000), 52_500, "5% от 50000");
  assert.equal(BID_STEP_RATE, 0.05);
});

test("шаг не мельче доллара", () => {
  // 5% от $10 это 50 центов - мало, поднимаем до $1
  assert.equal(minBidCents(1_000, 1_000), 1_100);
});

test("шаг округляется до целых центов", () => {
  assert.equal(minBidCents(3_333, 3_333), 3_500);
  assert.ok(Number.isInteger(minBidCents(3_333, 3_333)));
});

test("аукцион открыт до времени закрытия включительно", () => {
  assert.equal(isOpen(CLOSE, CLOSE - 1), true);
  assert.equal(isOpen(CLOSE, CLOSE), false, "в момент закрытия уже закрыт");
  assert.equal(isOpen(CLOSE, CLOSE + 1), false);
});

test("имя стартапа подрезается и склеивается", () => {
  assert.equal(cleanBrand("  Delora  "), "Delora");
  assert.equal(cleanBrand("Solana\tFoundation"), "Solana Foundation");
  assert.equal(cleanBrand("Jupiter   Exchange"), "Jupiter Exchange");
});

test("пустое имя стартапа не имя", () => {
  assert.equal(cleanBrand(""), null);
  assert.equal(cleanBrand("   "), null);
});

test("имя стартапа длиннее сорока знаков не берём", () => {
  assert.equal(cleanBrand("x".repeat(BRAND_MAX)), "x".repeat(BRAND_MAX));
  assert.equal(cleanBrand("x".repeat(BRAND_MAX + 1)), null);
});

test("торг начинается в назначенный момент, а не секундой позже", () => {
  const start = Date.parse("2026-09-21T18:00:00Z");
  assert.equal(hasOpened(start, start - 1), false);
  assert.equal(hasOpened(start, start), true, "в назначенный момент уже начался");
  assert.equal(hasOpened(start, start + 1), true);
});

test("торг без назначенного начала начался давно", () => {
  assert.equal(hasOpened(null, 0), true);
});

test("ставка в последние пять минут продлевает приём", () => {
  const late = CLOSE - 60_000;
  assert.equal(closesAfterBid(CLOSE, late), late + EXTEND_MS);
  assert.equal(EXTEND_MS, 5 * 60_000);
});

test("ранняя ставка срок не двигает", () => {
  const early = CLOSE - 20 * 60_000;
  assert.equal(closesAfterBid(CLOSE, early), CLOSE);
});

test("продление считается от ставки, а не от прежнего срока", () => {
  // ставка за секунду до конца даёт ровно пять минут, а не пять минут от конца
  const last = CLOSE - 1_000;
  assert.equal(closesAfterBid(CLOSE, last), last + EXTEND_MS);
});

test("побеждает высшая ставка", () => {
  const win = winner(
    [bid("a", 60_000, CLOSE - 3_000), bid("b", 75_000, CLOSE - 2_000)],
    50_000,
  );
  assert.equal(win?.bidder, "b");
});

test("при равных суммах побеждает поставивший раньше", () => {
  const win = winner(
    [bid("late", 60_000, CLOSE - 1_000), bid("early", 60_000, CLOSE - 9_000)],
    50_000,
  );
  assert.equal(win?.bidder, "early");
});

test("без ставок победителя нет", () => {
  assert.equal(winner([], 50_000), null);
});

test("ставки ниже резерва не выигрывают - лот не продан", () => {
  assert.equal(winner([bid("a", 40_000, CLOSE - 1_000)], 50_000), null);
});

function bid(bidder: string, amountCents: number, at: number): Bid {
  return { bidder, amountCents, at };
}
