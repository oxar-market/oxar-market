import type { Spot } from "./spots.ts";

/** Доворот от грани, в радианах: вполоборота вещь читается объёмом, а не плоской. */
const QUARTER = 0.35;
/** Взгляд чуть сверху: у вещей на земле так видно и крышу, и борт. */
const ABOVE = 0.3;

/**
 * С какой стороны смотреть на вещь, чтобы были видны её проданные места.
 *
 * Так же, как сцена торга встаёт к первому месту: к грани, на которой лежит
 * первое проданное место (угол округляется до грани, потому что внутри грани
 * угол служит ещё и сдвигом вбок), плюс доворот и взгляд сверху. Места сверху
 * (капот, крыша) грань не выбирают: их видно с любой стороны.
 *
 * Возвращает единичный вектор от центра вещи к зрителю.
 */
export function facing(spots: Spot[], sold: (code: string) => boolean): [number, number, number] {
  const first = spots.find((spot) => !spot.top && sold(spot.code));
  const face = (Math.round((first?.azimuth ?? 0) / 90) * 90 * Math.PI) / 180 + QUARTER;
  const x = Math.sin(face);
  const z = Math.cos(face);
  const len = Math.hypot(x, ABOVE, z);
  return [x / len, ABOVE / len, z / len];
}
