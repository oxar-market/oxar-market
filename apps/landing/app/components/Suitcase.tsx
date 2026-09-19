"use client";

import { Surface3D, type Spot, type SurfaceSpec } from "./Surface3D";

/**
 * Чемодан: разметка и слова. Всё поведение - в Surface3D.
 *
 * Числа сняты с самой модели лучами, как и у футболки, а не подобраны на глаз.
 * Что показал обмер:
 *
 * Лицевая грань - азимут 90. Из четырёх сторон только она плоская и пустая:
 * на противоположной идёт телескопическая ручка, а две оставшиеся узкие, со
 * швом посередине. Она же шире: 0.29 против 0.21, потому что чемодан стоит на
 * ребре, а не лежит.
 *
 * Плоская полоса по высоте - от 0.20 до 0.75 габарита. Ниже 0.20 корпус
 * скругляется к колёсам и нормаль заваливается вниз, выше 0.75 кончается сам
 * корпус и начинается ручка. Габарит считается вместе с поднятой ручкой,
 * поэтому верхняя треть высоты - воздух.
 *
 * Сдвиг вбок задаётся углом, а не третьей координатой. Луч идёт горизонтально
 * из точки на этом угле к оси, поэтому точка попадания лежит на той же прямой:
 * на плоской грани x=0.103 угол a даёт сдвиг z = 0.103 / tg(a). На 60 и 120
 * градусах это ±0.06 - ровно половина просвета между парой мест.
 */

/** Место под логотип: пара таких стоит в ряд, между ними остаётся просвет. */
const BADGE: [number, number] = [0.095, 0.06];
/** Разворот пары. На 60 и 120 градусах центры расходятся на ±0.06. */
const LEFT = 60;
const RIGHT = 120;

const SPOTS: Spot[] = [
  // Главное место - широкая полоса наверху лицевой грани. Её видно дальше
  // всего: чемодан катят перед собой, и смотрят именно сюда.
  { id: "suitcase_panel", label: "Main panel", height: 0.65, azimuth: 90, size: [0.2, 0.105] },
  // Под ней две пары квадратов. Левый и правый - со стороны зрителя, не вещи.
  { id: "suitcase_upper_left", label: "Upper left", height: 0.47, azimuth: LEFT, size: BADGE },
  { id: "suitcase_upper_right", label: "Upper right", height: 0.47, azimuth: RIGHT, size: BADGE },
  { id: "suitcase_lower_left", label: "Lower left", height: 0.31, azimuth: LEFT, size: BADGE },
  { id: "suitcase_lower_right", label: "Lower right", height: 0.31, azimuth: RIGHT, size: BADGE },
];

const SUITCASE: SurfaceSpec = {
  surface: "suitcase",
  name: "Suitcase",
  tagline: "Physical world",
  model: "/models/suitcase.glb",
  spots: SPOTS,
  // Корпус жёсткий и толстый, но грани сходятся под прямым углом: глубокая
  // коробка захватила бы соседнюю грань и пятно завернулось бы за угол.
  depth: 0.05,
  // Красится только корпус: в модели он отдельный материал по имени Material,
  // а колёса, ручка и ремень - фурнитура, у неё цвет свой.
  paintMaterial: "Material",
  // Первый цвет - родной цвет модели.
  variants: [
    { label: "Sky", color: 0x79b5ca },
    { label: "Graphite", color: 0x45484e },
    { label: "Sand", color: 0xcfc0a8 },
    { label: "Coral", color: 0xde8a63 },
  ],
  // Белая рамка, а не синяя: корпус сам цветной, и синий контур на нём
  // растворялся. У футболки ткань светлая и серая, там читается синий.
  tint: { idle: 0xeef4ff, hot: 0xffffff },
  // Перекраски нет намеренно: у модели свои материалы, и вещь выглядит вещью.
  // Футболке она нужна была из-за чужого принта, запечённого в текстуру.
  credit: {
    who: "J-Toastie",
    licence: "CC BY 3.0",
    url: "https://poly.pizza/m/041xs8FnZZ",
  },
  words: {
    loading: "Loading the suitcase…",
    idle: "Drag to turn the suitcase. Tap a spot.",
    forBuyer:
      "A suitcase goes through airports, lobbies and baggage belts for days, in front of people who are standing still with nothing to look at.",
    forSeller:
      "Every marked area is something a traveller could rent out while they are on the road anyway.",
    empty:
      "Nothing is up for auction on a suitcase right now. A profile can be checked automatically, a suitcase needs a photo and a place - that part is done by hand.",
  },
};

export function Suitcase({
  role,
  onWaitlist,
  onSwap,
}: {
  role: "creator" | "advertiser";
  onWaitlist: () => void;
  onSwap: () => void;
}) {
  return (
    <Surface3D spec={SUITCASE} role={role} onWaitlist={onWaitlist} onSwap={onSwap} />
  );
}
