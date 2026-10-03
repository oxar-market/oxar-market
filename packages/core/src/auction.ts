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

import { EXTEND_SECONDS, MAX_SALE_SECONDS, MIN_STEP_CENTS, minNextUnits } from "./lot.ts";
import { centsToUnits, unitsToCents } from "./money.ts";

/** Ставка в последние пять минут продлевает приём на столько же. */
export const EXTEND_MS = EXTEND_SECONDS * 1000;
/**
 * Сколько знаков даём имени стартапа. Сорок - это «Solana Foundation» с
 * запасом и вдвое меньше того, что влезет в строку ставки на телефоне.
 */
export const BRAND_MAX = 40;

/**
 * Сколько нужно поставить сейчас. Первая ставка равна резервной цене - ниже
 * неё лот всё равно не продан, так что нет смысла принимать такие ставки.
 *
 * Шаг принадлежит лоту, а не константе: программа в цепочке считает
 * `верх + max(шаг лота, 5%)`, и экран обязан считать так же. Зашитый доллар
 * здесь однажды разошёлся с программой на живом торге: экран обещал «next
 * $11», а программа с шагом $5 требовала $15.
 */
export function minBidCents(
  reserveCents: number,
  topCents: number | null,
  stepCents: number = MIN_STEP_CENTS,
): number {
  assertCents(reserveCents, "reserveCents");
  assertCents(stepCents, "stepCents");
  if (topCents !== null) assertCents(topCents, "topCents");
  // Считаем как программа - в базовых единицах, - и вверх до цента: ставку
  // набирают центами, а меньше программа не примет. Пять процентов от $50.01
  // - это $2.5005, и минимум - $52.52, а не округлённые $52.51.
  const units = minNextUnits({
    reserve: centsToUnits(reserveCents),
    minStep: centsToUnits(stepCents),
    topBid: centsToUnits(topCents ?? 0),
    hasBid: topCents !== null,
  });
  return unitsToCents(units, "ceil");
}

/**
 * Можно ли открыть торг с такими сроками. Закрытие позже открытия - правило
 * экрана; не в прошлом и не дальше месяца от публикации - правило программы
 * (`seller_opens_sale`): месяц она считает от момента, когда торг заводят в
 * цепочке, а не от объявленного открытия. Миллисекунды.
 */
export function validSaleWindow(opensAt: number, closesAt: number, now: number): boolean {
  return closesAt > opensAt && closesAt > now && closesAt <= now + MAX_SALE_SECONDS * 1000;
}

/**
 * День закрытия торга (UTC, «ГГГГ-ММ-ДД») - по нему итоги и история
 * собирают места одного торга вещи: места одного торга закрываются в одну
 * секунду, а торги одной вещи - в разные дни.
 */
export function closeDay(closesAt: string | number): string {
  return new Date(closesAt).toISOString().slice(0, 10);
}

/**
 * Ближайшее закрытие вещи для обратного отсчёта: самое раннее из тех, что
 * ещё впереди; все прошли - самое позднее. Миллисекунды; пусто - null.
 */
export function nextClose(closes: number[], now: number): number | null {
  if (closes.length === 0) return null;
  const ahead = closes.filter((at) => at > now);
  return ahead.length ? Math.min(...ahead) : Math.max(...closes);
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
