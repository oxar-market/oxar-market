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

export type Settlement = Split & {
  /** возврат покупателю за время, которое место не стояло */
  refundCents: number;
};

/**
 * Размещение сняли раньше срока. Продавец получает за отстоявшее время,
 * остальное возвращается покупателю. Комиссию берём только с заработанной
 * части: платить нам за сорванную сделку продавец не должен.
 */
export function settle(
  grossCents: number,
  termDays: number,
  ranDays: number,
): Settlement {
  assertWholeNonNegative(grossCents, "grossCents");
  if (termDays <= 0) throw new Error("termDays must be positive");
  if (ranDays < 0) throw new Error("ranDays must not be negative");

  const served = Math.min(ranDays, termDays);
  const earnedCents = Math.round((grossCents * served) / termDays);
  const { feeCents, netCents } = splitPayout(earnedCents);

  return {
    grossCents,
    feeCents,
    netCents,
    refundCents: grossCents - earnedCents,
  };
}

function assertWholeNonNegative(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer of cents`);
  }
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
