/**
 * Профиль человека в кабинете и охват его пропуска. Правила полей те же, что
 * у колонок public_profiles в базе: экран не пустит то, что база отобьёт.
 */
import { BRAND_MAX, cleanBrand } from "./auction.ts";
import { cleanHandle } from "./handle.ts";

/** Имя вместо кошелька - не длиннее этого. */
export const NAME_MAX = 40;

export type ProfileInput = { name: string; brand: string; x: string };
export type ProfileRow = { display_name: string | null; brand: string | null; x_handle: string | null };

/** Пустое поле - «не указано»; непустое и неверное - ошибка с причиной. */
export function cleanProfile(input: ProfileInput): { ok: true; value: ProfileRow } | { ok: false; error: string } {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length > NAME_MAX) return { ok: false, error: `Name is longer than ${NAME_MAX} characters.` };
  const brand = input.brand.trim() ? cleanBrand(input.brand) : null;
  if (input.brand.trim() && !brand) return { ok: false, error: `Brand is longer than ${BRAND_MAX} characters.` };
  const x = input.x.trim() ? cleanHandle(input.x) : null;
  if (input.x.trim() && !x) return { ok: false, error: "X handle is letters, digits and _, up to 15." };
  return { ok: true, value: { display_name: name || null, brand, x_handle: x } };
}

/** Охват вещи: сколько людей увидели посты о ней; checked - посчитано, а не оценка. */
export type ThingReach = { reach: number | null; checked: boolean };

/**
 * Охват пропуска - сумма охватов вещей, где стоял логотип человека, каждая
 * вещь один раз. Вещь без цифры не считается. Если хоть одна цифра - оценка,
 * оценка и сумма.
 */
export function passReach(
  won: string[],
  reach: Record<string, ThingReach | undefined>,
): { total: number; lines: { thingId: string; reach: number }[]; estimated: boolean } {
  const lines = [...new Set(won)]
    .map((thingId) => ({ thingId, known: reach[thingId] }))
    .filter((one) => one.known && one.known.reach != null && one.known.reach > 0)
    .map((one) => ({ thingId: one.thingId, reach: one.known!.reach!, checked: one.known!.checked }))
    .sort((a, b) => b.reach - a.reach);
  return {
    total: lines.reduce((sum, one) => sum + one.reach, 0),
    lines: lines.map(({ thingId, reach }) => ({ thingId, reach })),
    estimated: lines.some((one) => !one.checked),
  };
}
