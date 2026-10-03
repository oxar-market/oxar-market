import { test } from "node:test";
import assert from "node:assert/strict";
import { rentDays, rentTotalCents, thingState } from "./seller.ts";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const plain = { declined: false, preparing: false, rented: false };

test("отказ и подготовка важнее торгов", () => {
  const live = [{ status: "open", closesAt: NOW + 1 }];
  assert.equal(thingState({ ...plain, declined: true }, live, NOW), "declined");
  assert.equal(thingState({ ...plain, preparing: true }, live, NOW), "preparing");
});

test("открытый торг до срока - live", () => {
  assert.equal(thingState(plain, [{ status: "open", closesAt: NOW + 1 }], NOW), "live");
});

test("открытый торг после срока - уже не live, хоть расчёт его ещё не разобрал", () => {
  assert.equal(thingState(plain, [{ status: "open", closesAt: NOW }], NOW), "ended");
  assert.equal(thingState(plain, [{ status: "open", closesAt: NOW - 1 }], NOW), "ended");
});

test("закрытые торги - ended, в том числе с вернувшейся ставкой", () => {
  for (const status of ["won", "unsold", "refunded"]) {
    assert.equal(thingState(plain, [{ status, closesAt: NOW - 1 }], NOW), "ended", status);
  }
});

test("без торгов - аренда или простой", () => {
  assert.equal(thingState({ ...plain, rented: true }, [], NOW), "rented");
  assert.equal(thingState(plain, [], NOW), "idle");
  assert.equal(thingState(plain, [{ status: "cancelled", closesAt: NOW - 1 }], NOW), "idle");
});

test("последний день аренды входит в срок", () => {
  assert.equal(rentDays("2026-10-01", "2026-10-14"), 14);
  assert.equal(rentDays("2026-10-01", "2026-10-01"), 1);
  assert.equal(rentTotalCents("2026-10-01", "2026-10-14", 500), 7_000);
});
