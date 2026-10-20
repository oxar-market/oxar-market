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
  // Оклейка: каждое место - панель целиком, зоны стыкуются без промежутков,
  // как у печати по всему вану. Борта - от чёрной полосы понизу (0.76) до
  // края крыши (2.42); двери кабины - под окном; корма - обе створки, не
  // заходя на скругление к бортам;
  // капот и крыша - по ровной части. На скруглениях печать рвалась пилой,
  // поэтому зоны до них не доходят. Стёкла, фары, колёса и бампер не трогаем.
  // Правый борт.
  { code: "van_sliding", label: "Sliding door", height: at(1.59), azimuth: 0, shift: len(0.295), size: [len(1.53), len(1.66)], wrap: true },
  { code: "van_side_r", label: "Side panel passenger", height: at(1.59), azimuth: 0, shift: len(-1.4), size: [len(1.84), len(1.66)], wrap: true },
  { code: "van_door_r", label: "R door", height: at(1.035), azimuth: 0, shift: len(1.625), size: [len(1.09), len(0.55)], wrap: true },
  { code: "van_fender_r", label: "R fender", height: at(1.1), azimuth: 0, shift: len(2.515), size: [len(0.69), len(0.3)], wrap: true },
  // Левый борт: плюс сдвига - к корме, зритель смотрит с другой стороны.
  { code: "van_side_l", label: "Side panel driver", height: at(1.59), azimuth: 180, shift: len(0.63), size: [len(3.38), len(1.66)], wrap: true },
  { code: "van_door_l", label: "L door", height: at(1.035), azimuth: 180, shift: len(-1.625), size: [len(1.09), len(0.55)], wrap: true },
  { code: "van_fender_l", label: "L fender", height: at(1.1), azimuth: 180, shift: len(-2.515), size: [len(0.69), len(0.3)], wrap: true },
  // Корма: обе створки от бампера до верха. Луч - чуть вбок от середины:
  // ровно в середине щель между створками.
  { code: "van_rear", label: "Rear", height: at(1.46), azimuth: -90, shift: len(0.03), size: [len(1.5), len(1.68)], wrap: true },
  // Сверху: сдвиг - вдоль машины, плюс - к переду. Логотип смотрит вперёд:
  // размер - поперёк машины и вдоль неё.
  { code: "van_hood", label: "Hood", height: 1, azimuth: 0, top: true, shift: len(2.99), size: [len(1.6), len(0.74)], wrap: true },
  { code: "van_roof_front", label: "Front roof", height: 1, azimuth: 0, top: true, shift: len(1.39), size: [len(1.66), len(0.78)], wrap: true },
  { code: "van_roof", label: "Roof", height: 1, azimuth: 0, top: true, shift: len(-0.68), size: [len(1.66), len(3.36)], wrap: true },
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
