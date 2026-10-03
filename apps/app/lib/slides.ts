/**
 * Арифметика листания: карусель маркета и просмотр фото. Без DOM - чтобы
 * проверялась тестом, а не глазами на телефоне.
 */

/**
 * Где карусели положено стоять. iPhone умеет оставить ленту посреди двух
 * слайдов: если плавную прокрутку оборвать, привязка к слайду не срабатывает.
 * Тогда `off` - и ленту доводим до ближайшего слайда сами.
 */
export function restingSlide(
  scrollLeft: number,
  width: number,
  count: number,
): { index: number; left: number; off: boolean } {
  if (width <= 0 || count <= 0) return { index: 0, left: 0, off: false };
  const index = Math.min(count - 1, Math.max(0, Math.round(scrollLeft / width)));
  const left = index * width;
  // Пиксель - допуск на округление: ширина бывает дробной, scrollLeft - нет.
  return { index, left, off: Math.abs(scrollLeft - left) > 1 };
}

/** Соседнее фото по кругу: с последнего вперёд - на первое. */
export function stepIndex(at: number, by: number, count: number): number {
  return (((at + by) % count) + count) % count;
}

/** Свайп по фото: влево - следующее, вправо - предыдущее, мелкое движение - тап. */
export function swipeStep(dx: number, threshold = 40): -1 | 0 | 1 {
  if (dx <= -threshold) return 1;
  if (dx >= threshold) return -1;
  return 0;
}
