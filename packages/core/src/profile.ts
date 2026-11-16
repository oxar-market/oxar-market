/**
 * Профиль человека в кабинете и охват его пропуска. Правила полей те же, что
 * у колонок public_profiles в базе: экран не пустит то, что база отобьёт.
 */
import { BRAND_MAX, cleanBrand } from "./auction.ts";
import { cleanHandle } from "./handle.ts";

/** Имя вместо кошелька - не длиннее этого. */
export const NAME_MAX = 40;

/**
 * Имя стоит в рейтинге на месте кошелька, поэтому не может им выглядеть, и
 * не может прятать невидимые знаки («Ali\u200Bce» выглядит как «Alice»). Те
 * же правила - у колонки в базе.
 */
const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SHORT_WALLET = /^[1-9A-HJ-NP-Za-km-z]{2,8}(\.{2,3}|…)[1-9A-HJ-NP-Za-km-z]{2,8}$/;
// Невидимые - управляющие, форматные и все Default_Ignorable, плюс пустая
// клетка Брайля: она не «ignorable», но рисуется пустотой.
export const INVISIBLE = /[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2800]/u;

export type ProfileInput = { name: string; brand: string; x: string };
export type ProfileRow = { display_name: string | null; brand: string | null; x_handle: string | null };

/** Пустое поле - «не указано»; непустое и неверное - ошибка с причиной. */
export function cleanProfile(input: ProfileInput): { ok: true; value: ProfileRow } | { ok: false; error: string } {
  // Широкие и составные буквы - к обычным: так же база сравнивает занятость.
  const name = input.name.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (name.length > NAME_MAX) return { ok: false, error: `Name is longer than ${NAME_MAX} characters.` };
  if (WALLET.test(name) || SHORT_WALLET.test(name)) return { ok: false, error: "A name can't look like a wallet." };
  if (INVISIBLE.test(name) || INVISIBLE.test(input.brand)) return { ok: false, error: "Remove invisible characters." };
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
