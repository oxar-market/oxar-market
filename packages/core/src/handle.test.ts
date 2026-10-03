import { test } from "node:test";
import assert from "node:assert/strict";
import { HANDLE_MAX, cleanHandle, handleInput } from "./handle.ts";

test("хэндл - латиница, цифры и подчёркивание до пятнадцати знаков", () => {
  assert.equal(HANDLE_MAX, 15);
  assert.equal(cleanHandle("oxar_app"), "oxar_app");
  assert.equal(cleanHandle("x".repeat(15)), "x".repeat(15));
  assert.equal(cleanHandle("x".repeat(16)), null);
});

test("«@» и пробелы по краям - не часть хэндла", () => {
  assert.equal(cleanHandle(" @oxar "), "oxar");
});

test("пустое и чужие знаки - не хэндл", () => {
  for (const bad of ["", "@", "ox ar", "oxar!", "оксар"]) {
    assert.equal(cleanHandle(bad), null, `«${bad}» должно отклоняться`);
  }
});

test("поле ввода оставляет только допустимые знаки и не больше пятнадцати", () => {
  assert.equal(handleInput("@ox ar!"), "oxar");
  assert.equal(handleInput("y".repeat(20)), "y".repeat(15));
});
