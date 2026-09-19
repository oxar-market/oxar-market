/**
 * Деньги считаем в центах целыми числами. Дроби в долларах дают ошибки
 * округления там, где потом расходятся выплата продавцу, возврат покупателю
 * и наша комиссия.
 */

/** Комиссия платформы: 10% с продавца, с покупателя ноль. */
export const FEE_RATE = 0.1;

export type Split = {
  /** сколько заплатил покупатель */
  grossCents: number;
  /** комиссия платформы */
  feeCents: number;
  /** сколько получит продавец */
  netCents: number;
};

/** Как делится сумма сделки, которая прошла полностью. */
export function splitPayout(grossCents: number): Split {
  assertWholeNonNegative(grossCents, "grossCents");
  const feeCents = Math.round(grossCents * FEE_RATE);
  return { grossCents, feeCents, netCents: grossCents - feeCents };
}

export type Settlement = {
  /** вся сумма сделки, базовые единицы */
  grossBaseUnits: number;
  /** сколько к этому моменту ушло продавцу */
  earnedBaseUnits: number;
  /** наша доля с заработанного */
  feeBaseUnits: number;
  /** что остаётся продавцу из заработанного */
  netBaseUnits: number;
  /** возврат покупателю за время, которое место не стояло */
  refundBaseUnits: number;
};

/**
 * Сколько кому причитается, если закрыть сделку в этот момент.
 *
 * Считается в базовых единицах, а не в центах: остаток от целочисленного
 * деления меньше цента, но за срок он набегает и в центах потерялся бы.
 *
 * Комиссию берём только с заработанного: платить нам за сорванную сделку
 * продавец не должен.
 */
export function settle(plan: DealPlan, atUnix: number): Settlement {
  const earnedBaseUnits = earnedAt(plan, atUnix);
  const feeBaseUnits = Math.round(earnedBaseUnits * FEE_RATE);

  return {
    grossBaseUnits: plan.amountBaseUnits,
    earnedBaseUnits,
    feeBaseUnits,
    netBaseUnits: earnedBaseUnits - feeBaseUnits,
    refundBaseUnits: plan.amountBaseUnits - earnedBaseUnits,
  };
}

function assertWholeNonNegative(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer of cents`);
  }
}

/**
 * Сколько знаков после точки у USDC. Один цент - десять тысяч базовых единиц.
 * Цифра одинакова на девнете и на мейннете.
 */
export const USDC_DECIMALS = 6;

const UNITS_PER_CENT = 10 ** (USDC_DECIMALS - 2);

export function toUsdcBaseUnits(cents: number): number {
  assertWholeNonNegative(cents, "cents");
  return cents * UNITS_PER_CENT;
}

export function fromUsdcBaseUnits(units: number): number {
  assertWholeNonNegative(units, "units");
  if (units % UNITS_PER_CENT !== 0) {
    throw new Error("units do not add up to a whole number of cents");
  }
  return units / UNITS_PER_CENT;
}

/**
 * Как ведут себя деньги по этой сделке.
 *
 * `stream` - капают по мере того, как размещение стоит. Годится там, где
 * состояние места читается автоматически и поток можно остановить.
 *
 * `hold` - заперты до конца срока и уходят продавцу целиком. Годится там, где
 * проверить нечем, а продавец несёт невозвратные расходы до начала: печать,
 * изготовление, бронь площадки.
 */
export type DealShape = "stream" | "hold";

export type DealPlan = {
  /** Вся сумма сделки в базовых единицах монеты. */
  amountBaseUnits: number;
  /** Секунда, с которой начинает капать. */
  startsAt: number;
  /** Секунда, на которой сумма дотекает целиком. */
  endsAt: number;
  /** До какой секунды покупатель может передумать и забрать неотработанное. */
  refundableUntil: number;
  /** Сколько суток стоит размещение. Для интерфейса, в расчёте не участвует. */
  days: number;
};

const DAY_MS = 86_400_000;
const DAY_SECONDS = 86_400;

/**
 * Разложить бронь в условия сделки для контракта.
 *
 * Дата - это день, а не момент: бронь с 3 по 9 ноября включительно длится семь
 * суток и начинается в полночь UTC третьего.
 *
 * Периодов и остатка от деления здесь больше нет. Они были формой, которую
 * навязывал Streamflow: он отдавал деньги шагами, и сумму приходилось делить
 * на число шагов заранее. Своя программа считает линейно, а остаток от деления
 * остаётся в хранилище и доходит на последней секунде.
 */
export function dealPlan(booking: {
  priceCents: number;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  shape: DealShape;
  /**
   * Секунда, с которой отказ перестаёт быть бесплатным. Для `hold` это момент,
   * когда продавец начинает нести невозвратные расходы. Пусто - берём начало
   * размещения: передумать можно до того дня, когда место должно было встать.
   */
  refundableUntil?: number;
}): DealPlan {
  assertWholeNonNegative(booking.priceCents, "priceCents");
  if (booking.priceCents === 0) throw new Error("priceCents must be positive");

  const startUnixMs = Date.parse(`${booking.startDate}T00:00:00Z`);
  const endUnixMs = Date.parse(`${booking.endDate}T00:00:00Z`);
  if (!Number.isFinite(startUnixMs) || !Number.isFinite(endUnixMs)) {
    throw new Error("dates must be YYYY-MM-DD");
  }
  if (endUnixMs < startUnixMs) throw new Error("endDate is before startDate");

  const days = Math.round((endUnixMs - startUnixMs) / DAY_MS) + 1;
  const placementStart = startUnixMs / 1000;
  const placementEnd = placementStart + days * DAY_SECONDS;

  // Заморозка - это сделка нулевой длины, поставленная на конец размещения: до
  // него не натекает никому, после него достаётся всё.
  const startsAt = booking.shape === "hold" ? placementEnd : placementStart;

  const refundableUntil =
    booking.refundableUntil ??
    (booking.shape === "hold" ? placementStart : placementEnd);

  if (refundableUntil > placementEnd) {
    throw new Error("refundableUntil must not outlast the deal");
  }

  return {
    amountBaseUnits: toUsdcBaseUnits(booking.priceCents),
    startsAt,
    endsAt: placementEnd,
    refundableUntil,
    days,
  };
}

/**
 * Сколько всего причитается продавцу и площадке к этой секунде.
 *
 * Повторяет `earned_at` из программы буква в букву. Если эти две функции
 * разойдутся, интерфейс будет показывать одно, а контракт делать другое - и
 * расхождение заметят не мы, а покупатель.
 */
export function earnedAt(plan: DealPlan, atUnix: number): number {
  if (atUnix < plan.startsAt) return 0;
  if (atUnix >= plan.endsAt) return plan.amountBaseUnits;

  const elapsed = atUnix - plan.startsAt;
  const term = plan.endsAt - plan.startsAt;
  return Math.floor((plan.amountBaseUnits * elapsed) / term);
}

/** Может ли покупатель закрыть сделку сам в эту секунду. */
export function buyerMayClose(plan: DealPlan, atUnix: number): boolean {
  return atUnix < plan.refundableUntil || atUnix >= plan.endsAt;
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
