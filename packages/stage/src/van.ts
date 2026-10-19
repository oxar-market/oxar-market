import type { Shape, Spot } from "./spots.ts";

/**
 * Ван Solana Got Motion: Sprinter 2006, модель Max-7215 со Sketchfab (CC BY
 * 4.0). Перед на +X, правый борт со сдвижной дверью - к зрителю (азимут 0),
 * левый - азимут 180, корма - -90. Капот и крыша - места сверху.
 *
 * Границы панелей сняты с частей модели, в её метрах: длина 6.82 (вместе с
 * подножкой сзади), высота 2.56. Двери кабины от 1.08 до 2.17 вдоль машины,
 * окно с 1.32 по высоте; переднее колесо на 2.42, заднее на -1.2; задние двери
 * от 0.49 до 2.42 по высоте; крыша на 2.56, лобовое кончается у 1.8. В сцене
 * длина 0.62, отсюда масштаб: метр модели - `M` единиц сцены.
 */
const M = 0.62 / 6.82;
const H = 2.555;
/** Высота места: доля габарита по высоте, из метров модели. */
const at = (meters: number) => Math.round((meters / H) * 1000) / 1000;
const len = (meters: number) => Math.round(meters * M * 1000) / 1000;

export const VAN_SPOTS: Spot[] = [
  // Правый борт. Сдвижная дверь и грузовой борт - одной полосой над ручкой
  // двери и над хромовой планкой салазок (1.38): ниже наклейка легла бы на них.
  { code: "van_sliding", label: "Sliding door", height: at(1.725), azimuth: 0, shift: len(0.22), size: [len(1.2), len(0.55)] },
  { code: "van_side_r", label: "Side panel passenger", height: at(1.725), azimuth: 0, shift: len(-1.275), size: [len(1.35), len(0.55)] },
  // Двери кабины: между ручкой (1.2) и чёрной полосой понизу (до 0.75).
  { code: "van_door_r", label: "R door", height: at(0.98), azimuth: 0, shift: len(1.55), size: [len(0.8), len(0.32)] },
  // Крыло: над аркой колеса, позади фары, под косой линией капота.
  { code: "van_fender_r", label: "R fender", height: at(1.06), azimuth: 0, shift: len(2.45), size: [len(0.46), len(0.2)] },
  // Левый борт: плюс сдвига - к корме, зритель смотрит с другой стороны.
  // Грузовой борт целиком - от двери кабины до фонаря, над чёрной полосой.
  { code: "van_side_l", label: "Side panel driver", height: at(1.435), azimuth: 180, shift: len(0.6), size: [len(2.8), len(1.17)] },
  { code: "van_door_l", label: "L door", height: at(0.98), azimuth: 180, shift: len(-1.55), size: [len(0.8), len(0.32)] },
  { code: "van_fender_l", label: "L fender", height: at(1.06), azimuth: 180, shift: len(-2.45), size: [len(0.46), len(0.2)] },
  // Корма: створки над звездой (до 1.45), фонари и ручка ниже. Луч - чуть
  // вбок от середины: ровно в середине щель между створками.
  { code: "van_rear", label: "Rear", height: at(1.76), azimuth: -90, shift: len(0.03), size: [len(1.3), len(0.48)] },
  // Сверху: сдвиг - вдоль машины, плюс - к переду. Логотип смотрит вперёд:
  // размер - поперёк машины и вдоль неё.
  // Капот - между решётками воздухозаборника, лобовое стекло не задевает.
  { code: "van_hood", label: "Hood", height: 1, azimuth: 0, top: true, shift: len(2.93), size: [len(0.54), len(0.46)] },
  // Скат высокой крыши над лобовым и сама крыша за ним, с ребром на 1.0.
  { code: "van_roof_front", label: "Front roof", height: 1, azimuth: 0, top: true, shift: len(1.335), size: [len(1.4), len(0.63)] },
  { code: "van_roof", label: "Roof", height: 1, azimuth: 0, top: true, shift: len(-0.575), size: [len(1.5), len(2.95)] },
];

export const VAN: Shape = {
  model: "/models/van.glb",
  spots: VAN_SPOTS,
  // Панели плоские, капот под наклоном: коробки хватает на скат капота, а
  // на другой борт через всю ширину она не достаёт.
  depth: 0.05,
  cloth: false,
  noun: "van",
};
