import { hasOpened } from "@oxar/core";

/** Часы торга на маркете: сколько осталось и какой строкой это сказать. */

/** Сколько осталось до момента: крупно дни, дальше часы-минуты-секунды. */
export function left(until: number, now: number): string {
  const s = Math.max(0, Math.floor((until - now) / 1000));
  const d = Math.floor(s / 86_400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}

/**
 * Строка часов в карточке героя. До открытия - когда откроется, дальше -
 * когда закроется; красная точка - последние сутки торга.
 */
export function heroClock(
  opensAt: number | null,
  closesAt: number,
  now: number,
): { text: string; urgent: boolean } {
  if (opensAt !== null && !hasOpened(opensAt, now)) {
    return { text: `Opens in ${left(opensAt, now)}`, urgent: false };
  }
  return { text: `Closes in ${left(closesAt, now)}`, urgent: closesAt - now < 86_400_000 };
}
