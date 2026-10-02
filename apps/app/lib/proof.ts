"use client";

import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { proofPayload } from "@oxar/core";
import {
  connection,
  decodeLot,
  proofInstruction,
  readSale,
  sendSigned,
  settled,
  type ChainLot,
  type ChainSale,
} from "./chain.ts";
import { db } from "./session.ts";

/**
 * Пруф торга со стороны продавца: что показать, что прислать.
 *
 * Деньги решает программа (выплата после пруфа и окна в 72 часа), здесь -
 * то, что программа держать не может: сами фото и ссылки. Хеш их записи
 * уходит в программу, запись - в базу; сверить их можно по `proofPayload`.
 */

export type ProofRow = {
  sale: string;
  photos: string[];
  links: string[];
  note: string | null;
  hash: string;
  signature: string | null;
  provedAt: string;
};

export type SaleView = {
  address: PublicKey;
  /** Торг в программе; null - не прочитался (нет сети) или закрыт. */
  chain: ChainSale | null;
  /** Места торга с победителем: id лота, адрес и состояние в программе. */
  spots: { lotId: string; address: PublicKey; chain: ChainLot | null }[];
  proof: ProofRow | null;
};

/** Торги вещи, открытые с защитой покупателя, с их пруфами. */
export async function loadThingSales(thingId: string): Promise<SaleView[]> {
  if (!db) return [];
  const { data: lots } = await db
    .from("lots")
    .select("id, status, chain_lot, chain_sale")
    .eq("thing_id", thingId)
    .not("chain_sale", "is", null)
    .in("status", ["open", "won", "unsold"]);
  if (!lots || lots.length === 0) return [];

  const sales = [...new Set(lots.map((lot) => lot.chain_sale as string))];
  const { data: proofs } = await db
    .from("proofs")
    .select("sale, photos, links, note, hash, signature, proved_at")
    .in("sale", sales);

  return Promise.all(
    sales.map(async (sale) => {
      const address = new PublicKey(sale);
      const mine = lots.filter((lot) => lot.chain_sale === sale && lot.chain_lot);
      const accounts = await connection
        .getMultipleAccountsInfo(mine.map((lot) => new PublicKey(lot.chain_lot as string)))
        .catch(() => mine.map(() => null));
      const row = (proofs ?? []).find((one) => one.sale === sale);
      return {
        address,
        chain: await readSale(address).catch(() => null),
        spots: mine.map((lot, at) => ({
          lotId: lot.id as string,
          address: new PublicKey(lot.chain_lot as string),
          chain: accounts[at] ? decodeLot(accounts[at]!.data) : null,
        })),
        proof: row
          ? {
              sale: row.sale,
              photos: row.photos ?? [],
              links: row.links ?? [],
              note: row.note,
              hash: row.hash,
              signature: row.signature,
              provedAt: row.proved_at,
            }
          : null,
      };
    }),
  );
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

const hex = (bytes: Uint8Array) => [...bytes].map((one) => one.toString(16).padStart(2, "0")).join("");

export type Signer = (transaction: VersionedTransaction) => Promise<Uint8Array>;

/**
 * Прислать пруф: фото в хранилище, хеш записи - в программу подписью
 * продавца, запись - в базу.
 *
 * Программа принимает пруф один раз. Если цепочка приняла, а запись в базу
 * не легла, повтор дозаписывает её по тем же фото, не трогая цепочку.
 */
export async function submitProof(
  thingId: string,
  sale: PublicKey,
  seller: PublicKey,
  parts: { files: File[]; uploaded?: string[]; links: string[]; note: string },
  sign: Signer,
): Promise<{ ok: true } | { ok: false; uploaded: string[]; onChain: boolean; why: string }> {
  if (!db) return { ok: false, uploaded: [], onChain: false, why: "No connection." };

  const uploaded = [...(parts.uploaded ?? [])];
  for (const file of parts.files.slice(uploaded.length)) {
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `proof/${thingId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage.from("things").upload(path, file, { contentType: file.type || undefined });
    if (error) return { ok: false, uploaded, onChain: false, why: "Could not upload a photo. Try again." };
    uploaded.push(path);
  }

  const links = parts.links.map((one) => one.trim()).filter((one) => one.length > 0);
  const note = parts.note.trim();
  const hash = await sha256(proofPayload({ photos: uploaded, links, note }));

  // Пруф уже в программе (прошлая попытка дошла до цепочки) - только запись.
  const chain = await readSale(sale).catch(() => null);
  let signature: string | null = null;
  if (!chain || chain.provedAt === 0) {
    const { blockhash } = await connection.getLatestBlockhash();
    const transaction = new VersionedTransaction(
      new TransactionMessage({
        payerKey: seller,
        recentBlockhash: blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
          proofInstruction(seller, sale, hash),
        ],
      }).compileToV0Message(),
    );
    try {
      signature = await sendSigned(await sign(transaction));
    } catch {
      return { ok: false, uploaded, onChain: false, why: "The proof was not sent. Check the wallet and try again." };
    }
    if ((await settled(signature)) !== "ok") {
      return { ok: false, uploaded, onChain: false, why: "The network did not accept the proof. Try again." };
    }
  }

  const { error } = await db.from("proofs").insert({
    sale: sale.toBase58(),
    thing_id: thingId,
    photos: uploaded,
    links,
    note: note || null,
    hash: hex(hash),
    signature,
  });
  if (error) return { ok: false, uploaded, onChain: true, why: "The proof is on chain, but saving it failed. Try again." };
  return { ok: true };
}
