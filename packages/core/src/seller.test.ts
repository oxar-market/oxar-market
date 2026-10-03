import { test } from "node:test";
import assert from "node:assert/strict";
import { proofDue, rentDays, rentTotalCents, thingState } from "./seller.ts";

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
