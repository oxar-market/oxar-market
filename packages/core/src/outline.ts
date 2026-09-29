/**
 * Контур места, обведённый пальцем или мышью.
 *
 * Точки - доли кадра снимка, как и прямоугольник места: снимок показывают
 * разного размера, а контур обязан остаться на той же части вещи. Рука
 * даёт сотни точек с дрожью; хранить и рисовать их незачем, поэтому контур
 * упрощается до углов.
 */

export type Point = [number, number];
export type Box = { x: number; y: number; w: number; h: number };

/** Больше точек контуру не нужно: глазу хватает, а строка в базе короткая. */
export const OUTLINE_MAX = 64;

/** Описанный прямоугольник: по нему место живёт там, где контур не нужен. */
export function outlineBox(points: Point[]): Box {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function distance(point: Point, a: Point, b: Point): number {
  const [px, py] = point;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  if (length === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Дуглас - Пекер: остаются точки, отстоящие от прямой дальше допуска. */
function reduce(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let far = 0;
  let at = 0;
  for (let index = 1; index < points.length - 1; index++) {
    const away = distance(points[index]!, first, last);
    if (away > far) {
      far = away;
      at = index;
    }
  }
  if (far <= tolerance) return [first, last];
  return [...reduce(points.slice(0, at + 1), tolerance).slice(0, -1), ...reduce(points.slice(at), tolerance)];
}

/**
 * Упростить контур: убрать точки на прямых и дрожь руки, оставить углы.
 * Фигура - это хотя бы три точки, и не больше OUTLINE_MAX: если допуска
 * мало, он растёт, пока контур не уложится.
 */
export function simplifyOutline(points: Point[], tolerance: number): Point[] {
  let step = tolerance;
  let out = reduce(points, step);
  while (out.length > OUTLINE_MAX) {
    step *= 1.5;
    out = reduce(points, step);
  }
  if (out.length < 3 && points.length >= 3) {
    // Почти прямая: берём концы и самую дальнюю от них точку.
    const first = points[0]!;
    const last = points[points.length - 1]!;
    let far = points[1]!;
    for (const point of points) if (distance(point, first, last) > distance(far, first, last)) far = point;
    out = [first, far, last];
  }
  return out;
}

/** Точки в процентах своей рамки - так их берут SVG и clip-path. */
export function outlineInBox(points: Point[], box: Box): Point[] {
  const round = (value: number) => Math.round(value * 100) / 100;
  return points.map(([x, y]) => [
    round(box.w === 0 ? 0 : ((x - box.x) / box.w) * 100),
    round(box.h === 0 ? 0 : ((y - box.y) / box.h) * 100),
  ]);
}
