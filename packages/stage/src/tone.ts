/**
 * Проявка кадра: то, что рендерер делает на экране, но руками.
 *
 * Зачем это вообще существует. Снимки ракурсов мы берём не с холста, а из
 * `WebGLRenderTarget`, и three в этом случае последний проход не выполняет:
 *
 *     let toneMapping = NoToneMapping;
 *     if (material.toneMapped) {
 *       if (_currentRenderTarget === null || ...isXRRenderTarget) {
 *         toneMapping = _this.toneMapping;
 *       }
 *     }
 *
 * То есть в буфере лежит линейный цвет без плёночной кривой, а мы кладём его
 * в холст, который читает байты как sRGB. Дважды в сторону света: кривой нет -
 * блики срезаются в чистый белый; перевода нет - середина тона задирается.
 * Светлая вещь на снимке превращалась в силуэт, хотя на сцене выглядела
 * нормально.
 *
 * Формула повторяет `tonemapping_pars_fragment.glsl` из three слово в слово.
 * Разойтись они не должны: кнопка обязана показывать вещь такой, какая она на
 * сцене, иначе ракурс врёт о том, что купят.
 */

/** Матрицы ACES. В GLSL они записаны по столбцам, здесь развёрнуты по строкам. */
const IN: [number, number, number][] = [
  [0.59719, 0.35458, 0.04823],
  [0.07600, 0.90834, 0.01566],
  [0.02840, 0.13383, 0.83777],
];

const OUT: [number, number, number][] = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

function apply(m: [number, number, number][], c: [number, number, number]) {
  return [
    m[0][0] * c[0] + m[0][1] * c[1] + m[0][2] * c[2],
    m[1][0] * c[0] + m[1][1] * c[1] + m[1][2] * c[2],
    m[2][0] * c[0] + m[2][1] * c[1] + m[2][2] * c[2],
  ] as [number, number, number];
}

function fit(v: number): number {
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.432951) + 0.238081;
  return a / b;
}

/**
 * Плёночная кривая ACES с выдержкой.
 *
 * Её смысл в одном: яркость выше единицы не срезается, а сжимается, и белая
 * ткань сохраняет складки вместо того, чтобы стать пятном.
 */
export function acesFilmic(
  colour: [number, number, number],
  exposure: number,
): [number, number, number] {
  const scale = exposure / 0.6;
  const lit = apply(IN, [colour[0] * scale, colour[1] * scale, colour[2] * scale]);
  const shaped = apply(OUT, [fit(lit[0]), fit(lit[1]), fit(lit[2])]);
  return [clamp01(shaped[0]), clamp01(shaped[1]), clamp01(shaped[2])];
}

/** Линейный цвет в sRGB - то же, что делает `sRGBTransferOETF` в three. */
export function toSrgb(value: number): number {
  const v = clamp01(value);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 0.41666) - 0.055;
}

/**
 * Пиксели кадра в готовые к показу байты, на месте.
 *
 * Байты приходят линейные и помноженные на альфу - рендерер three собран с
 * `premultipliedAlpha`. Холст же ждёт непомноженные, поэтому по краю вещи
 * цвет сначала делится обратно на альфу: без этого кромка темнеет.
 */
export function develop(pixels: Uint8Array | Uint8ClampedArray, exposure: number): void {
  for (let at = 0; at < pixels.length; at += 4) {
    const alpha = pixels[at + 3] / 255;
    if (alpha === 0) continue;

    const linear: [number, number, number] = [
      pixels[at] / 255 / alpha,
      pixels[at + 1] / 255 / alpha,
      pixels[at + 2] / 255 / alpha,
    ];
    const shaped = acesFilmic(linear, exposure);

    pixels[at] = Math.round(toSrgb(shaped[0]) * 255);
    pixels[at + 1] = Math.round(toSrgb(shaped[1]) * 255);
    pixels[at + 2] = Math.round(toSrgb(shaped[2]) * 255);
  }
}
