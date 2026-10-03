import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APPEAL_SECONDS,
  ARBITER_SECONDS,
  TOTAL_EXTEND_SECONDS,
  appealOpen,
  arbiterSplit,
  disputeLapsed,
  minProofDeadline,
  pays,
  proofMissed,
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
