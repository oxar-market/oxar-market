// Аватарка по хэндлу: буква.
//
// Аккаунты X мы не подключали, картинки взять неоткуда - буква честнее чужой
// заглушки.

/** Буква в кружке. Пустой хэндл буквы не даёт - кружок остаётся пустым. */
export function avatarLetter(handle: string): string {
  return handle.trim().replace(/^@/, "").slice(0, 1).toUpperCase();
}
