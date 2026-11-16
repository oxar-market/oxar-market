import { test } from "node:test";
import assert from "node:assert/strict";
import { rankBidders } from "./board.ts";

const lots = [
  { id: "L1", status: "won", rehearsal: false, thing_id: "van" },
  { id: "L2", status: "won", rehearsal: false, thing_id: "van" },
  { id: "L3", status: "open", rehearsal: false, thing_id: "tie" },
  { id: "R1", status: "won", rehearsal: true, thing_id: "test" },
];
const bid = (lot: string, cents: number, wallet: string, at: string, brand = "") => ({
  lot_id: lot,
  amount_cents: cents,
  bidder_wallet: wallet,
  brand,
  created_at: at,
});

test("платит только старшая ставка на проданном месте, остальное вернулось", () => {
  const [a, b] = rankBidders(lots, [
    bid("L1", 50000, "A", "2026-10-02", "Acme"),
    bid("L1", 40000, "B", "2026-10-01", "Bolt"),
    bid("L2", 30000, "B", "2026-10-03", "Bolt"),
  ]);
  assert.deepEqual([a!.wallet, a!.paidCents, a!.spots, a!.backCents], ["A", 50000, 1, 0]);
  assert.deepEqual([b!.wallet, b!.paidCents, b!.spots, b!.backCents], ["B", 30000, 1, 40000]);
});

test("лидер идущего торга ещё ничего не заплатил", () => {
  const [a] = rankBidders(lots, [bid("L3", 90000, "A", "2026-11-01")]);
  assert.equal(a!.paidCents, 0);
  assert.equal(a!.spots, 0);
  assert.deepEqual(a!.joined, ["tie"]);
  assert.deepEqual(a!.won, []);
});

test("прогоны в рейтинг не идут", () => {
  assert.deepEqual(rankBidders(lots, [bid("R1", 100, "T", "2026-10-01")]), []);
});

test("порядок: заплатил больше, при равенстве - больше мест, потом кто раньше пришёл", () => {
  const ranked = rankBidders(lots, [
    bid("L1", 20000, "late", "2026-10-05"),
    bid("L2", 20000, "early", "2026-10-01"),
    bid("L3", 10000, "early", "2026-10-02"),
  ]);
  assert.deepEqual(ranked.map((one) => one.wallet), ["early", "late"]);
});

test("бренды без повторов и без пустых, вещи по одному разу", () => {
  const [a] = rankBidders(lots, [
    bid("L1", 500, "A", "2026-10-01", "Acme"),
    bid("L1", 400, "A", "2026-09-30", " acme "),
    bid("L2", 300, "A", "2026-10-02", ""),
  ]);
  assert.deepEqual(a!.brands, ["Acme"]);
  assert.deepEqual(a!.joined, ["van"]);
  assert.equal(a!.bids, 3);
  assert.equal(a!.since, Date.parse("2026-09-30"));
});
