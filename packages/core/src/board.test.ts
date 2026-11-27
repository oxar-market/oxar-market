import { test } from "node:test";
import assert from "node:assert/strict";
import { myBidStates, rankBidders, topBids } from "./board.ts";

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

test("старшая ставка места - наибольшая сумма, а не последняя по времени", () => {
  const top = topBids([
    bid("L1", 40000, "B", "2026-10-03"),
    bid("L1", 50000, "A", "2026-10-02"),
    bid("L2", 30000, "B", "2026-10-01"),
  ]);
  assert.equal(top.get("L1")!.bidder_wallet, "A");
  assert.equal(top.get("L2")!.amount_cents, 30000);
  assert.equal(top.size, 2);
});

test("у участника видна его старшая ставка, даже если её перебили", () => {
  const [a, b] = rankBidders(lots, [
    bid("L1", 50000, "A", "2026-10-02"),
    bid("L1", 45000, "B", "2026-10-01"),
    bid("L2", 30000, "B", "2026-10-03"),
  ]);
  assert.equal(a!.bestCents, 50000);
  // Выиграл L2 за 300, но его старшая ставка - перебитые 450 на L1.
  assert.equal(b!.bestCents, 45000);
});

test("в идущем торге видно, кто сейчас ведёт и на какую сумму", () => {
  const ranked = rankBidders(lots, [
    bid("L3", 20000, "B", "2026-11-01"),
    bid("L3", 25000, "A", "2026-11-02"),
    bid("L3", 15000, "A", "2026-10-30"),
  ]);
  const a = ranked.find((one) => one.wallet === "A")!;
  const b = ranked.find((one) => one.wallet === "B")!;
  assert.deepEqual([a.leads, a.leadCents, a.paidCents], [1, 25000, 0]);
  assert.deepEqual([b.leads, b.leadCents, b.bestCents], [0, 0, 20000]);
});

test("ведёт и на проданном месте - тот, кто его выиграл", () => {
  const [a] = rankBidders(lots, [bid("L1", 50000, "A", "2026-10-02")]);
  assert.deepEqual([a!.leads, a!.leadCents, a!.paidCents], [1, 50000, 50000]);
});

test("статус каждой своей ставки: веду, выиграл, вернули, поднял сам, перебили", () => {
  const mine = [
    { lot_id: "A", amount_cents: 70000 },
    { lot_id: "B", amount_cents: 75000 },
    { lot_id: "B", amount_cents: 95000 },
    { lot_id: "C", amount_cents: 75000 },
    { lot_id: "D", amount_cents: 1000 },
    { lot_id: "E", amount_cents: 500 },
  ];
  const lots = {
    A: { open: false, status: "won", refunded: false, topWallet: "X" },
    B: { open: false, status: "won", refunded: true, topWallet: "ME" },
    C: { open: false, status: "won", refunded: false, topWallet: "ME" },
    D: { open: true, status: "open", refunded: false, topWallet: "ME" },
    E: { open: false, status: "cancelled", refunded: false, topWallet: "ME" },
  };
  assert.deepEqual(myBidStates(mine, lots, "ME"), ["outbid", "raised", "refunded", "won", "leading", "refunded"]);
});

test("место на вещи, деньги за которую вернули, не оплачено: сумма ушла назад", () => {
  const back = [
    { id: "V1", status: "won", rehearsal: false, thing_id: "van", refunded: true },
    { id: "T1", status: "won", rehearsal: false, thing_id: "tie" },
  ];
  const [a, b] = rankBidders(back, [bid("V1", 95000, "A", "2026-10-27"), bid("T1", 27500, "B", "2026-10-17")]);
  // Заплатил по-настоящему только B - он первый.
  assert.deepEqual([a!.wallet, a!.paidCents, a!.spots, a!.won], ["B", 27500, 1, ["tie"]]);
  assert.deepEqual([b!.wallet, b!.paidCents, b!.spots, b!.backCents, b!.won], ["A", 0, 0, 95000, []]);
});

test("выигрыш с возвратом виден суммой и стоит после оплаченных, но выше тех, кто не выиграл", () => {
  const back = [
    { id: "V1", status: "won", rehearsal: false, thing_id: "van", refunded: true },
    { id: "V2", status: "won", rehearsal: false, thing_id: "van", refunded: true },
    { id: "T1", status: "won", rehearsal: false, thing_id: "tie" },
  ];
  const ranked = rankBidders(back, [
    bid("V1", 95000, "big", "2026-10-27"),
    bid("V1", 85000, "lost", "2026-10-26"),
    bid("V2", 30000, "small", "2026-10-27"),
    bid("T1", 1500, "paid", "2026-10-17"),
  ]);
  assert.deepEqual(ranked.map((one) => one.wallet), ["paid", "big", "small", "lost"]);
  const big = ranked[1]!;
  assert.deepEqual([big.refundedSpots, big.refundedCents, big.paidCents], [1, 95000, 0]);
  // Перебитая ставка - не выигрыш с возвратом.
  assert.deepEqual([ranked[3]!.refundedSpots, ranked[3]!.refundedCents], [0, 0]);
});

test("кто не выиграл ничего, стоит по своей старшей ставке", () => {
  const ranked = rankBidders(lots, [
    bid("L1", 50000, "W", "2026-10-02"),
    bid("L1", 10000, "low", "2026-10-01"),
    bid("L1", 40000, "high", "2026-10-03"),
  ]);
  assert.deepEqual(ranked.map((one) => one.wallet), ["W", "high", "low"]);
});
