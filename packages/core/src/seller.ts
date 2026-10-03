/**
 * Вещь продавца одной строкой состояния и аренда по дням.
 *
 * Состояние выводится из данных, а не хранится: хранимое разошлось бы с
 * лотами при первом же закрытии.
 */

export type ThingState = "declined" | "live" | "reviewing" | "proof" | "ended" | "rented" | "idle" | "preparing";

/** Лот вещи для её состояния. Миллисекунды; `proofBy` - null у торга до защиты покупателя. */
export type ThingLot = { status: string; closesAt: number; proofBy: number | null; proved: boolean };

/**
 * Где вещь сейчас. Лот «open» с прошедшим сроком - уже не торг: расчёт его
 * ещё не разобрал, но ставок он не принимает. Открытый торг вещи, которую
 * админ ещё не пустил на маркет, - ревью: покупатели его не видят.
 */
export function thingState(
  thing: { declined: boolean; preparing: boolean; rented: boolean; onMarket: boolean },
  lots: ThingLot[],
  now: number,
): ThingState {
  if (thing.declined) return "declined";
  if (thing.preparing) return "preparing";
  if (lots.some((lot) => lot.status === "open" && lot.closesAt > now)) return thing.onMarket ? "live" : "reviewing";
  if (proofDue(lots, now) !== null) return "proof";
  if (lots.some((lot) => ["won", "unsold", "refunded"].includes(lot.status) || (lot.status === "open" && lot.closesAt <= now))) {
    return "ended";
  }
  return thing.rented ? "rented" : "idle";
}

/**
 * До когда продавцу прислать пруф: ближайший срок выигранного места, у
 * которого пруфа ещё нет и срок не вышел (включительно, как в программе).
 * Нет такого - null.
 */
export function proofDue(lots: ThingLot[], now: number): number | null {
  const due = lots
    .filter((lot) => lot.status === "won" && lot.proofBy !== null && !lot.proved && lot.proofBy >= now)
    .map((lot) => lot.proofBy as number);
  return due.length ? Math.min(...due) : null;
}

/** Сколько дней аренды: последний день входит в срок, «1 - 14 окт» - это 14. */
export function rentDays(startsOn: string, endsOn: string): number {
  return Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000) + 1;
}

/** Сколько стоит аренда целиком, в центах. */
export function rentTotalCents(startsOn: string, endsOn: string, perDayCents: number): number {
  return rentDays(startsOn, endsOn) * perDayCents;
}
