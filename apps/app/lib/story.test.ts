import { test } from "node:test";
import assert from "node:assert/strict";
import { storyOf } from "./story.ts";

const bid = (id: string, lot_id: string, amount_cents: number, brand: string, wallet: string, at: string) => ({
  id,
  lot_id,
  amount_cents,
  brand,
  bidder_wallet: wallet,
  created_at: at,
  media_url: `https://x/${id}.png`,
});

const lots = [
  { id: "hood", spot_code: "hood", status: "won" },
  { id: "door", spot_code: "door", status: "won" },
  { id: "roof", spot_code: "roof", status: "unsold" },
];

const bids = [
  bid("h1", "hood", 60000, "A", "wa", "2026-10-26T10:00:00Z"),
  bid("h2", "hood", 70000, "B", "wb", "2026-10-27T10:00:00Z"),
  bid("h3", "hood", 80000, "A", "wa", "2026-10-27T15:00:00Z"),
  bid("h4", "hood", 90000, "C", "wc", "2026-10-28T10:00:00Z"),
  bid("d1", "door", 45000, "D", "wd", "2026-10-26T16:00:00Z"),
];

test("итог: собрано по победившим ставкам, продано мест, участников и ставок", () => {
  const story = storyOf(lots, bids);
  assert.equal(story.raisedCents, 135000);
  assert.equal(story.sold, 2);
  assert.equal(story.total, 3);
  assert.equal(story.bidders, 4);
  assert.equal(story.bids, 5);
});

test("подиум - победители мест по сумме, не больше трёх", () => {
  const story = storyOf(lots, bids);
  assert.deepEqual(
    story.podium.map((one) => [one.brand, one.amountCents, one.spot]),
    [
      ["C", 90000, "hood"],
      ["D", 45000, "door"],
    ],
  );
});

test("битва за место: ставки по возрастанию, только где перебивали", () => {
  const story = storyOf(lots, bids);
  assert.equal(story.battles.length, 1);
  assert.equal(story.battles[0]!.spot, "hood");
  assert.deepEqual(story.battles[0]!.steps.map((one) => one.amountCents), [60000, 70000, 80000, 90000]);
  assert.equal(story.battles[0]!.brands, 3);
});

test("ставки на непроданное место в итог не идут", () => {
  const story = storyOf(lots, [...bids, bid("r1", "roof", 10000, "E", "we", "2026-10-29T10:00:00Z")]);
  // Место не продано - ставка на него не победила, хотя и была.
  assert.equal(story.raisedCents, 135000);
  assert.equal(story.bidders, 5);
});
