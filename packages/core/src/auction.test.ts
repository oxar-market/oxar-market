import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  BRAND_MAX,
  EXTEND_MS,
  cleanBrand,
  closeDay,
  escrowedCents,
  hasOpened,
  isOpen,
  minBidCents,
  nextClose,
  validSaleWindow,
} from "./auction.ts";
import { EXTEND_SECONDS, MAX_SALE_SECONDS, MIN_STEP_CENTS, hasWinner, minNextUnits } from "./lot.ts";

const CLOSE = Date.parse("2026-10-01T18:00:00Z");

test("первая ставка равна резервной цене", () => {
  assert.equal(minBidCents(50_000, null), 50_000);
});

test("следующая ставка выше текущей на шаг", () => {
  assert.equal(minBidCents(50_000, 50_000), 52_500, "5% от 50000");
});

test("шаг не мельче доллара", () => {
  // 5% от $10 это 50 центов - мало, поднимаем до $1
  assert.equal(MIN_STEP_CENTS, 100);
  assert.equal(minBidCents(1_000, 1_000), 1_100);
});

test("шаг лота уважается: верх $10 при шаге $5 требует $15", () => {
  // Живой баг 25.09: экран считал с зашитым долларом и показывал «next $11»,
  // а программа с шагом лота $5 требовала $15.
  assert.equal(minBidCents(500, 1_000, 500), 1_500);
});

test("процент побеждает шаг лота на дорогих ставках", () => {
  // 5% от $200 это $10 - больше шага $5.
  assert.equal(minBidCents(500, 20_000, 500), 21_000);
});

test("первая ставка с шагом лота остаётся резервом", () => {
  assert.equal(minBidCents(500, null, 500), 500);
});

test("шаг округляется до целых центов", () => {
  assert.equal(minBidCents(3_333, 3_333), 3_500);
  assert.ok(Number.isInteger(minBidCents(3_333, 3_333)));
});

test("минимум ставки округляется вверх, как его примет программа", () => {
  // Пять процентов от $50.01 - это $2.5005. Программа требует $52.5105 в
  // базовых единицах, и $52.51, округлённые по-старому, она отклоняла.
  assert.equal(minBidCents(100, 5_001), 5_252);
});

test("минимум ставки в центах не ниже минимума программы ни на одной сумме", () => {
  for (let top = 100; top <= 20_000; top += 7) {
    for (const step of [100, 500]) {
      const program = minNextUnits({ reserve: 0n, minStep: BigInt(step) * 10_000n, topBid: BigInt(top) * 10_000n, hasBid: true });
      const cents = minBidCents(100, top, step);
      assert.ok(BigInt(cents) * 10_000n >= program, `верх ${top}, шаг ${step}`);
      assert.ok(BigInt(cents - 1) * 10_000n < program, `на цент меньше тоже прошло бы: верх ${top}`);
    }
  }
});

test("минимум следующей ставки в единицах - как в программе", () => {
  const lot = { reserve: 5_000_000n, minStep: 1_000_000n, topBid: 0n, hasBid: false };
  assert.equal(minNextUnits(lot), 5_000_000n, "без ставок - резерв");
  assert.equal(minNextUnits({ ...lot, topBid: 10_000_000n, hasBid: true }), 11_000_000n, "шаг лота больше пяти процентов");
  assert.equal(minNextUnits({ ...lot, topBid: 100_000_000n, hasBid: true }), 105_000_000n, "пять процентов больше шага");
  // Деление нацело, как в Rust: 5% от 33_333_333 - это 1_666_666.
  assert.equal(minNextUnits({ ...lot, minStep: 0n, topBid: 33_333_333n, hasBid: true }), 34_999_999n);
});

test("продано, если ставка есть и не ниже резерва", () => {
  assert.equal(hasWinner({ topBid: 0n, reserve: 0n, hasBid: false }), false, "без ставок не продано");
  assert.equal(hasWinner({ topBid: 4_999_999n, reserve: 5_000_000n, hasBid: true }), false);
  assert.equal(hasWinner({ topBid: 5_000_000n, reserve: 5_000_000n, hasBid: true }), true);
});

test("срок торга: позже открытия, не в прошлом, не дальше месяца от публикации", () => {
  const now = CLOSE - 60 * 60_000;
  const month = MAX_SALE_SECONDS * 1000;
  assert.equal(validSaleWindow(now, CLOSE, now), true);
  assert.equal(validSaleWindow(CLOSE, CLOSE, now), false, "закрытие в момент открытия");
  assert.equal(validSaleWindow(now - 1, now, now), false, "закрытие в эту секунду программа не примет");
  assert.equal(validSaleWindow(now, now + month, now), true, "ровно месяц можно");
  assert.equal(validSaleWindow(now, now + month + 1, now), false);
  // Открытие через десять дней, закрытие через тридцать пять: от открытия -
  // двадцать пять дней, но программа считает от публикации и откажет.
  const day = 86_400_000;
  assert.equal(validSaleWindow(now + 10 * day, now + 35 * day, now), false);
});

test("день закрытия - по UTC, одинаковый в любой зоне", () => {
  assert.equal(closeDay("2026-10-01T23:30:00-05:00"), "2026-10-02");
  assert.equal(closeDay(Date.parse("2026-10-01T18:00:00Z")), "2026-10-01");
});

test("ближайшее закрытие - самое раннее впереди, а все прошли - последнее", () => {
  assert.equal(nextClose([], CLOSE), null);
  assert.equal(nextClose([CLOSE + 2_000, CLOSE + 1_000, CLOSE - 1_000], CLOSE), CLOSE + 1_000);
  assert.equal(nextClose([CLOSE - 2_000, CLOSE - 1_000], CLOSE), CLOSE - 1_000);
  assert.equal(nextClose([CLOSE], CLOSE), CLOSE, "в момент закрытия - уже прошло");
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

test("продление ставкой под конец - пять минут, как в программе", () => {
  assert.equal(EXTEND_SECONDS, 300);
  assert.equal(EXTEND_MS, EXTEND_SECONDS * 1000);
});

test("в эскроу лежит сумма лидирующих ставок", () => {
  assert.equal(escrowedCents([50_000, 12_500]), 62_500);
});

test("место без ставок в сумму не входит", () => {
  assert.equal(escrowedCents([50_000, null]), 50_000);
  assert.equal(escrowedCents([null, null]), 0);
});

test("торга без мест в эскроу нет ничего", () => {
  assert.equal(escrowedCents([]), 0);
});

test("перебитые ставки складывать нечего: считаем по одной на место", () => {
  // Два места, на каждом торговались втроём. В хранилищах лежит по лидеру,
  // остальным деньги вернулись той же транзакцией, что их перебила.
  assert.equal(escrowedCents([30_000, 20_000]), 50_000);
});
