import { strict as assert } from "node:assert";
import { test } from "node:test";
import { avatarLetter } from "./avatar.ts";

test("буква - первая, заглавная, без собачки", () => {
  assert.equal(avatarLetter("wisl"), "W");
  assert.equal(avatarLetter("@wisl"), "W");
  assert.equal(avatarLetter("  superteam "), "S");
});

test("пустой хэндл буквы не даёт", () => {
  assert.equal(avatarLetter(""), "");
  assert.equal(avatarLetter("@"), "");
});
