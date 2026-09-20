import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AVATAR_TONES, avatarLetter, avatarTone } from "./avatar.ts";

test("один хэндл - всегда один цвет", () => {
  assert.equal(avatarTone("superteam"), avatarTone("superteam"));
  assert.equal(avatarTone("wisl"), avatarTone("wisl"));
});

test("цвет всегда из палитры", () => {
  for (const handle of ["a", "wisl", "kitlabs", "willo", "npoint", "superteam"]) {
    assert.ok(AVATAR_TONES.includes(avatarTone(handle) as never), handle);
  }
});

test("разные хэндлы обычно расходятся по цвету", () => {
  const tones = new Set(["wisl", "kitlabs", "willo", "npoint"].map(avatarTone));
  assert.ok(tones.size > 1);
});

test("буква - первая, заглавная, без собачки", () => {
  assert.equal(avatarLetter("wisl"), "W");
  assert.equal(avatarLetter("@wisl"), "W");
  assert.equal(avatarLetter("  superteam "), "S");
});

test("пустой хэндл буквы не даёт", () => {
  assert.equal(avatarLetter(""), "");
  assert.equal(avatarLetter("@"), "");
});
