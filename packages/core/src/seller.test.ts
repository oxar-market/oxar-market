import { test } from "node:test";
import assert from "node:assert/strict";
import { proofDue, rentDays, rentTotalCents, saleStage, thingState } from "./seller.ts";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const plain = { declined: false, preparing: false, rented: false, onMarket: true };
const lot = (status: string, closesAt: number, proofBy: number | null = null, proved = false) => ({
  status,
  closesAt,
  proofBy,
  proved,
});

test("отказ и подготовка важнее торгов", () => {
  const live = [lot("open", NOW + 1)];
  assert.equal(thingState({ ...plain, declined: true }, live, NOW), "declined");
  assert.equal(thingState({ ...plain, preparing: true }, live, NOW), "preparing");
});

test("открытый торг до срока - live", () => {
  assert.equal(thingState(plain, [lot("open", NOW + 1)], NOW), "live");
});

test("открытый торг после срока - уже не live, хоть расчёт его ещё не разобрал", () => {
  assert.equal(thingState(plain, [lot("open", NOW)], NOW), "ended");
  assert.equal(thingState(plain, [lot("open", NOW - 1)], NOW), "ended");
});

test("закрытые торги - ended, в том числе с вернувшейся ставкой", () => {
  for (const status of ["won", "unsold", "refunded"]) {
    assert.equal(thingState(plain, [lot(status, NOW - 1)], NOW), "ended", status);
  }
});

test("опубликован, но ещё не одобрен для маркета - на ревью, а не live", () => {
  const off = { ...plain, onMarket: false };
  assert.equal(thingState(off, [lot("open", NOW + 1)], NOW), "reviewing");
  // Закрылся, так и не попав на маркет, - уже не ревью.
  assert.equal(thingState(off, [lot("open", NOW - 1)], NOW), "ended");
  assert.equal(thingState({ ...off, declined: true }, [lot("open", NOW + 1)], NOW), "declined");
});

test("выигран с защитой покупателя и пруфа ещё нет - ждёт пруфа", () => {
  assert.equal(thingState(plain, [lot("won", NOW - 1, NOW + 1)], NOW), "proof");
  assert.equal(thingState(plain, [lot("won", NOW - 1, NOW)], NOW), "proof", "срок включительно, как в программе");
  assert.equal(thingState(plain, [lot("won", NOW - 1, NOW + 1, true)], NOW), "ended", "пруф уже есть");
  assert.equal(thingState(plain, [lot("won", NOW - 1, NOW - 1)], NOW), "ended", "срок вышел");
  assert.equal(thingState(plain, [lot("won", NOW - 1)], NOW), "ended", "старый торг без срока пруфа");
  // Вещь снова на торгах - важнее старого пруфа.
  assert.equal(thingState(plain, [lot("won", NOW - 1, NOW + 1), lot("open", NOW + 1)], NOW), "live");
});

test("срок пруфа к показу - ближайший из ещё не пройденных", () => {
  assert.equal(proofDue([lot("won", NOW - 1, NOW + 5), lot("won", NOW - 1, NOW + 3)], NOW), NOW + 3);
  assert.equal(proofDue([lot("won", NOW - 1, NOW + 5), lot("won", NOW - 1, NOW + 3, true)], NOW), NOW + 5);
  assert.equal(proofDue([lot("won", NOW - 1, NOW - 1), lot("unsold", NOW - 1, NOW + 3)], NOW), null);
  assert.equal(proofDue([lot("refunded", NOW - 1, NOW + 3), lot("open", NOW - 1, NOW + 3)], NOW), null);
  assert.equal(proofDue([], NOW), null);
});

test("без торгов - аренда или простой", () => {
  assert.equal(thingState({ ...plain, rented: true }, [], NOW), "rented");
  assert.equal(thingState(plain, [], NOW), "idle");
  assert.equal(thingState(plain, [lot("cancelled", NOW - 1)], NOW), "idle");
});

test("последний день аренды входит в срок", () => {
  assert.equal(rentDays("2026-10-01", "2026-10-14"), 14);
  assert.equal(rentDays("2026-10-01", "2026-10-01"), 1);
  assert.equal(rentTotalCents("2026-10-01", "2026-10-14", 500), 7_000);
});

// Шаг торга продавца во вкладке Sales: один шаг из пяти и одно действие.
const sale = {
  state: "ended" as const,
  drafts: false,
  wonSpots: 3,
  lockup: true,
  proved: false,
  settled: false,
  refunded: false,
  downloaded: false,
};

test("подготовленный нами торг с черновиками - подписать, это шаг 1", () => {
  assert.deepEqual(saleStage({ ...sale, state: "idle", drafts: true, wonSpots: 0 }), {
    step: 1,
    status: "Ready to sign",
    action: "sign",
  });
});

test("до черновиков действия у продавца нет: ждёт нас", () => {
  assert.deepEqual(saleStage({ ...sale, state: "preparing", wonSpots: 0 }), { step: 1, status: "Setting up", action: null });
  assert.deepEqual(saleStage({ ...sale, state: "idle", wonSpots: 0 }), { step: 1, status: "Draft", action: null });
  assert.deepEqual(saleStage({ ...sale, state: "declined", wonSpots: 0 }), { step: 1, status: "Not approved", action: null });
});

test("идущий торг - шаг 2, открыть его страницу", () => {
  assert.deepEqual(saleStage({ ...sale, state: "live", wonSpots: 0 }), { step: 2, status: "Live", action: "open" });
  assert.deepEqual(saleStage({ ...sale, state: "reviewing", wonSpots: 0 }), { step: 2, status: "In review", action: "open" });
});

test("закрылся без победителей - дальше шага 2 не идёт", () => {
  assert.deepEqual(saleStage({ ...sale, wonSpots: 0 }), { step: 2, status: "No bids", action: null });
});

test("ждёт пруфа, логотипы не скачаны - печать, скачать логотипы", () => {
  assert.deepEqual(saleStage({ ...sale, state: "proof" }), { step: 3, status: "Print logos", action: "download" });
});

test("ждёт пруфа, логотипы скачаны - пруф", () => {
  assert.deepEqual(saleStage({ ...sale, state: "proof", downloaded: true }), {
    step: 4,
    status: "Proof due",
    action: "proof",
  });
});

test("пруф прислан - ждём победителей; разобрано - выплачено", () => {
  assert.deepEqual(saleStage({ ...sale, proved: true }), { step: 4, status: "Proof sent", action: null });
  assert.deepEqual(saleStage({ ...sale, proved: true, settled: true }), { step: 5, status: "Paid", action: null });
});

test("срок пруфа вышел без пруфа - ставки вернулись, действий нет", () => {
  assert.deepEqual(saleStage(sale), { step: 4, status: "Proof missed", action: null });
});

test("без защиты покупателя деньги пришли при закрытии: печать, потом выплачено", () => {
  const paid = { ...sale, lockup: false };
  assert.deepEqual(saleStage(paid), { step: 3, status: "Print logos", action: "download" });
  assert.deepEqual(saleStage({ ...paid, downloaded: true }), { step: 5, status: "Paid", action: null });
});

test("деньги вернули мимо программы - Refunded, что бы ни было с местами", () => {
  assert.deepEqual(saleStage({ ...sale, lockup: false, settled: true, refunded: true }), {
    step: 5,
    status: "Refunded",
    action: null,
  });
});
