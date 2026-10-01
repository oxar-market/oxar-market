import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, zip } from "./zip.ts";

test("crc32 совпадает с эталоном", () => {
  // Эталон из любой реализации: crc32("hello") = 0x3610a686.
  assert.equal(crc32(new TextEncoder().encode("hello")), 0x3610a686);
  assert.equal(crc32(new Uint8Array()), 0);
});

test("архив читается системным unzip и отдаёт файлы байт в байт", () => {
  const one = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const two = new TextEncoder().encode("second file");
  const bytes = zip([
    { name: "01-Echoes.png", data: one },
    { name: "02-Kumeka.txt", data: two },
  ]);
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  const file = join(dir, "logos.zip");
  writeFileSync(file, bytes);
  execFileSync("unzip", ["-qt", file]);
  execFileSync("unzip", ["-q", file, "-d", join(dir, "out")]);
  assert.deepEqual(new Uint8Array(readFileSync(join(dir, "out", "01-Echoes.png"))), one);
  assert.equal(readFileSync(join(dir, "out", "02-Kumeka.txt"), "utf8"), "second file");
});

test("имя не латиницей пишется в UTF-8 с флагом 0x0800", () => {
  const bytes = zip([{ name: "Кумека.png", data: new Uint8Array([1]) }]);
  const view = new DataView(bytes.buffer);
  assert.equal(view.getUint16(6, true) & 0x0800, 0x0800);
  const length = view.getUint16(26, true);
  assert.equal(new TextDecoder().decode(bytes.slice(30, 30 + length)), "Кумека.png");
});
