/**
 * Чтение лота из цепочки - общее для скриптов закрытия.
 *
 * Приведение типа здесь не украшательство, а единственный способ вообще
 * запустить скрипт: IDL читается с диска обычным JSON, и Anchor выводит из
 * него `AccountNamespace<Idl>` - пространство без единого имени аккаунта.
 * Имена появляются только из сгенерированного `anchor idl type`, которого в
 * репозитории нет. Без этого `program.account.lot` не компилируется.
 */
import type * as anchor from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";

/** Лот, как его отдаёт цепочка. Суммы приходят как BN, отсюда `toString`. */
export type ChainLot = {
  seller: PublicKey;
  platform: PublicKey;
  mint: PublicKey;
  topBidder: PublicKey | null;
  topBid: { toString(): string };
  reserve: { toString(): string };
  feeBps: number;
};

export async function fetchLot(
  program: InstanceType<typeof anchor.Program>,
  address: PublicKey,
): Promise<ChainLot> {
  const accounts = program.account as unknown as {
    lot: { fetch(address: PublicKey): Promise<ChainLot> };
  };
  return accounts.lot.fetch(address);
}
