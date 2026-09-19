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
 * Сколько кому причитается, если остановить стрим в этот момент.
 *
 * Меряется минутами, а не днями, потому что минутами меряет контракт: доля
 * уходит продавцу за каждый целый период, а остаток от деления отдаётся сразу
 * на старте. Дневная арифметика тут была бы своей, отдельной правдой - и она
 * расходилась бы с тем, что реально лежит на счетах.
 *
 * Считается в базовых единицах, а не в центах: остаток от деления суммы на
 * число периодов меньше цента на период, но за неделю набегает больше цента, и
 * в центах он потерялся бы.
 *
 * Комиссию берём только с заработанного: платить нам за сорванную сделку
 * продавец не должен.
 */
export function settle(plan: StreamPlan, atUnix: number): Settlement {
  const capped = Math.min(Math.max(atUnix, plan.startUnix), plan.endUnix);
  const periods = Math.floor((capped - plan.startUnix) / plan.period);

  const earnedBaseUnits =
    atUnix < plan.startUnix
      ? 0
      : plan.dustBaseUnits + plan.amountPerPeriod * periods;
  const feeBaseUnits = Math.round(earnedBaseUnits * FEE_RATE);

  return {
    grossBaseUnits: plan.depositedBaseUnits,
    earnedBaseUnits,
    feeBaseUnits,
    netBaseUnits: earnedBaseUnits - feeBaseUnits,
    refundBaseUnits: plan.depositedBaseUnits - earnedBaseUnits,
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
 * Шаг выплаты в стриме, в секундах. Минута, а не секунда: на секундном шаге
 * остаток от деления суммы на число шагов растёт, а разницы для сделки,
 * которая меряется днями, никакой.
 */
export const STREAM_PERIOD_SECONDS = 60;

export type StreamPlan = {
  /** Сколько дней стоит размещение. Даты включительно. */
  days: number;
  /** Полночь UTC дня начала, в секундах. */
  startUnix: number;
  /** Когда стрим досчитает до конца, в секундах. */
  endUnix: number;
  period: number;
  periods: number;
  /** Сколько уходит продавцу за один период. */
  amountPerPeriod: number;
  /** Вся сумма сделки в базовых единицах. */
  depositedBaseUnits: number;
  /**
   * Остаток от деления суммы на число периодов. Меньше одной базовой единицы
   * на период, то есть копейки, но он существует, и притворяться, что нет,
   * нельзя: где именно он окажется, решает контракт, и это проверяется на
   * девнете, а не тут.
   */
  dustBaseUnits: number;
};

const DAY_MS = 86_400_000;

/**
 * Как разложить сделку в стрим: с какой секунды, каким шагом и по сколько.
 *
 * Дата - это день, а не момент: бронь с 3 по 9 ноября включительно длится семь
 * суток и начинается в полночь UTC третьего.
 */
export function streamPlan(booking: {
  priceCents: number;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
}): StreamPlan {
  assertWholeNonNegative(booking.priceCents, "priceCents");
  if (booking.priceCents === 0) throw new Error("priceCents must be positive");

  const startUnixMs = Date.parse(`${booking.startDate}T00:00:00Z`);
  const endUnixMs = Date.parse(`${booking.endDate}T00:00:00Z`);
  if (!Number.isFinite(startUnixMs) || !Number.isFinite(endUnixMs)) {
    throw new Error("dates must be YYYY-MM-DD");
  }
  if (endUnixMs < startUnixMs) throw new Error("endDate is before startDate");

  const days = Math.round((endUnixMs - startUnixMs) / DAY_MS) + 1;
  const periods = (days * 86_400) / STREAM_PERIOD_SECONDS;
  const depositedBaseUnits = toUsdcBaseUnits(booking.priceCents);
  const amountPerPeriod = Math.floor(depositedBaseUnits / periods);

  return {
    days,
    startUnix: startUnixMs / 1000,
    endUnix: startUnixMs / 1000 + periods * STREAM_PERIOD_SECONDS,
    period: STREAM_PERIOD_SECONDS,
    periods,
    amountPerPeriod,
    depositedBaseUnits,
    dustBaseUnits: depositedBaseUnits - amountPerPeriod * periods,
  };
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
