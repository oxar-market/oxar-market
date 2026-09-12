import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isValidHandle, normalizeHandle } from "./handle.ts";

test("убирает @ и пробелы", () => {
  assert.equal(normalizeHandle("  @oxar_app "), "oxar_app");
});

test("принимает ссылку на профиль вместо хэндла", () => {
  assert.equal(normalizeHandle("https://x.com/JosipVolarevic2"), "JosipVolarevic2");
  assert.equal(normalizeHandle("twitter.com/oxar_app"), "oxar_app");
  assert.equal(normalizeHandle("https://www.x.com/oxar_app?s=20"), "oxar_app");
});

test("валидные хэндлы", () => {
  for (const value of ["oxar_app", "a", "A1_b2", "x".repeat(15), "@oxar_app"]) {
    assert.ok(isValidHandle(value), `должен быть валидным: ${value}`);
  }
});

test("невалидные хэндлы", () => {
  for (const value of ["", "   ", "bad handle", "точка.", "x".repeat(16), "hi-there"]) {
    assert.ok(!isValidHandle(value), `не должен быть валидным: ${value}`);
  }
});
