import { test } from "node:test";
import assert from "node:assert/strict";
import { isVideo, proofCopy } from "./media.ts";

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

test("копия пруфа на сайте: фото - webp, видео - mp4, путь склеен дефисом", () => {
  const base = "https://x.supabase.co/storage/v1/object/public/things/proof/";
  assert.equal(proofCopy(`${base}abc/1.jpg`), "/site/proof/abc-1.webp");
  assert.equal(proofCopy(`${base}abc/2.JPEG`), "/site/proof/abc-2.webp");
  assert.equal(proofCopy(`${base}abc/3.mp4`), "/site/proof/abc-3.mp4");
  assert.equal(proofCopy(`${base}abc/4.mov`), "/site/proof/abc-4.mp4");
  // Не пруф из хранилища - копии нет.
  assert.equal(proofCopy("https://x.supabase.co/storage/v1/object/public/creatives/a/b.png"), null);
});
