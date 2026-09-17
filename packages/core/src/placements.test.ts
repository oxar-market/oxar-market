import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PLACEMENTS, placementSpec } from "./placements.ts";

test("места профиля X описаны здесь", () => {
  assert.equal(PLACEMENTS.length, 7);
  assert.equal(placementSpec("avatar").label, "Avatar");
  assert.equal(placementSpec("bio_link").defaultDays, 30);
});

test("незнакомое место не роняет, а читается по имени", () => {
  // Каталог товаров живёт в базе, и зона футболки - законное место.
  assert.equal(placementSpec("tshirt_lower_back").label, "Lower back");
  assert.equal(placementSpec("tshirt_chest").label, "Chest");
  assert.equal(placementSpec("dress_hem").label, "Hem");
});

test("имя без приставки тоже читается", () => {
  assert.equal(placementSpec("forehead").label, "Forehead");
});
