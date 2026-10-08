import type { Shape, Spot } from "./spots.ts";

/**
 * Ноутбук Delora: закрытый, стоит на ребре петли, крышка к зрителю.
 *
 * Модель своя, собрана скриптом по размерам MacBook Air 13 (30.41 x 21.5 x
 * 1.13 см), без логотипа - его и так закрывают наклейки. Крышка - плоскость с
 * точными нормалями, иначе металл на ней шёл бы разводами, и разбита кольцами
 * вершин: сцена штампует место по граням, вершины которых рядом с ним, а у
 * плоскости из одних краевых вершин таких граней не нашлось бы. Цвет -
 * тёмно-синий металл. 21 тысяча треугольников, после meshopt 70 КБ.
 *
 * Раскладка - как на фото с TOKEN2049: три квадрата в ряд по верху крышки,
 * под ними две полосы. Сцена ставит ширину вещи в 0.62, значит сантиметр
 * крышки - 0.0204 единицы сцены, а высота крышки - 0.438.
 *
 * Крышка в сантиметре от оси, поэтому колонки заданы сдвигом, а не углом:
 * все места на азимуте 0, и сцена смотрит на крышку, какое ни выбери.
 */

/** Квадрат 9.2 см: три в ряд закрывают верх крышки, не заходя на углы. */
const SQUARE: [number, number] = [0.188, 0.188];
/** Полоса 13.5 x 3.4 см - под широкий логотип со словом. */
const STRIPE: [number, number] = [0.275, 0.069];

export const LAPTOP_SPOTS: Spot[] = [
  { code: "laptop_top_left", label: "Top left", height: 0.753, azimuth: 0, shift: -0.202, size: SQUARE },
  { code: "laptop_top_center", label: "Top center", height: 0.753, azimuth: 0, shift: 0, size: SQUARE },
  { code: "laptop_top_right", label: "Top right", height: 0.753, azimuth: 0, shift: 0.202, size: SQUARE },
  { code: "laptop_bottom_left", label: "Bottom left", height: 0.17, azimuth: 0, shift: -0.155, size: STRIPE },
  { code: "laptop_bottom_right", label: "Bottom right", height: 0.17, azimuth: 0, shift: 0.155, size: STRIPE },
];

export const LAPTOP: Shape = {
  model: "/models/laptop.glb",
  spots: LAPTOP_SPOTS,
  // Крышка тоньше сантиметра: коробка глубже прошла бы её насквозь, и
  // наклейка отпечаталась бы ещё и на корпусе.
  depth: 0.01,
  cloth: false,
  noun: "laptop",
};
