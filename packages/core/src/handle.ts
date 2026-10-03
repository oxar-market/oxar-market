/**
 * Хэндл - имя на маркете: «Sold by @name». Правила те же, что у колонки в
 * базе: латиница, цифры, подчёркивание, до пятнадцати знаков. «@» впереди -
 * не часть имени, его дописывает экран.
 */
export const HANDLE_MAX = 15;

const HANDLE = /^[A-Za-z0-9_]{1,15}$/;

/** Хэндл из того, что набрал человек: без «@» и пробелов. Не хэндл - null. */
export function cleanHandle(raw: string): string | null {
  const value = raw.trim().replace(/^@+/, "");
  return HANDLE.test(value) ? value : null;
}

/** То, что поле ввода оставляет при наборе: только допустимые знаки. */
export function handleInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_]/g, "").slice(0, HANDLE_MAX);
}
