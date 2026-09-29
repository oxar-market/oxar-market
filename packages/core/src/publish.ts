/**
 * Сколько SOL стоит продавцу открыть торг, и сколько из этого вернётся.
 *
 * Solana держит за каждым аккаунтом залог (rent): (128 + байты) * 6960
 * лампортов - это цена двух лет хранения, после которой аккаунт вечный.
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

const RENT_PER_BYTE = 6960;
const ACCOUNT_OVERHEAD = 128;
const SALE_BYTES = 139;
const LOT_BYTES = 179;
const VAULT_BYTES = 165;
const SIGNATURE_LAMPORTS = 5000;
const LOTS_PER_TX = 3;

const rent = (bytes: number) => (ACCOUNT_OVERHEAD + bytes) * RENT_PER_BYTE;

export type PublishCost = {
  /** Залог за лоты и хранилища: вернётся продавцу после расчёта мест. */
  backLamports: number;
  /** Аккаунты торгов и подписи: уходят сети и не возвращаются. */
  keptLamports: number;
  totalLamports: number;
};

/** Стоимость публикации; на входе - сколько мест в каждом торге. */
export function publishCost(spotsPerSale: number[]): PublishCost {
  let back = 0;
  let kept = 0;
  for (const spots of spotsPerSale) {
    back += spots * (rent(LOT_BYTES) + rent(VAULT_BYTES));
    kept += rent(SALE_BYTES) + Math.ceil(spots / LOTS_PER_TX) * SIGNATURE_LAMPORTS;
  }
  return { backLamports: back, keptLamports: kept, totalLamports: back + kept };
}
