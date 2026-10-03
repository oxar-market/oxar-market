import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreText, shortWallet, spotName } from "./labels.ts";

test("номер места подписывается «Spot», но не дважды", () => {
  assert.equal(spotName("01"), "Spot 01");
  assert.equal(spotName("Spot 1"), "Spot 1");
  assert.equal(spotName("Main panel"), "Main panel", "у места с именем слово лишнее");
});

test("до трёх сделок чужой - новичок, даже с пятёрками", () => {
  assert.equal(scoreText({ rating: 5, deals: 2 }), "New seller");
  assert.equal(scoreText({ rating: 5, deals: 2 }, "buyer"), "New buyer");
});

test("с тремя сделками - оценка, без оценок - так и пишем", () => {
  assert.equal(scoreText({ rating: 4.67, deals: 3 }), "★ 4.7 · 3 deals");
  assert.equal(scoreText({ rating: null, deals: 4 }), "4 deals, no ratings yet");
});

test("себе своя оценка видна сразу", () => {
  assert.equal(scoreText({ rating: 5, deals: 1 }, "seller", true), "★ 5.0 · 1 deal");
  assert.equal(scoreText({ rating: null, deals: 1 }, "seller", true), "New seller");
});

test("кошелёк коротко - четыре знака с краёв", () => {
  assert.equal(shortWallet("4zBp61iGL7f9zybTfrtwydUZmM2WxRsskedqFNdHiDpe"), "4zBp..iDpe");
  assert.equal(shortWallet("short"), "short");
});
