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
/**
 * Сколько знаков даём имени стартапа. Сорок - это «Solana Foundation» с
 * запасом и вдвое меньше того, что влезет в строку ставки на телефоне.
 */
export const BRAND_MAX = 40;

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
 * Начался ли торг. В назначенный момент - уже да, в отличие от закрытия:
 * объявленная минута принадлежит торгу с обоих концов.
 *
 * Пусто - значит начался: у лота, заведённого без срока открытия, ждать
 * нечего. Так ведут себя все лоты, что были до появления этого срока.
 */
export function hasOpened(opensAt: number | null, now: number): boolean {
  return opensAt === null || now >= opensAt;
}

/**
 * Имя стартапа при ставке - то, чьё это лого.
 *
 * Без него на футболке остаётся картинка без хозяина: по кошельку понять,
 * чей логотип, нельзя. Пробелы по краям режем, внутренние склеиваем в один:
 * «Delora  Labs» и «Delora Labs» - одно имя, и в ленте они обязаны совпасть.
 *
 * Не имя - null, а не исключение: это ввод человека, и отвечать на него надо
 * подсказкой, а не падением.
 */
export function cleanBrand(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= BRAND_MAX ? name : null;
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

/**
 * Сколько денег заперто в торге прямо сейчас.
 *
 * Складываются только текущие лидирующие ставки, по одной на место: ровно
 * столько и лежит в хранилищах программы. Перебитая ставка вернулась хозяину
 * той же транзакцией, что её перебила, поэтому сумма всех ставок за всё время
 * - это не собранные деньги, а число, которого нет ни у кого.
 *
 * Место без ставок передаётся как null и в сумму не идёт. Ноль на его месте
 * значил бы ставку в ноль центов, а такой не бывает.
 */
export function escrowedCents(topBids: (number | null)[]): number {
  let total = 0;
  for (const amount of topBids) {
    if (amount === null) continue;
    assertCents(amount, "topBids");
    total += amount;
  }
  return total;
}

function assertCents(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive whole number of cents`);
  }
}
