import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEAL_SECONDS,
  ARBITER_SECONDS,
  MAX_PROOF_MOVE_SECONDS,
  PROOF_DAY_END,
  TOTAL_EXTEND_SECONDS,
  appealOpen,
  arbiterSplit,
  disputeLapsed,
  earliestProofDay,
  hasBuyerProtection,
  minProofDeadline,
  movesProof,
  pays,
  proofMissed,
  settledOutcome,
  spotStage,
  takesProof,
  type ProofSale,
} from "./proof.ts";

// Те же случаи, что в юнит-тестах программы (chain/programs/oxar-escrow/src/state):
// правило одно, и если они разойдутся, кнопка в приложении будет врать о том,
// что примет контракт.
const sale = (over: Partial<ProofSale> = {}): ProofSale => ({
  closesAt: 100,
  proofDeadline: 1_100,
  provedAt: 0,
  ...over,
});

test("срок пруфа - позже жёсткого конца: закрытие плюс час продления", () => {
  assert.equal(minProofDeadline(1_000), 1_000 + TOTAL_EXTEND_SECONDS + 1);
});

test("пруф принимается только между закрытием и сроком, один раз", () => {
  assert.equal(takesProof(sale(), 99), false, "пока идёт торг, печатать ещё нечего");
  assert.equal(takesProof(sale(), 100), true);
  assert.equal(takesProof(sale(), 1_100), true, "в саму секунду срока ещё можно");
  assert.equal(takesProof(sale(), 1_101), false, "после срока поздно");
  assert.equal(takesProof(sale({ provedAt: 500 }), 600), false, "пруф присылают один раз");
});

test("нет пруфа к сроку - возврат победителю", () => {
  assert.equal(proofMissed(sale(), 1_100), false);
  assert.equal(proofMissed(sale(), 1_101), true);
  assert.equal(proofMissed(sale({ provedAt: 500 }), 5_000), false);
});

test("оспорить можно семьдесят два часа после пруфа", () => {
  assert.equal(appealOpen(sale(), 200), false, "без пруфа оспаривать нечего");
  const proved = sale({ provedAt: 500 });
  assert.equal(appealOpen(proved, 500 + APPEAL_SECONDS - 1), true);
  assert.equal(appealOpen(proved, 500 + APPEAL_SECONDS), false);
});

test("выплата: до конца окна - только по слову победителя, после - любому", () => {
  assert.equal(pays(sale(), 5_000, true), false, "без пруфа не платим");
  const proved = sale({ provedAt: 500 });
  assert.equal(pays(proved, 500 + APPEAL_SECONDS - 1, false), false);
  assert.equal(pays(proved, 500 + APPEAL_SECONDS - 1, true), true);
  assert.equal(pays(proved, 500 + APPEAL_SECONDS, false), true);
});

test("спор и выплата посторонним не пересекаются ни в одну секунду", () => {
  const proved = sale({ provedAt: 500 });
  for (let now = 500; now < 500 + APPEAL_SECONDS + 10; now += 1) {
    assert.ok(!(appealOpen(proved, now) && pays(proved, now, false)), `секунда ${now}`);
  }
});

test("торг до защиты покупателя платит по старым правилам", () => {
  const legacy = sale({ proofDeadline: 0 });
  assert.equal(pays(legacy, 100, false), true);
  assert.equal(proofMissed(legacy, 10_000_000), false);
  assert.equal(appealOpen(legacy, 150), false);
  assert.equal(takesProof(legacy, 150), false);
});

test("арбитр молчит тридцать дней - место закрывается в пользу победителя", () => {
  assert.equal(disputeLapsed({ disputed: false, disputedAt: 0 }, 10_000_000), false);
  const lot = { disputed: true, disputedAt: 500 };
  assert.equal(disputeLapsed(lot, 500 + ARBITER_SECONDS - 1), false);
  assert.equal(disputeLapsed(lot, 500 + ARBITER_SECONDS), true);
});

test("стадия выигранного места - то, что увидят продавец и победитель", () => {
  const spot = { disputed: false, disputedAt: 0 };
  assert.equal(spotStage(sale(), spot, 50), "bidding");
  assert.equal(spotStage(sale(), spot, 500), "awaiting_proof");
  assert.equal(spotStage(sale(), spot, 1_101), "proof_missed");
  assert.equal(spotStage(sale({ provedAt: 500 }), spot, 600), "appeal");
  assert.equal(spotStage(sale({ provedAt: 500 }), spot, 500 + APPEAL_SECONDS), "payable");
  assert.equal(spotStage(sale({ provedAt: 500 }), { disputed: true, disputedAt: 600 }, 700), "disputed");
  assert.equal(
    spotStage(sale({ provedAt: 500 }), { disputed: true, disputedAt: 600 }, 600 + ARBITER_SECONDS),
    "dispute_lapsed",
  );
  assert.equal(spotStage(sale({ proofDeadline: 0 }), spot, 500), "payable", "старый торг платит сразу");
});

