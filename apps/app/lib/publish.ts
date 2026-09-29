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
import { auctionBytes, connection, lotAddress, saleAddress, sendSigned, settled } from "./chain.ts";
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
/** `seller_opens_sale` и `seller_opens_lot` из IDL. */
const OPEN_SALE = new Uint8Array([28, 241, 5, 89, 66, 221, 82, 99]);
const OPEN_LOT = new Uint8Array([219, 91, 199, 189, 78, 98, 42, 205]);
/** Продление ставкой под конец - как у первой футболки. */
const EXTEND_SECONDS = 300;
/**
 * Сколько мест в одной транзакции. Каждое место - два новых аккаунта (лот и
 * хранилище); больше трёх упирается в лимит вычислений и размер пакета.
 */
const LOTS_PER_TX = 3;

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

function i64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, value, true);
  return out;
}

function openSale(seller: PublicKey, saleId: string, closesAt: number): TransactionInstruction {
  const [config] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
  const data = Buffer.concat([
    OPEN_SALE,
    auctionBytes(saleId),
    i64(BigInt(Math.floor(closesAt / 1000))),
    i64(BigInt(EXTEND_SECONDS)),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data,
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
 * Сколько мест в каждом торге: места с одним сроком закрытия идут одним
 * торгом, с разными - разными (как их и открывает publishAuctions).
 */
export function spotsPerSale(closesAt: string[]): number[] {
  const bySale = new Map<string, number>();
  for (const at of closesAt) bySale.set(at, (bySale.get(at) ?? 0) + 1);
  return [...bySale.values()];
}

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
    .select("id, reserve_cents, min_step_cents, closes_at")
    .eq("thing_id", thingId)
    .eq("status", "draft");
  if (!drafts || drafts.length === 0) return 0;

  const coin = await platformMint();
  if (!coin || coin.decimals < 2) return null;
  const units = (cents: number) => BigInt(cents) * 10n ** BigInt(coin.decimals - 2);

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
      openLot(seller, saleId, lot.id, coin.mint, units(lot.reserve_cents), units(lot.min_step_cents)),
    );
    for (let at = 0; at < lotIxs.length; at += LOTS_PER_TX) {
      batches.push(lotIxs.slice(at, at + LOTS_PER_TX));
    }
    // Торг открывается первой транзакцией вместе с первыми местами.
    batches[0]!.unshift(openSale(seller, saleId, Date.parse(closesAt)));

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
          .update({ status: "open", chain_lot: lotAddress(lot.id).toBase58(), mint: coin.mint.toBase58() })
          .eq("id", lot.id);
        if (error) return null;
        opened += 1;
      }
    }
  }
  return opened;
}
