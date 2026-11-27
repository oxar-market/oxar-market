import { test } from "node:test";
import assert from "node:assert/strict";
import { awaitsReview, reviewState } from "./thing-review.ts";

const base = { active: false, hidden: false, declinedReason: null, published: false, house: false };

test("черновик: продавец ещё не открыл торг", () => {
  assert.equal(reviewState(base), "draft");
});

test("торг открыт, решения нет - ждёт одобрения; наша вещь черновиком не бывает", () => {
  assert.equal(reviewState({ ...base, published: true }), "awaiting");
  assert.equal(reviewState({ ...base, house: true }), "awaiting");
});

test("одобрена - на маркете", () => {
  assert.equal(reviewState({ ...base, active: true, published: true }), "approved");
});

test("спрятана после одобрения - не ждёт одобрения заново", () => {
  assert.equal(reviewState({ ...base, hidden: true, published: true }), "hidden");
});

test("отклонена", () => {
  assert.equal(reviewState({ ...base, declinedReason: "blurry photos", published: true }), "declined");
});

test("ждёт решения админа: только опубликованная вещь продавца без решения", () => {
  assert.equal(awaitsReview({ ...base, published: true }), true);
  // Черновик одобрить нельзя - во входящих ему не место.
  assert.equal(awaitsReview(base), false);
  // Нашу вещь не одобряют: карточки решения у неё нет.
  assert.equal(awaitsReview({ ...base, house: true }), false);
  assert.equal(awaitsReview({ ...base, house: true, published: true }), false);
  assert.equal(awaitsReview({ ...base, published: true, active: true }), false);
  assert.equal(awaitsReview({ ...base, published: true, hidden: true }), false);
  assert.equal(awaitsReview({ ...base, published: true, declinedReason: "no" }), false);
});
