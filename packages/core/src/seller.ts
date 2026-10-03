/**
 * Вещь продавца одной строкой состояния и аренда по дням.
 *
 * Состояние выводится из данных, а не хранится: хранимое разошлось бы с
 * лотами при первом же закрытии.
 */

export type ThingState = "declined" | "live" | "ended" | "rented" | "idle" | "preparing";

/**
 * Где вещь сейчас. Лот «open» с прошедшим сроком - уже не торг: расчёт его
 * ещё не разобрал, но ставок он не принимает. Миллисекунды.
 */
export function thingState(
  thing: { declined: boolean; preparing: boolean; rented: boolean },
  lots: { status: string; closesAt: number }[],
  now: number,
): ThingState {
  if (thing.declined) return "declined";
  if (thing.preparing) return "preparing";
  if (lots.some((lot) => lot.status === "open" && lot.closesAt > now)) return "live";
  if (lots.some((lot) => ["won", "unsold", "refunded"].includes(lot.status) || (lot.status === "open" && lot.closesAt <= now))) {
    return "ended";
  }
  return thing.rented ? "rented" : "idle";
}

/** Сколько дней аренды: последний день входит в срок, «1 - 14 окт» - это 14. */
export function rentDays(startsOn: string, endsOn: string): number {
  return Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000) + 1;
}

/** Сколько стоит аренда целиком, в центах. */
export function rentTotalCents(startsOn: string, endsOn: string, perDayCents: number): number {
  return rentDays(startsOn, endsOn) * perDayCents;
}
