// Оценка того, сколько аккаунт мог бы зарабатывать на аренде мест.
//
// Реальных ставок у нас пока нет — ориентиры взяты от цены поста у KOL
// сопоставимого размера. Как только придёт медиакит Superteam, коэффициенты
// надо пересчитать по живым числам.
//
// Считаем сознательно скромно: человек, поверивший в $1000 и получивший $80,
// уходит и рассказывает об этом там же, где мы его нашли.

export type Placement = {
  id: string;
  label: string;
  /** срок одной продажи, дней */
  days: number;
  /** цена за период в долларах на одного подписчика */
  ratePerFollower: number;
};

export const PLACEMENTS: Placement[] = [
  { id: "avatar", label: "Avatar", days: 7, ratePerFollower: 0.012 },
  { id: "banner", label: "Banner", days: 7, ratePerFollower: 0.008 },
  { id: "bio_link", label: "Bio link", days: 30, ratePerFollower: 0.01 },
];

/** Доля времени, которую место реально занято. Пустой месяц — обычное дело. */
const OCCUPANCY = 0.3;

/** Разброс вокруг оценки: показываем вилку, а не одно число. */
const SPREAD = 0.4;

export type PlacementEstimate = {
  placement: Placement;
  /** цена одной продажи на весь срок */
  pricePerTerm: number;
};

export type Estimate = {
  perPlacement: PlacementEstimate[];
  monthlyLow: number;
  monthlyHigh: number;
};

export function estimate(followers: number): Estimate {
  const perPlacement = PLACEMENTS.map((placement) => ({
    placement,
    pricePerTerm: round(placement.ratePerFollower * followers),
  }));

  const monthly = perPlacement.reduce(
    (sum, { placement, pricePerTerm }) =>
      sum + pricePerTerm * (30 / placement.days) * OCCUPANCY,
    0,
  );

  return {
    perPlacement,
    monthlyLow: round(monthly * (1 - SPREAD)),
    monthlyHigh: round(monthly * (1 + SPREAD)),
  };
}

/** Круглые числа читаются как оценка, точные — как обещание. */
function round(value: number): number {
  if (value < 10) return Math.round(value);
  if (value < 100) return Math.round(value / 5) * 5;
  return Math.round(value / 10) * 10;
}
