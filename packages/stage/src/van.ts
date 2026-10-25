import type { Shape, Spot, StickerSlot } from "./spots.ts";

/**
 * Ван Solana Got Motion: Mercedes-Benz V-Class (W447), модель Mona x Supercars
 * со Sketchfab (CC BY 4.0). Перед на +X, правый борт со сдвижной дверью - к
 * зрителю (азимут 0), левый - азимут 180, корма - -90. Капот и крыша - места
 * сверху.
 *
 * Границы сняты с ортопроекций модели, в её метрах: длина 5.14, высота 1.87.
 * Оклеиваются и стёкла (перфорированная плёнка), поэтому борт - во всю
 * высоту до верха окон (1.74): двери - от порога (0.52), задние крылья - от
 * верха арки (0.80). Сдвижная дверь от
 * -1.08 до 0.14 вдоль машины, передняя - до 1.17; арки колёс - на -1.54 и
 * 1.68, верх арки 0.77. Крыша светлыми панелями между рейлингами (±0.68) от
 * -2.2 до 0.7, лобовое до 1.6, капот до 2.4. Корма - крышка багажника со
 * стеклом, от ниши номера до верха.
 */
const M = 0.62 / 5.138;
const H = 1.866;
/** Высота места: доля габарита по высоте, из метров модели. */
const at = (meters: number) => Math.round((meters / H) * 1000) / 1000;
const len = (meters: number) => Math.round(meters * M * 1000) / 1000;

/** Детали модели: двери - отдельные меши, остальное - кузов одним мешем. */
const BODY = ["bottom003"];
const FRONT_R = ["redglass011"];
const SLIDING_R = ["redglass013"];
const FRONT_L = ["bottom016"];
const SLIDING_L = ["redglass010"];
const TAILGATE = ["redglass007"];
/**
 * Двери - отдельные детали: штамп глубже, а коробка ниже низа двери, чтобы
 * печать дошла до самого края. Лишнее коробки ложится только на дверь.
 */
const DOOR_REACH = len(0.4);

export const VAN_SPOTS: Spot[] = [
  // Правый борт - по стыкам дверей: заднее крыло от -2.45 до -1.08 (на
  // скругление кормы не заходит - там печать шла пилой), сдвижная дверь до
  // 0.13, передняя дверь до 1.18, дальше переднее крыло до фары. Двери - по
  // своим деталям, поэтому печать идёт ровно по их контуру; крылья - по
  // кузову, вместе с аркой: колёса и фары не кузов, их печать не трогает.
  // Снизу крылья и боковины кончаются над бампером (0.5): боковые концы
  // бамперов отданы под стикеры.
  { code: "van_side_r", label: "R side panel", height: at(1.175), azimuth: 0, shift: len(-1.7675), size: [len(1.365), len(1.35)], wrap: true, parts: BODY },
  { code: "van_sliding", label: "R sliding door", height: at(0.98), azimuth: 0, shift: len(-0.475), size: [len(1.2), len(1.62)], wrap: true, parts: SLIDING_R, reach: DOOR_REACH },
  { code: "van_door_r", label: "R door", height: at(0.965), azimuth: 0, shift: len(0.655), size: [len(1.04), len(1.61)], wrap: true, parts: FRONT_R, reach: DOOR_REACH },
  { code: "van_fender_r", label: "R fender", height: at(0.85), azimuth: 0, shift: len(1.765), size: [len(1.16), len(0.7)], wrap: true, parts: BODY },
  // Левый борт - то же зеркально: плюс сдвига - к корме.
  { code: "van_side_l", label: "L side panel", height: at(1.175), azimuth: 180, shift: len(1.7675), size: [len(1.365), len(1.35)], wrap: true, parts: BODY },
  { code: "van_sliding_l", label: "L sliding door", height: at(0.98), azimuth: 180, shift: len(0.475), size: [len(1.2), len(1.62)], wrap: true, parts: SLIDING_L, reach: DOOR_REACH },
  { code: "van_door_l", label: "L door", height: at(0.965), azimuth: 180, shift: len(-0.655), size: [len(1.04), len(1.61)], wrap: true, parts: FRONT_L, reach: DOOR_REACH },
  { code: "van_fender_l", label: "L fender", height: at(0.85), azimuth: 180, shift: len(-1.765), size: [len(1.16), len(0.7)], wrap: true, parts: BODY },
  // Корма: задняя дверь целиком, со стеклом.
  { code: "van_rear", label: "Rear", height: at(1.135), azimuth: -90, shift: 0, size: [len(1.82), len(1.35)], wrap: true, parts: TAILGATE, reach: DOOR_REACH },
  // Сверху: сдвиг - вдоль машины, плюс - к переду. Логотип смотрит вперёд:
  // размер - поперёк машины и вдоль неё.
  { code: "van_hood", label: "Hood", height: 1, azimuth: 0, top: true, shift: len(2.06), size: [len(1.9), len(0.88)], wrap: true, parts: BODY },
  { code: "van_roof", label: "Roof", height: 1, azimuth: 0, top: true, shift: len(-0.8), size: [len(1.9), len(3.1)], wrap: true, parts: BODY },
];

