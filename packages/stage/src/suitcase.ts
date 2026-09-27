import type { Shape, Spot } from "./spots.ts";

/**
 * Чемодан: пять мест на лицевой грани.
 *
 * Модель и разметка возвращены из прежнего маркетплейса (коммит 64b66f9), где
 * чемодан уже стоял рядом с футболкой. Числа сняты с самой модели лучами:
 *
 * Лицевая грань - азимут 90. Из четырёх сторон только она плоская и пустая:
 * на противоположной идёт телескопическая ручка, две оставшиеся узкие и со
 * швом посередине.
 *
 * Плоская полоса по высоте - от 0.20 до 0.75 габарита. Ниже корпус
 * скругляется к колёсам и нормаль заваливается вниз, выше кончается корпус и
 * начинается ручка: габарит считается вместе с поднятой ручкой.
 *
 * Сдвиг вбок задаётся углом: на плоской грани x=0.103 угол a даёт сдвиг
 * z = 0.103 / tg(a). На 60 и 120 градусах это ±0.06 - половина просвета между
 * парой мест.
 *
 * Модель: J-Toastie, CC BY 3.0, https://poly.pizza/m/041xs8FnZZ - лицензия
 * требует подписи автора; она стоит на странице Terms приложения.
 */

/** Место под логотип: пара таких стоит в ряд, между ними остаётся просвет. */
const BADGE: [number, number] = [0.095, 0.06];
const LEFT = 60;
const RIGHT = 120;

export const SUITCASE_SPOTS: Spot[] = [
  // Главное место - широкая полоса наверху лицевой грани: чемодан катят перед
  // собой, и смотрят именно сюда.
  { code: "suitcase_panel", label: "Main panel", height: 0.65, azimuth: 90, size: [0.2, 0.105] },
  // Под ней две пары. Левый и правый - со стороны зрителя, не вещи.
  { code: "suitcase_upper_left", label: "Upper left", height: 0.47, azimuth: LEFT, size: BADGE },
  { code: "suitcase_upper_right", label: "Upper right", height: 0.47, azimuth: RIGHT, size: BADGE },
  { code: "suitcase_lower_left", label: "Lower left", height: 0.31, azimuth: LEFT, size: BADGE },
  { code: "suitcase_lower_right", label: "Lower right", height: 0.31, azimuth: RIGHT, size: BADGE },
];

export const SUITCASE: Shape = {
  model: "/models/suitcase.glb",
  spots: SUITCASE_SPOTS,
  // Грани сходятся под прямым углом: глубокая коробка захватила бы соседнюю
  // грань, и пятно завернулось бы за угол.
  depth: 0.05,
  cloth: false,
  noun: "suitcase",
};
