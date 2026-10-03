/**
 * Контур места. Новые места размечаются рамкой, но у прежних в базе лежит
 * обведённый контур, и его по-прежнему рисуют.
 *
 * Точки - доли кадра снимка, как и прямоугольник места: снимок показывают
 * разного размера, а контур обязан остаться на той же части вещи.
 */

export type Point = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

/** Точки в процентах своей рамки - так их берут SVG и clip-path. */
export function outlineInBox(points: Point[], box: Box): Point[] {
  const round = (value: number) => Math.round(value * 100) / 100;
  return points.map(([x, y]) => [
    round(box.w === 0 ? 0 : ((x - box.x) / box.w) * 100),
    round(box.h === 0 ? 0 : ((y - box.y) / box.h) * 100),
  ]);
}
