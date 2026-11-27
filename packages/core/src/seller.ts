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

/** Пять шагов торга продавца во вкладке Sales - по порядку. */
export const SALE_STEPS = ["Set up", "Live", "Print", "Proof", "Paid"] as const;

/** Что продавцу сделать на шаге: подписать, открыть торг, скачать логотипы, прислать пруф. */
export type SaleAction = "sign" | "open" | "download" | "proof";

/** Что известно о торге вещи, кроме состояния: всё из данных, кроме `downloaded`. */
export type SaleFacts = {
  state: ThingState;
  /** Есть черновики лотов: мы подготовили торг, его осталось подписать. */
  drafts: boolean;
  /** Сколько мест ушли с победителем. */
  wonSpots: number;
  /** Торг с защитой покупателя: выплата после пруфа и 72 часов. */
  lockup: boolean;
  /** Пруф прислан. */
  proved: boolean;
  /** Каждое выигранное место разобрано в программе. */
  settled: boolean;
  /** Деньги вернули победителям мимо программы. */
  refunded: boolean;
  /** Продавец скачал логотипы на этом устройстве - в базе этого нет. */
  downloaded: boolean;
};

/**
 * Шаг торга продавца (1-5, см. SALE_STEPS), слово статуса и одно действие -
 * или ни одного, когда ход не за ним. Печать от пруфа отличает только то,
 * скачаны ли логотипы: флага «напечатано» в базе нет.
 */
export function saleStage(facts: SaleFacts): { step: number; status: string; action: SaleAction | null } {
  const { state } = facts;
  if (state === "declined") return { step: 1, status: "Not approved", action: null };
  if (state === "preparing") return { step: 1, status: "Setting up", action: null };
  if (state === "idle") {
    return facts.drafts ? { step: 1, status: "Ready to sign", action: "sign" } : { step: 1, status: "Draft", action: null };
  }
  if (state === "live") return { step: 2, status: "Live", action: "open" };
  if (state === "reviewing") return { step: 2, status: "In review", action: "open" };
  if (state === "rented") return { step: 2, status: "Rented", action: null };
  if (facts.refunded) return { step: 5, status: "Refunded", action: null };
  if (state === "proof") {
    return facts.downloaded
      ? { step: 4, status: "Proof due", action: "proof" }
      : { step: 3, status: "Print logos", action: "download" };
  }
  // Закрыт и пруфа больше не ждёт.
  if (facts.wonSpots === 0) return { step: 2, status: "No bids", action: null };
  if (facts.lockup && !facts.proved) return { step: 4, status: "Proof missed", action: null };
  if (facts.lockup && !facts.settled) return { step: 4, status: "Proof sent", action: null };
  // Деньги у продавца: без защиты - с закрытия, с защитой - после разбора.
  if (!facts.lockup && !facts.downloaded) return { step: 3, status: "Print logos", action: "download" };
  return { step: 5, status: "Paid", action: null };
}

/** Сколько дней аренды: последний день входит в срок, «1 - 14 окт» - это 14. */
export function rentDays(startsOn: string, endsOn: string): number {
  return Math.round((Date.parse(endsOn) - Date.parse(startsOn)) / 86_400_000) + 1;
}

/** Сколько стоит аренда целиком, в центах. */
export function rentTotalCents(startsOn: string, endsOn: string, perDayCents: number): number {
  return rentDays(startsOn, endsOn) * perDayCents;
}
