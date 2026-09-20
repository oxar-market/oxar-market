/**
 * Правила аукциона.
 *
 * Лот - это место и конкретные даты: продаётся баннер с первого по седьмое, а
 * не «баннер вообще». Приём ставок закрывается раньше, чем начинается
 * размещение, иначе победителю некогда прислать креатив, а продавцу - поставить.
 *
 * Время здесь - миллисекунды epoch. Часовые пояса до этого слоя не доходят:
 * момент закрытия один для всех, где бы кто ни находился.
 */

/** Шаг ставки: пять процентов от текущей. Иначе торг идёт по центу. */
export const BID_STEP_RATE = 0.05;
/** Но не мельче доллара: на дешёвых местах процент вырождается в копейки. */
export const MIN_STEP_CENTS = 100;
/** Ставка в последние пять минут продлевает приём на столько же. */
export const EXTEND_MS = 5 * 60_000;

export type Bid = {
  bidder: string;
  amountCents: number;
  /** Когда ставка сделана, epoch ms. */
  at: number;
};

/**
 * Сколько нужно поставить сейчас. Первая ставка равна резервной цене - ниже
 * неё лот всё равно не продан, так что нет смысла принимать такие ставки.
 */
export function minBidCents(reserveCents: number, topCents: number | null): number {
  assertCents(reserveCents, "reserveCents");
  if (topCents === null) return reserveCents;
  assertCents(topCents, "topCents");

  const step = Math.max(MIN_STEP_CENTS, Math.round(topCents * BID_STEP_RATE));
  return topCents + step;
}

/** Идёт ли приём ставок. В момент закрытия - уже нет. */
export function isOpen(closesAt: number, now: number): boolean {
  return now < closesAt;
}

/**
 * Новый момент закрытия после ставки. Отсчёт идёт от самой ставки, а не от
 * прежнего срока: иначе ставка за секунду до конца добавляла бы почти ноль.
 */
export function closesAfterBid(closesAt: number, bidAt: number): number {
  if (closesAt - bidAt >= EXTEND_MS) return closesAt;
  return bidAt + EXTEND_MS;
}

/**
 * Победитель на момент закрытия. При равных суммах - тот, кто поставил раньше:
 * повторять чужую сумму и выигрывать за счёт скорости нельзя.
 */
export function winner(bids: Bid[], reserveCents: number): Bid | null {
  assertCents(reserveCents, "reserveCents");

  let best: Bid | null = null;
  for (const bid of bids) {
    if (bid.amountCents < reserveCents) continue;
    if (!best) {
      best = bid;
      continue;
    }
    if (bid.amountCents > best.amountCents) best = bid;
    else if (bid.amountCents === best.amountCents && bid.at < best.at) best = bid;
  }
  return best;
}

function assertCents(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number of cents`);
  }
}
