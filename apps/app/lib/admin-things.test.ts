import { test } from "node:test";
import assert from "node:assert/strict";
import { afterTodos, shelfOf, summarizeLots } from "./admin-things.ts";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const lot = (id: string, status: string, closes_at: string, rehearsal = false) => ({ id, status, closes_at, rehearsal });
const bid = (lot_id: string, amount_cents: number, media_url = `${lot_id}-${amount_cents}.webp`) => ({
  lot_id,
  amount_cents,
  media_url,
});

test("собрано: верхняя ставка проданного и идущего места, прогоны и возвраты мимо", () => {
  const lots = [
    lot("a", "won", "2026-11-01T00:00:00Z"),
    lot("b", "won", "2026-11-01T00:00:00Z"),
    lot("c", "refunded", "2026-11-01T00:00:00Z"),
    lot("r", "won", "2026-10-01T00:00:00Z", true),
  ];
  const bids = [bid("a", 1000), bid("a", 500), bid("b", 300), bid("c", 9000), bid("r", 7000)];
  const sum = summarizeLots(lots, bids, NOW);
  assert.equal(sum.raisedCents, 1300);
  assert.equal(sum.bids, 4, "ставки прогона не в счёт");
  assert.equal(sum.winnerImage, "a-1000.webp");
  assert.equal(sum.live, false);
  assert.equal(sum.closesAt, "2026-11-01T00:00:00Z");
  assert.equal(sum.rehearsal, "some");
});

test("идёт: открытый лот, срок не вышел; вышел - уже не идёт", () => {
  assert.equal(summarizeLots([lot("a", "open", "2026-11-28T00:00:00Z")], [], NOW).live, true);
  assert.equal(summarizeLots([lot("a", "open", "2026-11-26T00:00:00Z")], [], NOW).live, false);
});

test("черновики цен не дают даты закрытия; одни прогоны - rehearsal all", () => {
  const sum = summarizeLots([lot("d", "draft", "2026-12-01T00:00:00Z")], [], NOW);
  assert.equal(sum.closesAt, null);
  assert.equal(sum.rehearsal, "none");
  const test = summarizeLots([lot("r", "won", "2026-10-01T00:00:00Z", true)], [bid("r", 100)], NOW);
  assert.equal(test.rehearsal, "all");
  assert.equal(test.closesAt, "2026-10-01T00:00:00Z", "у прогона дата - его собственная");
  assert.equal(test.raisedCents, 0);
});

const thing = {
  title: "The tie",
  slug: "shirt-xx",
  hidden: false,
  live: false,
  closesAt: "2026-10-17T08:10:00Z",
  rehearsal: "none" as const,
};

test("полка вещи: идёт, прошла, спрятана, не открывалась", () => {
  assert.equal(shelfOf({ ...thing, live: true }), "live");
  assert.equal(shelfOf(thing), "ended");
  assert.equal(shelfOf({ ...thing, hidden: true }), "hidden");
  assert.equal(shelfOf({ ...thing, closesAt: null }), "draft");
});

test("тестовый прогон: только прогоны, или спрятанная с прогоном или словом test", () => {
  assert.equal(shelfOf({ ...thing, rehearsal: "all" }), "test");
  assert.equal(shelfOf({ ...thing, hidden: true, rehearsal: "some" }), "test");
  assert.equal(shelfOf({ ...thing, hidden: true, title: "TEST AUCTION, DON'T BID" }), "test");
  assert.equal(shelfOf({ ...thing, hidden: true, slug: "the-van-rehearsal" }), "test");
  // Настоящая вещь с прогоном до открытия - не тест.
  assert.equal(shelfOf({ ...thing, rehearsal: "some" }), "ended");
  // Слово внутри другого - не тест.
  assert.equal(shelfOf({ ...thing, hidden: true, title: "Contest shirt" }), "hidden");
});

const ended = { shelf: "ended" as const, refunded: false, raisedCents: 27500, reach: 18000, reachChecked: true, proof: ["a.jpg"] };

test("после торга: охват и фото итогов, пока их нет", () => {
  assert.deepEqual(afterTodos(ended), []);
  assert.deepEqual(afterTodos({ ...ended, reach: null }), ["reach"]);
  assert.deepEqual(afterTodos({ ...ended, reachChecked: false }), ["reach"], "оценка - ещё не охват");
  assert.deepEqual(afterTodos({ ...ended, proof: [] }), ["photos"]);
});

test("после торга нечего делать: деньги вернули, ничего не продано, торг не прошёл", () => {
  const bare = { ...ended, reach: null, proof: [] };
  assert.deepEqual(afterTodos({ ...bare, refunded: true }), []);
  assert.deepEqual(afterTodos({ ...bare, raisedCents: 0 }), []);
  assert.deepEqual(afterTodos({ ...bare, shelf: "live" }), []);
  assert.deepEqual(afterTodos({ ...bare, shelf: "test" }), []);
});
