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

const legacy = (sale: ProofSale) => sale.proofDeadline === 0;
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
