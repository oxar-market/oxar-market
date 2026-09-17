"use client";

/**
 * Откуда открылось окно.
 *
 * Если что-то исчезло в одну сторону, мы ждём, что оно оттуда же и появится.
 * На рабочем столе это значит: окно вырастает из иконки, по которой нажали, а
 * не из середины экрана. Без этого связь между значком и окном приходится
 * додумывать.
 *
 * Точка живёт в модуле, а не в состоянии: её читает только само окно и только
 * один раз при появлении, а ре-рендер ради неё был бы лишним. Проп пришлось бы
 * протаскивать через восемь вызовов Window.
 */
let point: { x: number; y: number } | null = null;

export function rememberOpenPoint(event: { clientX: number; clientY: number }): void {
  point = { x: event.clientX, y: event.clientY };
}

/** Точка нажатия или ничего, если окно открыли не указателем - с клавиатуры. */
export function takeOpenPoint(): { x: number; y: number } | null {
  const taken = point;
  point = null;
  return taken;
}
