/**
 * Сколько SOL стоит продавцу открыть торг, и сколько из этого вернётся.
 *
 * Solana держит за каждым аккаунтом залог (rent): (128 + байты) * ставка.
 * Ставку сеть меняет: SIMD-0437 снижает её по шагам с 6960 до 696
 * лампортов за байт. Поэтому её не держим числом, а передаём снаружи -
 * приложение спрашивает её у сети.
 * Программа при публикации создаёт:
 *
 * - торг (Sale, 139 байт) - один на срок закрытия; программа его не
 *   закрывает, и залог за него остаётся в сети;
 * - на каждое место лот (Lot, 179 байт) и хранилище ставок (165 байт) -
 *   при расчёте места оба закрываются, и залог уходит продавцу.
 *
 * Плюс подпись каждой транзакции - 5000 лампортов; в транзакцию входит
 * до трёх мест (LOTS_PER_TX в приложении). Размеры - из программы
 * chain/programs/oxar-escrow/src/state; поменяются там - поменяются и здесь.
 */

/** Служебные байты, которые сеть добавляет к каждому аккаунту при расчёте залога. */
export const ACCOUNT_OVERHEAD = 128;
const SALE_BYTES = 139;
const LOT_BYTES = 179;
const VAULT_BYTES = 165;
const SIGNATURE_LAMPORTS = 5000;
/**
 * Сколько мест открывается одной транзакцией: каждое место - два новых
 * аккаунта, больше трёх упирается в лимит вычислений и размер пакета.
 */
export const LOTS_PER_TX = 3;


export type PublishCost = {
  /** Залог за лоты и хранилища: вернётся продавцу после расчёта мест. */
  backLamports: number;
  /** Аккаунты торгов и подписи: уходят сети и не возвращаются. */
  keptLamports: number;
  totalLamports: number;
};

/**
 * Стоимость публикации; на входе - сколько мест в каждом торге и ставка
 * залога сети в лампортах за байт.
 */
export function publishCost(spotsPerSale: number[], rentPerByte: number): PublishCost {
  const rent = (bytes: number) => (ACCOUNT_OVERHEAD + bytes) * rentPerByte;
  let back = 0;
  let kept = 0;
  for (const spots of spotsPerSale) {
    back += spots * (rent(LOT_BYTES) + rent(VAULT_BYTES));
    kept += rent(SALE_BYTES) + Math.ceil(spots / LOTS_PER_TX) * SIGNATURE_LAMPORTS;
  }
  return { backLamports: back, keptLamports: kept, totalLamports: back + kept };
}

/**
 * Сколько мест в каждом торге: места с одним сроком закрытия идут одним
 * торгом, с разными - разными (так их и открывает публикация).
 */
export function spotsPerSale(closesAt: string[]): number[] {
  const bySale = new Map<string, number>();
  for (const at of closesAt) bySale.set(at, (bySale.get(at) ?? 0) + 1);
  return [...bySale.values()];
}
