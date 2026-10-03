/**
 * Защита покупателя: когда деньги выигранного места уходят продавцу.
 *
 * Решает программа эскроу (chain/programs/oxar-escrow), здесь - то же правило
 * для интерфейса и скрипта расчёта: какую кнопку показать, что напомнить, что
 * звать. Разойдутся с программой - кнопка будет обещать то, что контракт
 * отклонит. Поэтому тесты повторяют тесты программы случай в случай.
 *
 * Время - секунды epoch, как в программе.
 *
 * 1. Продавец ставит срок пруфа при открытии торга.
 * 2. Торг закрылся - деньги победителей держит программа.
 * 3. Пруф пришёл - у победителя 72 часа оспорить; подтвердил сам - выплата
 *    сразу, промолчал - выплата после окна.
 * 4. Оспорил - решает арбитр; молчит 30 дней - ставка победителю.
 * 5. Пруфа нет к сроку - ставки возвращаются победителям.
 *
 * Торг, открытый до защиты покупателя (срок пруфа - ноль), платит сразу после
 * закрытия.
 */

/** Сколько ставки под конец могут продлить торг. Срок пруфа - позже этого. */
export const TOTAL_EXTEND_SECONDS = 3_600;
/** Окно победителя оспорить пруф. */
export const APPEAL_SECONDS = 72 * 60 * 60;
/** Сколько арбитр может молчать по спору. */
export const ARBITER_SECONDS = 30 * 24 * 60 * 60;
/** Насколько арбитр может отодвинуть срок пруфа от первого срока. */
export const MAX_PROOF_MOVE_SECONDS = 90 * 24 * 60 * 60;

export type ProofSale = {
  closesAt: number;
  /** Ноль - торг до защиты покупателя. */
  proofDeadline: number;
  /** Ноль - пруфа ещё нет. */
  provedAt: number;
};

export type ProofSpot = { disputed: boolean; disputedAt: number };

/** Самый ранний срок пруфа, который программа примет при открытии торга. */
export function minProofDeadline(closesAt: number): number {
  return closesAt + TOTAL_EXTEND_SECONDS + 1;
}

/** Срок пруфа - конец выбранного дня по часам продавца. */
export const PROOF_DAY_END = "23:59";

/**
 * Самый ранний день пруфа («ГГГГ-ММ-ДД»), который можно выбрать при
 * публикации. Конец этого дня должен быть не раньше, чем примет программа
 * (`minProofDeadline`), и сам день - не раньше последнего дня, когда вещь
 * носят: пруф - это вещь в деле с логотипами, до того дня его не покажешь.
 *
 * Всё по часам продавца, без зоны, как в полях даты: `closes` -
 * «ГГГГ-ММ-ДДTЧЧ:ММ», `lastWornDay` - «ГГГГ-ММ-ДД» или пусто. Часы считаем
 * как UTC: нужен календарь, а не момент.
 */
export function earliestProofDay(closes: string, lastWornDay: string): string {
  const min = minProofDeadline(Date.parse(`${closes}Z`) / 1000);
  let day = new Date(min * 1000).toISOString().slice(0, 10);
  // Минимум в последнюю минуту дня: конец этого дня уже раньше него.
  if (Date.parse(`${day}T${PROOF_DAY_END}Z`) / 1000 < min) {
    day = new Date(Date.parse(`${day}T12:00Z`) + 86_400_000).toISOString().slice(0, 10);
  }
  return lastWornDay > day ? lastWornDay : day;
}

const legacy = (sale: ProofSale) => sale.proofDeadline === 0;

/** Торг открыт с защитой покупателя (у старых торгов срока пруфа нет). */
export function hasBuyerProtection(sale: { proofDeadline: number }): boolean {
  return sale.proofDeadline !== 0;
}

/**
 * Можно ли арбитру перенести срок пруфа (`Sale::moves_proof`): только позже,
 * не дальше девяноста дней от первого срока, пока пруфа нет и срок не вышел.
 */
