import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PREVIEW_SIDE, needsPreview, originalUrl, previewPath, previewSize } from "./preview.ts";

test("копия ужимается по длинной стороне и не растягивается", () => {
  assert.equal(PREVIEW_SIDE, 1024);
  assert.deepEqual(previewSize(2048, 2048), { width: 1024, height: 1024 });
  assert.deepEqual(previewSize(4000, 1000), { width: 1024, height: 256 });
  assert.deepEqual(previewSize(1000, 3000), { width: 341, height: 1024 });
  assert.deepEqual(previewSize(800, 600), { width: 800, height: 600 });
  assert.deepEqual(previewSize(5000, 1), { width: 1024, height: 1 });
});

test("копию делаем только растровым картинкам", () => {
  for (const ext of ["png", "jpg", "jpeg", "webp", "PNG"]) assert.equal(needsPreview(ext), true, ext);
  // SVG и так лёгкий и резкий на любом размере, GIF потерял бы анимацию.
  for (const ext of ["svg", "gif", "mp4", ""]) assert.equal(needsPreview(ext), false, ext);
});

test("копия лежит рядом с оригиналом, оригинал из неё восстанавливается", () => {
  const path = "lot-1/abc.png";
  assert.equal(previewPath(path, "webp"), "lot-1/abc.png.view.webp");
  assert.equal(previewPath(path, "png"), "lot-1/abc.png.view.png");

  const base = "https://x.supabase.co/storage/v1/object/public/creatives/";
  assert.equal(originalUrl(base + previewPath(path, "webp")), base + path);
  assert.equal(originalUrl(base + previewPath(path, "png")), base + path);
  // Ссылка без копии (SVG, старые ставки, кейсы на сайте) - и есть оригинал.
  assert.equal(originalUrl(base + "lot-1/abc.svg"), base + "lot-1/abc.svg");
  assert.equal(originalUrl("/cases/delora-laptop/oxar.webp"), "/cases/delora-laptop/oxar.webp");
});
