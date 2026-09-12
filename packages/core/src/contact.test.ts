import { strict as assert } from "node:assert";
import { test } from "node:test";
import { contactKind, isValidContact } from "./contact.ts";

test("почта принимается", () => {
  for (const value of ["a@b.co", "daniel.l@oxar.app", " me@mail.example "]) {
    assert.equal(contactKind(value), "email", value);
  }
});

test("телеграм принимается, со ссылкой и без", () => {
  for (const value of ["@oxar_app", "oxar_app", "https://t.me/oxar_app", "t.me/oxar_app"]) {
    assert.equal(contactKind(value), "telegram", value);
  }
});

test("мусор не проходит", () => {
  for (const value of ["123", "", "   ", "@", "a@b", "ab", "почта", "@a"]) {
    assert.ok(!isValidContact(value), `должно быть отклонено: ${value}`);
  }
});

test("адрес на нелатинском домене - валидный адрес, не мусор", () => {
  // Кириллические домены существуют, запрещать их незачем.
  assert.equal(contactKind("почта@мейл.ру"), "email");
});