/**
 * Стикеры - на бамперах, спереди и сзади поровну, по пятьдесят. Ячейки -
 * сеткой с шагом 10.5 см: стикер 10 на 10, между соседними полсантиметра.
 * Ряды - по ровной части бампера, в метрах модели:
 *
 * - перёд: под номером (0.37), по бокам от номера (0.475), под фарами
 *   (0.575), середина низа (0.265) - по краям низ уходит в воздухозаборник;
 * - корма: два ряда во всю ширину бампера (0.33, 0.435) и колонки под
 *   фонарями, сбоку от крышки багажника;
 * - боковые концы обоих бамперов - перед передними колёсами и за задними,
 *   до высоты 0.47: выше начинаются крылья и боковины, проданные оклейкой.
 *
 * Сдвиг у ячейки - как у места: на лице бампера - поперёк машины, на боку -
 * вдоль неё (плюс - к переду у правого борта, к корме у левого).
 *
 * Порядок ячеек перемешан один раз фиксированным зерном, а бамперы
 * чередуются: стикеры ложатся вразброс, и любые первые n покупок делятся
 * между бамперами поровну. Зерно в коде, а не случай при загрузке - у всех
 * зрителей стикер на одном и том же месте.
 */
const PITCH = 0.105;

function cells(azimuth: number, rows: { height: number; from: number; to: number }[]): StickerSlot[] {
  const out: StickerSlot[] = [];
  for (const row of rows) {
    for (let step = 0; row.from + step * PITCH <= row.to + 1e-9; step++) {
      const shift = Math.round((row.from + step * PITCH) * 1000) / 1000;
      out.push({ azimuth, height: at(row.height), shift: len(shift) });
    }
  }
  return out;
}

/** Перемешать по зерну: простой линейный конгруэнтный счётчик. */
function shuffled<T>(items: T[], seed: number): T[] {
  const out = items.slice();
  let state = seed;
  for (let at = out.length - 1; at > 0; at--) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const pick = state % (at + 1);
    [out[at], out[pick]] = [out[pick]!, out[at]!];
  }
  return out;
}

/** Боковой конец бампера: два ряда ниже крыльев и боковин. */
const bumperEnd = (from: number, to: number) => [
  { height: 0.31, from, to },
  { height: 0.415, from, to },
];

const FRONT_BUMPER = shuffled(
  [
    ...cells(90, [
      { height: 0.37, from: -0.735, to: 0.735 },
      { height: 0.475, from: -0.655, to: -0.34 },
      { height: 0.475, from: 0.34, to: 0.655 },
      { height: 0.575, from: -0.66, to: -0.45 },
      { height: 0.575, from: 0.45, to: 0.66 },
      { height: 0.265, from: -0.42, to: 0.42 },
    ]),
    ...cells(0, bumperEnd(2.06, 2.27)),
    ...cells(180, bumperEnd(-2.27, -2.06)),
  ],
  7,
);
const REAR_BUMPER = shuffled(
  [
    ...cells(-90, [
      { height: 0.33, from: -0.735, to: 0.735 },
      { height: 0.435, from: -0.735, to: 0.735 },
      { height: 0.53, from: -0.87, to: -0.87 },
      { height: 0.635, from: -0.87, to: -0.87 },
      { height: 0.53, from: 0.87, to: 0.87 },
      { height: 0.635, from: 0.87, to: 0.87 },
    ]),
    ...cells(0, bumperEnd(-2.315, -2.0)),
    ...cells(180, bumperEnd(2.0, 2.315)),
  ],
  11,
);

// Ячеек с каждой стороны поровну: лишние на одном бампере сбили бы ровный
// счёт в конце листа.
export const VAN_STICKER_SLOTS: StickerSlot[] = FRONT_BUMPER.slice(0, REAR_BUMPER.length).flatMap((front, at) =>
  REAR_BUMPER[at] ? [front, REAR_BUMPER[at]!] : [],
);

export const VAN: Shape = {
  // Версия в адресе: под этим же именем раньше лежал Sprinter, и Cloudflare
  // отдавал на лендинге его кэш недельной давности вместо V-Class.
  model: "/models/van.glb?v=vclass",
  spots: VAN_SPOTS,
  // Панели плоские, капот под наклоном: коробки хватает на скат капота, а
  // на другой борт через всю ширину она не достаёт.
  depth: 0.05,
  cloth: false,
  noun: "van",
  // Печать - только на кузов и стёкла: колёса, фары, решётка под зонами
  // остаются как есть.
  surfaces: ["carpaint", "windowglass"],
  // На чёрном кузове лучше всего читается белый, как плёнка оклейки;
  // выбранная зона - фиолетовым, как подсветка выбора в интерфейсе.
  mark: { idle: 0xffffff, hot: 0x7b6cf6 },
  stickers: { slots: VAN_STICKER_SLOTS, centimeter: len(0.01) },
};
