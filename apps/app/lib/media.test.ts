import { test } from "node:test";
import assert from "node:assert/strict";
import { isVideo } from "./media.ts";

test("видео с телефона узнаём по расширению пути", () => {
  assert.equal(isVideo("proof/abc/1.mov"), true);
  assert.equal(isVideo("proof/abc/1.MP4"), true);
  assert.equal(isVideo("https://x.supabase.co/storage/v1/object/public/things/proof/abc/1.webm"), true);
  assert.equal(isVideo("proof/abc/1.m4v"), true);
});

test("фото и пути без расширения - не видео", () => {
  assert.equal(isVideo("proof/abc/1.jpg"), false);
  assert.equal(isVideo("proof/abc/1.heic"), false);
  assert.equal(isVideo("proof/mov/1.png"), false);
  assert.equal(isVideo("proof/abc/mov"), false);
});
