import { test } from "node:test";
import assert from "node:assert/strict";
import { acesFilmic, develop, toSrgb } from "./tone.ts";

/**
 * Проверяем не «совпало с моей же формулой», а свойства, ради которых кривая
 * и нужна. Иначе тест повторял бы код и падал бы только вместе с ним.
 */

const EXPOSURE = 0.78;

test("чёрное остаётся чёрным", () => {
  const [r, g, b] = acesFilmic([0, 0, 0], EXPOSURE);
  assert.ok(r < 0.001 && g < 0.001 && b < 0.001);
});

test("яркость выше единицы не срезается в белый", () => {
  // Ровно то, из-за чего снимки выбивало: линейный свет легко переваливает за
  // единицу, и без кривой всё выше неё становится одним и тем же белым.
  const bright = acesFilmic([2, 2, 2], EXPOSURE)[0];
  const brighter = acesFilmic([4, 4, 4], EXPOSURE)[0];

  assert.ok(bright < 1, `${bright} уже упёрлось в потолок`);
  assert.ok(brighter > bright, "разная яркость даёт одинаковый результат");
});

test("кривая монотонна: светлее на входе - светлее на выходе", () => {
  let previous = -1;
  for (const value of [0, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 3]) {
    const out = acesFilmic([value, value, value], EXPOSURE)[0];
    assert.ok(out > previous, `${value} дал ${out}, а прошлый ${previous}`);
    previous = out;
  }
});

test("выдержка работает: меньше - темнее", () => {
  const dim = acesFilmic([0.5, 0.5, 0.5], 0.4)[0];
  const bright = acesFilmic([0.5, 0.5, 0.5], 1.2)[0];
  assert.ok(dim < bright);
});

test("перевод в sRGB: концы на месте, середина поднята", () => {
  assert.equal(toSrgb(0), 0);
  assert.ok(Math.abs(toSrgb(1) - 1) < 0.001);
  // Линейная половина в sRGB - примерно 0.735. Это и есть та разница, из-за
  // которой линейный буфер, показанный как sRGB, выглядит засвеченным.
  assert.ok(Math.abs(toSrgb(0.5) - 0.7354) < 0.005, `${toSrgb(0.5)}`);
  // Ниже порога работает прямой отрезок, а не степень.
  assert.ok(Math.abs(toSrgb(0.002) - 0.002 * 12.92) < 1e-9);
});

test("полная прозрачность не трогается вовсе", () => {
  const pixels = new Uint8Array([200, 200, 200, 0]);
  develop(pixels, EXPOSURE);
  assert.deepEqual(Array.from(pixels), [200, 200, 200, 0]);
});

test("яркий пиксель после проявки перестаёт быть чистым белым", () => {
  // 255 в линейном буфере - это «единица и выше», то самое место, где вещь
  // теряла форму. После проявки он обязан стать светло-серым, а не белым.
  const pixels = new Uint8Array([255, 255, 255, 255]);
  develop(pixels, EXPOSURE);

  assert.ok(pixels[0] < 255, `остался ${pixels[0]}`);
  assert.ok(pixels[0] > 200, `ушёл в серое: ${pixels[0]}`);
  assert.equal(pixels[3], 255);
});

test("кромка делится обратно на альфу, а не темнеет", () => {
  // Помноженный на альфу серый: половина яркости при половине альфы - это тот
  // же цвет, что и полный при полной альфе.
  const edge = new Uint8Array([64, 64, 64, 128]);
  const solid = new Uint8Array([128, 128, 128, 255]);
  develop(edge, EXPOSURE);
  develop(solid, EXPOSURE);

  assert.ok(Math.abs(edge[0] - solid[0]) <= 1, `${edge[0]} против ${solid[0]}`);
});
