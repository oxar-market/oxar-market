import type { PlacementKind } from "./placements.ts";

/**
 * Оценка того, сколько аккаунт мог бы зарабатывать на аренде мест.
 *
 * Реальных ставок у нас пока нет — ориентиры взяты от цены поста у KOL
 * сопоставимого размера. Как только придёт медиакит Superteam, коэффициенты
 * надо пересчитать по живым числам.
 *
 * Считаем сознательно скромно: человек, поверивший в $1000 и получивший $80,
 * уходит и рассказывает об этом там же, где мы его нашли.
 */

type Rate = {
  kind: PlacementKind;
  label: string;
  days: number;
  /** цена за весь срок в долларах на одного подписчика */
  perFollower: number;
};

const RATES: readonly Rate[] = [
  { kind: "avatar", label: "Avatar", days: 7, perFollower: 0.012 },
  { kind: "banner", label: "Banner", days: 7, perFollower: 0.008 },
  { kind: "bio_link", label: "Bio link", days: 30, perFollower: 0.01 },
];

/** Доля времени, которую место реально занято. Пустой месяц — обычное дело. */
const OCCUPANCY = 0.3;

/** Разброс вокруг оценки: показываем вилку, а не одно число. */
const SPREAD = 0.4;

export type PlacementEstimate = {
  kind: PlacementKind;
  label: string;
  days: number;
  /** цена одной продажи на весь срок, в долларах */
  pricePerTerm: number;
};

export type Estimate = {
  perPlacement: PlacementEstimate[];
  monthlyLow: number;
  monthlyHigh: number;
};

export function estimate(followers: number): Estimate {
  const perPlacement = RATES.map((rate) => ({
    kind: rate.kind,
    label: rate.label,
    days: rate.days,
    pricePerTerm: roundish(rate.perFollower * followers),
  }));

  const monthly = RATES.reduce(
    (sum, rate) =>
      sum + rate.perFollower * followers * (30 / rate.days) * OCCUPANCY,
    0,
  );

  return {
    perPlacement,
    monthlyLow: roundish(monthly * (1 - SPREAD)),
    monthlyHigh: roundish(monthly * (1 + SPREAD)),
  };
}

/** Круглые числа читаются как оценка, точные — как обещание. */
function roundish(value: number): number {
  if (value < 10) return Math.round(value);
  if (value < 100) return Math.round(value / 5) * 5;
  return Math.round(value / 10) * 10;
}
