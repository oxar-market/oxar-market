/**
 * Деньги считаем в центах целыми числами. Дроби в долларах дают ошибки
 * округления там, где потом расходятся выплата продавцу, возврат покупателю
 * и наша комиссия.
 *
 * Стримингового расчёта здесь больше нет. Он считал, сколько денег «натекло»
 * продавцу за отработанное время, и был нужен Streamflow. Аукцион устроен
 * иначе: победитель платит один раз за место, время ни на что не делится.
 * Прежний расчёт живёт в истории git, если когда-нибудь вернётся аренда.
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

/**
 * Комиссия в сотых долях процента - в таком виде её держит наша программа на
 * Solana (поле `fee_bps` у лота). Здесь, чтобы обе стороны считали одно и то
 * же число: расходись они, сумма на экране не сошлась бы с суммой в цепочке.
 */
export const FEE_BPS = Math.round(FEE_RATE * 10_000);

/** Знаков после запятой у USDC. */
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
 * Разобрать то, что человек набрал в поле ставки, в целые центы.
 *
 * Возвращает `null`, если в строке не число: пустое поле, одни пробелы, буквы,
 * минус, больше двух знаков после разделителя. Молча округлить третий знак
 * нельзя - человек видел бы одну сумму, а ставил другую.
 *
 * Запятая и точка равноправны: половина мира набирает «12,50», и отбивать их
 * не за что.
 *
 * Живёт в core, потому что то же поле будет в мобильном приложении, и разбор
 * денег - ровно то, что нельзя написать дважды.
 */
export function parseUsd(text: string): number | null {
  const clean = text.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;

  // Через строку, а не умножением: 12.10 * 100 в двоичной дроби даёт
  // 1209.9999999999998, и ставка уезжает на цент вниз.
  const [dollars, cents = ""] = clean.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function assertWholeNonNegative(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole number of units, zero or more`);
  }
}
