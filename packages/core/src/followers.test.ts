import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MAX_FOLLOWERS, parseFollowers } from "./followers.ts";

test("обычные числа, с пробелами и запятыми", () => {
  assert.equal(parseFollowers("12400"), 12_400);
  assert.equal(parseFollowers("12 400"), 12_400);
  assert.equal(parseFollowers("12,400"), 12_400);
});

test("сокращения k и m", () => {
  assert.equal(parseFollowers("12.4k"), 12_400);
  assert.equal(parseFollowers("1.2M"), 1_200_000);
  assert.equal(parseFollowers("48K"), 48_000);
});

test("буквы и мусор не проходят", () => {
  for (const value of ["", "  ", "много", "12abc", "-5", "12,4k0", "1e5"]) {
    assert.equal(parseFollowers(value), null, `должно быть отклонено: ${value}`);
  }
});

test("абсурдно большие числа отклоняются", () => {
  assert.equal(parseFollowers(String(MAX_FOLLOWERS + 1)), null);
  assert.equal(parseFollowers("999M"), null);
});
