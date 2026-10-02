"use client";

import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  connection,
  decodeLot,
  disputeInstruction,
  payInstruction,
  readSale,
  sendSigned,
  settled,
  type ChainLot,
  type ChainSale,
} from "./chain.ts";
import type { ProofRow, Signer } from "./proof.ts";
import { db } from "./session.ts";

/**
 * Выигранные места покупателя под защитой: где стоит каждое и что он может
 * сделать. Решает программа: ждём пруф, окно на спор, спор у арбитра,
 * выплачено, вернулось. Здесь - чтение и две кнопки победителя.
 */

export type Win = {
  lotId: string;
  spot: string;
  thing: string;
  cents: number;
  saleAddress: PublicKey;
  lotAddress: PublicKey;
  /** null - торг не прочитался. */
  sale: ChainSale | null;
  /** null - аккаунт места закрыт: выплачено продавцу или ставка вернулась. */
  lot: ChainLot | null;
  proof: ProofRow | null;
  dispute: { reason: string; sellerBps: number | null } | null;
};

/** Победы с защитой покупателя: места, открытые с адресом торга. */
export async function loadMyWins(
  stands: { lotId: string; spot: string; thing: string; mineCents: number; won: boolean }[],
): Promise<Win[]> {
  if (!db) return [];
  const won = stands.filter((one) => one.won);
  if (won.length === 0) return [];
  const { data: lots } = await db
    .from("lots")
    .select("id, chain_lot, chain_sale")
    .in("id", won.map((one) => one.lotId))
    .not("chain_sale", "is", null);
  if (!lots || lots.length === 0) return [];

  const sales = [...new Set(lots.map((one) => one.chain_sale as string))];
  const [{ data: proofs }, { data: disputes }, accounts] = await Promise.all([
    db.from("proofs").select("sale, photos, links, note, hash, signature, proved_at").in("sale", sales),
    db.from("disputes").select("lot_id, reason, seller_bps").in("lot_id", lots.map((one) => one.id)),
    connection.getMultipleAccountsInfo(lots.map((one) => new PublicKey(one.chain_lot as string))).catch(() => null),
  ]);
  const chainSales = new Map(
    await Promise.all(sales.map(async (sale) => [sale, await readSale(new PublicKey(sale)).catch(() => null)] as const)),
  );

  return lots.map((row, at) => {
    const stand = won.find((one) => one.lotId === row.id)!;
    const proof = (proofs ?? []).find((one) => one.sale === row.chain_sale);
    const dispute = (disputes ?? []).find((one) => one.lot_id === row.id);
    const account = accounts?.[at];
    return {
      lotId: row.id as string,
      spot: stand.spot,
      thing: stand.thing,
      cents: stand.mineCents,
      saleAddress: new PublicKey(row.chain_sale as string),
      lotAddress: new PublicKey(row.chain_lot as string),
      sale: chainSales.get(row.chain_sale as string) ?? null,
      lot: account ? decodeLot(account.data) : null,
      proof: proof
        ? {
            sale: proof.sale,
            photos: proof.photos ?? [],
            links: proof.links ?? [],
            note: proof.note,
            hash: proof.hash,
            signature: proof.signature,
            provedAt: proof.proved_at,
          }
        : null,
      dispute: dispute ? { reason: dispute.reason, sellerBps: dispute.seller_bps } : null,
    };
  });
}

async function send(payer: PublicKey, sign: Signer, instruction: ReturnType<typeof payInstruction>): Promise<string | null> {
  const { blockhash } = await connection.getLatestBlockhash();
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: payer,
      recentBlockhash: blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 }), instruction],
    }).compileToV0Message(),
  );
  try {
    const signature = await sendSigned(await sign(transaction));
    return (await settled(signature)) === "ok" ? signature : null;
  } catch {
    return null;
  }
}

/** «Looks good»: победитель сам выплачивает своё место продавцу, не дожидаясь окна. */
export async function confirmWin(win: Win, winner: PublicKey, sign: Signer): Promise<boolean> {
  if (!win.sale || !win.lot) return false;
  return (await send(winner, sign, payInstruction(winner, win.saleAddress, win.sale, win.lotAddress, win.lot))) !== null;
}

/** «Dispute»: место замораживается в программе, причина - в базу для арбитра. */
export async function disputeWin(win: Win, winner: PublicKey, reason: string, sign: Signer): Promise<boolean> {
  if (!db) return false;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return false;
  const signature = await send(winner, sign, disputeInstruction(winner, win.saleAddress, win.lotAddress));
  if (!signature) return false;
  // Спор в программе уже стоит - даже без записи деньги заморожены, и арбитр
  // увидит место по цепочке. Поэтому ошибка записи причины - не провал спора.
  await db.from("disputes").insert({ lot_id: win.lotId, winner: auth.user.id, reason: reason.trim(), signature });
  return true;
}
