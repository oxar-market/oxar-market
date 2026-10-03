"use client";

import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { LOTS_PER_TX, centsToUnits, minProofDeadline } from "@oxar/core";
import { auctionBytes, connection, lotAddress, openSaleData, saleAddress, sendSigned, settled } from "./chain.ts";
import { db } from "./session.ts";

/**
 * Продавец открывает свои аукционы сам, своим кошельком.
 *
 * Та же программа и те же инструкции, что у наших скриптов (open-sale.ts,
 * open-lot.ts): торг вещи с новым uuid и места на нём с id лотов из базы.
 * Контракт не меняется - продавцом в торге становится тот, кто подписал, и
 * выплата при закрытии уйдёт ему; комиссию и монету программа берёт из своих
 * настроек, подменить их нельзя.
 *
 * Срок в программе общий на торг, а на экране у каждого места свой. Поэтому
 * места с одним сроком закрытия идут одним торгом, с разными - разными.
 */

const PROGRAM_ID = new PublicKey("4zBp61iGL7f9zybTfrtwydUZmM2WxRsskedqFNdHiDpe");
/** `seller_opens_lot` из IDL. */
const OPEN_LOT = new Uint8Array([219, 91, 199, 189, 78, 98, 42, 205]);
/** Настройки площадки: монета лежит после admin, platform, fee_bps и bump. */
async function platformMint(): Promise<{ mint: PublicKey; decimals: number } | null> {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const account = await connection.getAccountInfo(config);
  if (!account) return null;
  const mint = new PublicKey(account.data.subarray(8 + 32 + 32 + 2 + 1, 8 + 32 + 32 + 2 + 1 + 32));
  const info = await connection.getParsedAccountInfo(mint);
  const parsed = info.value?.data as { parsed?: { info?: { decimals?: number } } } | undefined;
  const decimals = parsed?.parsed?.info?.decimals;
  return typeof decimals === "number" ? { mint, decimals } : null;
}

function u64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, value, true);
  return out;
}

function openSale(seller: PublicKey, saleId: string, closesAt: number, proofBy: number): TransactionInstruction {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(openSaleData(saleId, closesAt, proofBy)),
    keys: [
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: saleAddress(saleId), isSigner: false, isWritable: true },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

function openLot(
  seller: PublicKey,
  saleId: string,
  lotId: string,
  mint: PublicKey,
  reserve: bigint,
  step: bigint,
): TransactionInstruction {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const lot = lotAddress(lotId);
  const [vault] = PublicKey.findProgramAddressSync(
    [Buffer.from("lot_vault"), lot.toBuffer()],
    PROGRAM_ID,
  );
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.concat([OPEN_LOT, auctionBytes(lotId), u64(reserve), u64(step)]),
    keys: [
      { pubkey: seller, isSigner: true, isWritable: true },
      { pubkey: saleAddress(saleId), isSigner: false, isWritable: false },
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: lot, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

export type Signer = (transaction: VersionedTransaction) => Promise<Uint8Array>;

/**
 * Открыть в цепочке все черновики лотов вещи и отметить их открытыми.
 *
 * Возвращает, сколько мест открыто, или null при сбое. Лот, открытый в
 * цепочке, но не отмеченный в базе, повторным вызовом не задвоится: адрес
 * лота - это его id, и второй init программа отобьёт.
 */
export async function publishAuctions(
  thingId: string,
  seller: PublicKey,
  sign: Signer,
): Promise<number | null> {
  if (!db) return null;
  const { data: drafts } = await db
    .from("lots")
    .select("id, reserve_cents, min_step_cents, closes_at, proof_by")
    .eq("thing_id", thingId)
    .eq("status", "draft");
  if (!drafts || drafts.length === 0) return 0;

  const coin = await platformMint();
  if (!coin || coin.decimals < 2) return null;

  // Один торг на каждый срок закрытия.
  const bySale = new Map<string, typeof drafts>();
  for (const lot of drafts) {
    const key = lot.closes_at as string;
    bySale.set(key, [...(bySale.get(key) ?? []), lot]);
  }

  let opened = 0;
  for (const [closesAt, lots] of bySale) {
    const saleId = crypto.randomUUID();
    const batches: TransactionInstruction[][] = [];
    const lotIxs = lots.map((lot) =>
      openLot(seller, saleId, lot.id, coin.mint, centsToUnits(lot.reserve_cents, coin.decimals), centsToUnits(lot.min_step_cents, coin.decimals)),
    );
    for (let at = 0; at < lotIxs.length; at += LOTS_PER_TX) {
      batches.push(lotIxs.slice(at, at + LOTS_PER_TX));
    }
    // Срок пруфа - один на торг: самый поздний из его мест. Программа не
    // примет срок раньше жёсткого конца торга (закрытие плюс час продления),
    // и экран цен раньше его не даёт; без срока торг не открываем вовсе.
    const proofBy = Math.max(...lots.map((lot) => (lot.proof_by ? Date.parse(lot.proof_by as string) : 0)));
    if (proofBy / 1000 < minProofDeadline(Date.parse(closesAt) / 1000)) return null;
    // Торг открывается первой транзакцией вместе с первыми местами.
    batches[0]!.unshift(openSale(seller, saleId, Date.parse(closesAt), proofBy));

    for (const [index, instructions] of batches.entries()) {
      const { blockhash } = await connection.getLatestBlockhash();
      const transaction = new VersionedTransaction(
        new TransactionMessage({
          payerKey: seller,
          recentBlockhash: blockhash,
          instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...instructions],
        }).compileToV0Message(),
      );
      const signature = await sendSigned(await sign(transaction));
      if ((await settled(signature)) !== "ok") return null;

      const done = lots.slice(index * LOTS_PER_TX, (index + 1) * LOTS_PER_TX);
      for (const lot of done) {
        const { error } = await db
          .from("lots")
          .update({
            status: "open",
            chain_lot: lotAddress(lot.id).toBase58(),
            chain_sale: saleAddress(saleId).toBase58(),
            mint: coin.mint.toBase58(),
          })
          .eq("id", lot.id);
        if (error) return null;
        opened += 1;
      }
    }
  }
  return opened;
}
