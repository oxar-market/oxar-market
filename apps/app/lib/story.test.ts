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

test("победители всех мест по сумме, непроданные - отдельно", () => {
  const story = storyOf(lots, bids);
  assert.deepEqual(
    story.winners.map((one) => [one.brand, one.amountCents, one.spot]),
    [
      ["C", 90000, "hood"],
      ["D", 45000, "door"],
    ],
  );
  assert.deepEqual(story.unsold, ["roof"]);
});

test("ставки по местам: все места со ставками, внутри - от большей к меньшей", () => {
  const story = storyOf(lots, bids);
  assert.deepEqual(story.rounds.map((one) => one.spot), ["hood", "door"]);
  assert.deepEqual(story.rounds[0]!.steps.map((one) => one.amountCents), [90000, 80000, 70000, 60000]);
  assert.equal(story.rounds[0]!.won, true);
  assert.equal(story.rounds[0]!.brands, 3);
});

test("место без победителя - ставки есть, но won ложно", () => {
  const story = storyOf(lots, [...bids, bid("r1", "roof", 10000, "E", "we", "2026-10-29T10:00:00Z")]);
  const roof = story.rounds.find((one) => one.spot === "roof")!;
  assert.equal(roof.won, false);
  assert.equal(roof.steps.length, 1);
});

test("первая ставка - самая ранняя по времени", () => {
  assert.equal(storyOf(lots, bids).firstBidAt, "2026-10-26T10:00:00Z");
  assert.equal(storyOf(lots, []).firstBidAt, null);
});

test("ставки на непроданное место в итог не идут", () => {
  const story = storyOf(lots, [...bids, bid("r1", "roof", 10000, "E", "we", "2026-10-29T10:00:00Z")]);
  // Место не продано - ставка на него не победила, хотя и была.
  assert.equal(story.raisedCents, 135000);
  assert.equal(story.bidders, 5);
});
