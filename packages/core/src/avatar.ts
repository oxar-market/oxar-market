// Аватарка по хэндлу: буква и цвет подложки.
//
// Аккаунты X мы не подключали, картинки взять неоткуда - буква честнее чужой
// заглушки. Цвет обязан быть детерминированным: один и тот же человек должен
// выглядеть одинаково в вебе, в приложении и в списке ставок, иначе его
// перестают узнавать в лицо.

/** Палитра подложек. Порядок значим: он входит в выбор цвета. */
export const AVATAR_TONES = [
  "#5a90d2",
  "#4aada1",
  "#ef7f4f",
  "#8a6fd1",
  "#c98a3d",
  "#c96a8a",
];

/** Цвет подложки под хэндл. Один хэндл - всегда один цвет. */
export function avatarTone(handle: string): string {
  let hash = 0;
  for (const char of handle) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

/** Буква в кружке. Пустой хэндл буквы не даёт - кружок остаётся пустым. */
export function avatarLetter(handle: string): string {
  return handle.trim().replace(/^@/, "").slice(0, 1).toUpperCase();
}