export function movesProof(
  sale: ProofSale & { firstProofDeadline: number },
  now: number,
  newDeadline: number,
): boolean {
  return (
    !legacy(sale) &&
    sale.provedAt === 0 &&
    now <= sale.proofDeadline &&
    newDeadline > sale.proofDeadline &&
    newDeadline <= sale.firstProofDeadline + MAX_PROOF_MOVE_SECONDS
  );
}

export type SettledOutcome = "paid" | "refunded" | "split";

/**
 * Чем кончилось закрытое место: выплачено продавцу, ставка вернулась или
 * арбитр поделил. Доля арбитра - если спор решён. Без неё продавцу ушло
 * только место с пруфом, которое расчёт не отметил возвратом (молчание
 * арбитра): без пруфа программа платит только назад.
 */
export function settledOutcome(closed: { sellerBps: number | null; proved: boolean; refunded: boolean }): SettledOutcome {
  if (closed.sellerBps !== null) {
    return closed.sellerBps === 10_000 ? "paid" : closed.sellerBps === 0 ? "refunded" : "split";
  }
  return closed.proved && !closed.refunded ? "paid" : "refunded";
}

const isOpen = (sale: ProofSale, now: number) => now < sale.closesAt;

export function takesProof(sale: ProofSale, now: number): boolean {
  return !legacy(sale) && sale.provedAt === 0 && !isOpen(sale, now) && now <= sale.proofDeadline;
}

export function proofMissed(sale: ProofSale, now: number): boolean {
  return !legacy(sale) && sale.provedAt === 0 && !isOpen(sale, now) && now > sale.proofDeadline;
}

export function appealOpen(sale: ProofSale, now: number): boolean {
  return !legacy(sale) && sale.provedAt > 0 && now < sale.provedAt + APPEAL_SECONDS;
}

/** `byWinner` - выплату зовёт сам победитель места: это его «да». */
export function pays(sale: ProofSale, now: number, byWinner: boolean): boolean {
  if (legacy(sale)) return !isOpen(sale, now);
  return sale.provedAt > 0 && (byWinner || now >= sale.provedAt + APPEAL_SECONDS);
}

export function disputeLapsed(spot: ProofSpot, now: number): boolean {
  return spot.disputed && now >= spot.disputedAt + ARBITER_SECONDS;
}

export type SpotStage =
  | "bidding"
  | "awaiting_proof"
  | "proof_missed"
  | "appeal"
  | "payable"
  | "disputed"
  | "dispute_lapsed";

/** Где сейчас выигранное место: по этому - текст и кнопки у продавца и победителя. */
export function spotStage(sale: ProofSale, spot: ProofSpot, now: number): SpotStage {
  if (isOpen(sale, now)) return "bidding";
  if (spot.disputed) return disputeLapsed(spot, now) ? "dispute_lapsed" : "disputed";
  if (pays(sale, now, false)) return "payable";
  if (appealOpen(sale, now)) return "appeal";
  if (proofMissed(sale, now)) return "proof_missed";
  return "awaiting_proof";
}

/**
 * Решение арбитра по спорному месту: доля продавцу в сотых процента, остальное
 * победителю. Комиссия - только с доли продавца. Целые базовые единицы,
 * деление вниз - как в программе; в сумме ровно ставка.
 */
export function arbiterSplit(
  topBid: bigint,
  sellerBps: number,
  feeBps: number,
): { toSeller: bigint; fee: bigint; toWinner: bigint } {
  if (sellerBps < 0 || sellerBps > 10_000) throw new Error("доля продавца - от 0 до 10000");
  const sellerPart = (topBid * BigInt(sellerBps)) / 10_000n;
  const fee = (sellerPart * BigInt(feeBps)) / 10_000n;
  return { toSeller: sellerPart - fee, fee, toWinner: topBid - sellerPart };
}
