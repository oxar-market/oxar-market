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

/** Знаков после запятой у USDC. */
export const USDC_DECIMALS = 6;

/**
 * Центы в базовые единицы монеты. Знаков у монеты бывает не шесть (тестовая
 * монета devnet), поэтому их передают; по умолчанию - USDC.
 */
export function centsToUnits(cents: number, decimals: number = USDC_DECIMALS): bigint {
  assertWholeNonNegative(cents, "cents");
  if (decimals < 2) throw new Error("a coin with fewer than 2 decimals cannot hold cents");
  return BigInt(cents) * 10n ** BigInt(decimals - 2);
}

/**
 * Базовые единицы в центы. Остаток меньше цента реален: на кошельке он бывает
 * всегда, а минимум ставки программа считает в единицах. Поэтому - явно, в
 * какую сторону: баланс показываем вниз (столько точно есть), минимум ставки
 * - вверх (меньше программа не примет).
 */
export function unitsToCents(units: bigint, mode: "floor" | "ceil" = "floor", decimals: number = USDC_DECIMALS): number {
  if (units < 0n) throw new Error("units must not be negative");
  if (decimals < 2) throw new Error("a coin with fewer than 2 decimals cannot hold cents");
  const per = 10n ** BigInt(decimals - 2);
  return Number(mode === "ceil" ? (units + per - 1n) / per : units / per);
}

/**
 * Как программа делит выигравшую ставку (`Lot::split`): комиссия - вниз в
 * базовых единицах, остаток продавцу. В сумме ровно ставка.
 */
export function payoutSplit(winning: bigint, feeBps: number): { fee: bigint; toSeller: bigint } {
  if (winning < 0n) throw new Error("winning bid must not be negative");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) throw new Error("fee_bps must be 0..10000");
  const fee = (winning * BigInt(feeBps)) / 10_000n;
  return { fee, toSeller: winning - fee };
}

/** SOL из лампортов: столько знаков, сколько нужно для цены публикации. */
export function formatSol(lamports: bigint | number, digits = 4): string {
  return `${(Number(lamports) / 1e9).toFixed(digits)} SOL`;
}

/** Проценты, набранные человеком, в сотые доли процента; не число - null. */
export function percentToBps(text: string): number | null {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
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
