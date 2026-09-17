"use client";

/**
 * Пружина на requestAnimationFrame.
 *
 * Нужна там, где движение начинается с руки: бросок иконки, возврат листа. У
 * перехода на CSS фиксированная длительность и своя начальная скорость - ноль,
 * поэтому в момент отпускания видно склейку: палец вёл быстро, а анимация
 * стартует с места. Пружина принимает скорость пальца как начальную, и шва нет.
 *
 * Второе, ради чего она: её можно прервать. Схватил летящую иконку - зовём
 * stop(), и движение продолжается от того места, где оно было, а не с прыжка
 * на конечную точку.
 *
 * Параметры как у Apple - не жёсткость с массой, а два понятных числа:
 * `damping` 1 это без перелёта, меньше единицы - с перелётом; `response` -
 * за сколько секунд значение доходит до цели.
 */

export type Spring = {
  from: number;
  to: number;
  /** Скорость пальца в момент отпускания, px/s. */
  velocity: number;
  damping?: number;
  response?: number;
  onFrame: (value: number) => void;
  onDone?: () => void;
};

/** Меньше этого расстояния и этой скорости движение уже не видно. */
const REST_DISTANCE = 0.3;
const REST_SPEED = 20;

export function spring({
  from,
  to,
  velocity,
  damping = 1,
  response = 0.4,
  onFrame,
  onDone,
}: Spring): () => void {
  // Кому мешает движение, тот получает результат сразу: это то же правило, что
  // и для остальных анимаций, только пружину нельзя «замедлить до цвета».
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    onFrame(to);
    onDone?.();
    return () => {};
  }

  const w = (2 * Math.PI) / response;
  const a = from - to;
  let raf = 0;
  let last = from;
  let startedAt = 0;

  const value = solve(a, velocity, w, damping);

  const step = (now: number) => {
    if (!startedAt) startedAt = now;
    const t = (now - startedAt) / 1000;
    const next = to + value(t);

    onFrame(next);

    // Останавливаемся по расстоянию и скорости сразу: одного расстояния мало,
    // на пути к цели пружина проходит через неё с полного хода.
    const speed = Math.abs(next - last) * 60;
    last = next;
    if (Math.abs(next - to) < REST_DISTANCE && speed < REST_SPEED) {
      onFrame(to);
      onDone?.();
      return;
    }
    raf = requestAnimationFrame(step);
  };

  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/**
 * Точное решение уравнения пружины, а не пошаговое интегрирование: при
 * пропущенном кадре шаг становится большим, и численный метод разносит.
 */
function solve(a: number, v: number, w: number, damping: number) {
  if (damping >= 1) {
    const b = v + w * a;
    return (t: number) => (a + b * t) * Math.exp(-w * t);
  }
  const wd = w * Math.sqrt(1 - damping * damping);
  const c = (v + damping * w * a) / wd;
  return (t: number) =>
    Math.exp(-damping * w * t) * (a * Math.cos(wd * t) + c * Math.sin(wd * t));
}
