import type { CSSProperties } from "react";

/**
 * Кто вошёл - для шапки. На лендинге Privy нет, поэтому приложение после
 * входа оставляет здесь букву и зерно цвета аватара, а при выходе стирает.
 * Это только подсказка для шапки: ни ключей, ни сессии в ней нет.
 */
/** img - своя картинка профиля, если загружена: тогда вместо буквы она. */
export type Me = { letter: string; seed: string; img?: string | null };

const KEY = "oxar.me";

export function readMe(): Me | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    const me = raw ? (JSON.parse(raw) as Me) : null;
    return me && typeof me.letter === "string" && typeof me.seed === "string" && (me.img == null || typeof me.img === "string") ? me : null;
  } catch {
    return null;
  }
}

export function saveMe(me: Me | null) {
  try {
    if (me) window.localStorage.setItem(KEY, JSON.stringify(me));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Хранилище закрыто (приватный режим) - шапка просто покажет «Log in».
  }
}

/** Аватар из адреса или почты: свой цвет у каждого, без картинок. */
export function avatar(seed: string): CSSProperties {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return { background: `linear-gradient(135deg, hsl(${hash} 70% 62%), hsl(${(hash + 50) % 360} 70% 45%))` };
}
