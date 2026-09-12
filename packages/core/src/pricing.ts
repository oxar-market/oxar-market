/**
 * Два способа продать место.
 *
 * `term` - пакет: цена за заранее названный срок, купить можно только целиком.
 * `daily` - ставка за сутки: покупатель сам говорит, сколько дней берёт, а
 * `termDays` работает минимальным сроком.
 *
 * Продавать место на день дешевле, чем на неделю, продавцу может быть невыгодно,
 * поэтому минимум задаёт он, а не мы.
 */

export type Pricing = "term" | "daily";

export type Listing = {
  pricing: Pricing;
  /** Пакет - цена за весь срок. Ставка - цена за один день. */
  priceCents: number;
  /** Пакет - сам срок. Ставка - минимальное число дней. */
  termDays: number;
};

/** Сколько заплатит покупатель за выбранное число дней. */
export function orderTotalCents(listing: Listing, days: number): number {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("days must be a positive whole number");
  }

  if (listing.pricing === "term") {
    if (days !== listing.termDays) {
      throw new Error("a term listing is sold for its whole term only");
    }
    return listing.priceCents;
  }

  if (days < listing.termDays) {
    throw new Error("days must not be below the minimum the seller set");
  }
  return listing.priceCents * days;
}

/** С какого числа дней начинается выбор у покупателя. */
export function minDaysFor(listing: Listing): number {
  return listing.termDays;
}