test("арбитр делит ставку: комиссия только с доли продавца, ничего не теряется", () => {
  assert.deepEqual(arbiterSplit(1_000n, 5_000, 1_000), { toSeller: 450n, fee: 50n, toWinner: 500n });
  assert.deepEqual(arbiterSplit(1_000n, 0, 1_000), { toSeller: 0n, fee: 0n, toWinner: 1_000n });
  assert.deepEqual(arbiterSplit(1_000n, 10_000, 1_000), { toSeller: 900n, fee: 100n, toWinner: 0n });
  const odd = arbiterSplit(999n, 3_333, 1_000);
  assert.equal(odd.toSeller + odd.fee + odd.toWinner, 999n);
  assert.throws(() => arbiterSplit(1_000n, 10_001, 1_000));
});

test("защита покупателя - у торгов со сроком пруфа", () => {
  assert.equal(hasBuyerProtection(sale()), true);
  assert.equal(hasBuyerProtection(sale({ proofDeadline: 0 })), false);
});

test("арбитр двигает срок пруфа только позже и не дальше девяноста дней", () => {
  assert.equal(MAX_PROOF_MOVE_SECONDS, 90 * 24 * 60 * 60);
  const moved = { ...sale(), firstProofDeadline: 1_100 };
  const limit = 1_100 + MAX_PROOF_MOVE_SECONDS;
  assert.equal(movesProof(moved, 500, 2_000), true);
  assert.equal(movesProof(moved, 500, limit), true, "ровно девяносто дней можно");
  assert.equal(movesProof(moved, 500, limit + 1), false);
  assert.equal(movesProof(moved, 500, 1_100), false, "не раньше и не на тот же срок");
  assert.equal(movesProof(moved, 1_101, 2_000), false, "срок уже вышел");
  assert.equal(movesProof({ ...moved, provedAt: 600 }, 700, 2_000), false, "пруф уже есть");
  assert.equal(movesProof({ ...moved, proofDeadline: 0 }, 500, 2_000), false, "старый торг");
  // Второй перенос считается от первого срока, а не от текущего.
  const twice = { ...moved, proofDeadline: limit - 10 };
  assert.equal(movesProof(twice, 500, limit + 5), false);
});

test("чем кончилось место: решение арбитра важнее отметки расчёта", () => {
  assert.equal(settledOutcome({ sellerBps: null, proved: true, refunded: false }), "paid");
  assert.equal(settledOutcome({ sellerBps: null, proved: true, refunded: true }), "refunded", "арбитр молчал");
  assert.equal(
    settledOutcome({ sellerBps: null, proved: false, refunded: false }),
    "refunded",
    "без пруфа - только назад, даже если расчёт ещё не отметил",
  );
  assert.equal(settledOutcome({ sellerBps: 10_000, proved: true, refunded: false }), "paid");
  assert.equal(settledOutcome({ sellerBps: 0, proved: true, refunded: false }), "refunded");
  assert.equal(settledOutcome({ sellerBps: 5_000, proved: true, refunded: false }), "split");
});

test("день пруфа - не раньше, чем примет программа: закрытие плюс час", () => {
  // Торг 3 октября: закрылся в 22:50 - час продления кончается в 23:50, день
  // пруфа может быть тем же.
  assert.equal(earliestProofDay("2026-10-03T22:50", ""), "2026-10-03");
  assert.equal(earliestProofDay("2026-10-03T22:58", ""), "2026-10-03");
  // В 22:59 конец дня (23:59) уже на секунду раньше минимума программы.
  assert.equal(earliestProofDay("2026-10-03T22:59", ""), "2026-10-04");
  assert.equal(earliestProofDay("2026-10-03T23:30", ""), "2026-10-04");
  assert.equal(earliestProofDay("2026-10-31T23:30", ""), "2026-11-01", "через границу месяца");
});

test("день пруфа - не раньше последнего дня, когда вещь носят", () => {
  // Пруф - вещь в деле с логотипами: до дня, когда её надели, его нет.
  assert.equal(earliestProofDay("2026-10-03T22:50", "2026-10-06"), "2026-10-06");
  assert.equal(earliestProofDay("2026-10-03T22:59", "2026-10-04"), "2026-10-04");
  // День носки раньше закрытия правит закрытие.
  assert.equal(earliestProofDay("2026-10-10T12:00", "2026-10-06"), "2026-10-10");
});

test("конец самого раннего дня программа принимает, конец предыдущего - нет", () => {
  for (const closes of ["2026-10-03T00:00", "2026-10-03T12:00", "2026-10-03T22:58", "2026-10-03T22:59", "2026-10-03T23:59"]) {
    const min = minProofDeadline(Date.parse(`${closes}Z`) / 1000);
    const day = earliestProofDay(closes, "");
    const end = (one: string) => Date.parse(`${one}T${PROOF_DAY_END}Z`) / 1000;
    assert.ok(end(day) >= min, closes);
    const before = new Date(Date.parse(`${day}T12:00Z`) - 86_400_000).toISOString().slice(0, 10);
    assert.ok(end(before) < min, closes);
  }
});
