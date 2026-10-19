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
  // Правый борт: сдвижная дверь и грузовой борт за ней.
  { code: "van_sliding", label: "Sliding door", height: at(1.47), azimuth: 0, shift: len(0.3), size: [len(1.2), len(1.3)] },
  { code: "van_side_r", label: "Side panel passenger", height: at(1.47), azimuth: 0, shift: len(-1.375), size: [len(1.6), len(1.3)] },
  { code: "van_door_r", label: "R door", height: at(0.85), azimuth: 0, shift: len(1.62), size: [len(0.85), len(0.6)] },
  { code: "van_fender_r", label: "R fender", height: at(1.0), azimuth: 0, shift: len(2.62), size: [len(0.5), len(0.3)] },
  // Левый борт: плюс сдвига - к корме, зритель смотрит с другой стороны.
  { code: "van_side_l", label: "Side panel driver", height: at(1.47), azimuth: 180, shift: len(0.65), size: [len(3.0), len(1.3)] },
  { code: "van_door_l", label: "L door", height: at(0.85), azimuth: 180, shift: len(-1.62), size: [len(0.85), len(0.6)] },
  { code: "van_fender_l", label: "L fender", height: at(1.0), azimuth: 180, shift: len(-2.62), size: [len(0.5), len(0.3)] },
  // Корма: распашные двери над фонарями и ручкой. Луч - чуть вбок от
  // середины: ровно в середине щель между створками, и он пролетал в салон.
  { code: "van_rear", label: "Rear", height: at(1.6), azimuth: -90, shift: len(0.2), size: [len(1.4), len(1.2)] },
  // Сверху: сдвиг - вдоль машины, плюс - к переду. Размер - вдоль и поперёк.
  { code: "van_hood", label: "Hood", height: 1, azimuth: 0, top: true, shift: len(2.78), size: [len(0.7), len(1.4)] },
  { code: "van_roof_front", label: "Front roof", height: 1, azimuth: 0, top: true, shift: len(1.15), size: [len(1.0), len(1.6)] },
  { code: "van_roof", label: "Roof", height: 1, azimuth: 0, top: true, shift: len(-0.85), size: [len(2.6), len(1.6)] },
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
