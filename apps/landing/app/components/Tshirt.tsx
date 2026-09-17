"use client";

import { Surface3D, type Spot, type SurfaceSpec } from "./Surface3D";

/**
 * Футболка: разметка и слова. Всё поведение - в Surface3D.
 *
 * Мест в каталоге одиннадцать: на боках, `tshirt_side_left` и
 * `tshirt_side_right`, здесь зон нет. Реклама на талии не нужна - её не видно
 * ни на фото, ни в жизни, потому что там рука. Имена в каталоге оставлены: если
 * место передумают продавать совсем, это правка каталога, а не вида.
 *
 * Числа ниже сняты с самой модели лучами, а не подобраны на глаз, и держатся на
 * трёх правилах.
 *
 * Первое: рукав начинается выше 0.55 роста. Горизонтальный луч на 90 градусах
 * попадает в торс, пока высота ниже, и в рукав, когда выше - на 0.6 точка
 * касания скачет с x=0.14 на x=0.27. Прежние рукава стояли на 78 градусах, где
 * луч идёт по касательной к подмышке (совпадение нормали и луча 0.28 против
 * 0.97 на 98 градусах) - оттуда и бралась косая метка под мышкой. Поэтому
 * рукава здесь на 98.
 *
 * Второе: ниже 0.34 роста ткань уходит раструбом, и нормаль заваливается вниз -
 * на высотах 0.24-0.30 она даёт до -0.5 по вертикали, и рамка вставала косо.
 * Поэтому у подола зон нет вовсе, нижние стоят на 0.42-0.47.
 *
 * Третье: форм всего три - крупная печать, квадрат под логотип и полоска на
 * загривке. Перёд и спина устроены одинаково: печать, под ней пара квадратов,
 * ниже ничего. Разнобой размеров, который был тут до этого, читался как случайно
 * разбросанные пятна, а одинаковый квадрат - как место под логотип. Спереди
 * квадрат чуть крупнее заднего, и это единственное отличие сторон.
 */

/** Место под логотип на спине, в единицах модели. */
const BADGE: [number, number] = [0.06, 0.06];
/** Спереди пара крупнее: её видит собеседник, спину - прохожий. */
const BADGE_FRONT: [number, number] = [0.072, 0.072];
/** Рукав чуть шире квадрата: там места по высоте меньше, чем по длине. */
const SLEEVE: [number, number] = [0.075, 0.055];
/** Разворот пары под большой печатью. На ±22 между квадратами остаётся просвет. */
const PAIR = 22;

const SPOTS: Spot[] = [
  // Перёд: печать на груди, под ней пара квадратов
  { id: "tshirt_chest", label: "Chest", height: 0.645, azimuth: 0, size: [0.17, 0.11] },
  { id: "tshirt_stomach", label: "Stomach", height: 0.47, azimuth: -PAIR, size: BADGE_FRONT },
  { id: "tshirt_hem_front", label: "Front hem", height: 0.47, azimuth: PAIR, size: BADGE_FRONT },
  // Рукава: на внешней стороне, оба одинаковые
  { id: "tshirt_sleeve_left", label: "Left sleeve", height: 0.72, azimuth: -98, size: SLEEVE },
  { id: "tshirt_sleeve_right", label: "Right sleeve", height: 0.72, azimuth: 98, size: SLEEVE },
  // Спина: то же самое, но печать крупнее - её видно дальше всего
  { id: "tshirt_back", label: "Back", height: 0.645, azimuth: 180, size: [0.2, 0.14] },
  { id: "tshirt_lower_back", label: "Lower back", height: 0.45, azimuth: 180 - PAIR, size: BADGE },
  { id: "tshirt_hem_back", label: "Back hem", height: 0.45, azimuth: 180 + PAIR, size: BADGE },
  { id: "tshirt_nape", label: "Nape", height: 0.82, azimuth: 180, size: [0.08, 0.03] },
];

const SHIRT: SurfaceSpec = {
  surface: "tshirt",
  model: "/models/shirt.glb",
  spots: SPOTS,
  // Было 0.12, и на этом боковые пятна заворачивались на перёд: коробка на боку
  // захватывала и переднюю поверхность тоже, потому что там ткань круто уходит
  // за угол. Ткань тонкая, ей хватает малого.
  depth: 0.07,
  // Модель приходит с запечённой текстурой чужого демо. Нам нужна чистая вещь:
  // на ней читаются наши места, а не чужой принт. Светлее прежнего, но не белая:
  // на чистом белом под этой выдержкой пропадают складки, а вместе с ними и
  // ощущение вещи.
  repaint: { color: 0xedeff3, roughness: 0.92 },
  words: {
    loading: "Loading the shirt…",
    idle: "Drag to turn the shirt. Tap a spot.",
    back: "Back to the shirt",
    forBuyer:
      "Every marked area is a surface you could rent - on a team shirt, a merch drop, a conference tee.",
    forSeller: "Every marked area is something a club or a team could rent out.",
    empty:
      "Nothing is up for auction on a shirt right now. A profile can be checked automatically, a shirt needs a photo and a place - that part is done by hand.",
  },
};

export function Tshirt({
  role,
  onWaitlist,
}: {
  role: "creator" | "advertiser";
  onWaitlist: () => void;
}) {
  return <Surface3D spec={SHIRT} role={role} onWaitlist={onWaitlist} />;
}
