/**
 * Арифметика места так, как её считает программа эскроу
 * (chain/programs/oxar-escrow/src/state): целые базовые единицы монеты и
 * секунды. Ни одного импорта намеренно: этот файл берут и приложения через
 * `@oxar/core`, и скрипты chain/scripts прямым путём - ts-node не умеет
 * относительные импорты с расширением `.ts`.
 */

/**
 * Шаг ставки - пять процентов от текущей (так считает программа), но не
 * мельче доллара: на дешёвых местах процент вырождается в копейки. Это шаг
 * по умолчанию при открытии места; у каждого места в программе свой.
 */
export const MIN_STEP_CENTS = 100;
/** На сколько ставка под конец двигает закрытие всей вещи. */
export const EXTEND_SECONDS = 300;
/** Дольше месяца торг не открыть: программа его отклонит (`MAX_SALE_SECONDS`). */
export const MAX_SALE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Минимум следующей ставки ровно как в программе (`Lot::min_next_bid`):
 * без ставок - резерв, дальше - верх плюс большее из шага лота и пяти
 * процентов верха, делённых нацело в базовых единицах.
 */
export function minNextUnits(lot: { reserve: bigint; minStep: bigint; topBid: bigint; hasBid: boolean }): bigint {
  if (!lot.hasBid) return lot.reserve;
  const five = (lot.topBid * 5n) / 100n;
  return lot.topBid + (five > lot.minStep ? five : lot.minStep);
}

/**
 * Продано ли место (`Lot::has_winner`): ставка есть и не ниже резерва.
 */
export function hasWinner(lot: { topBid: bigint; reserve: bigint; hasBid: boolean }): boolean {
  return lot.hasBid && lot.topBid >= lot.reserve;
}
