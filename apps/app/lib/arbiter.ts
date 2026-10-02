"use client";

import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import {
  connection,
  decideInstruction,
  decodeLot,
  moveProofInstruction,
  readSale,
  settled,
  type ChainLot,
  type ChainSale,
} from "./chain.ts";
import type { ProofRow } from "./proof.ts";
import { db } from "./session.ts";

/**
 * Арбитр - админ настроек программы (в mainnet - ключ владельца в Phantom).
 * Его две кнопки: решить спор по месту и перенести срок пруфа торга. Обе
 * подписываются Phantom прямо здесь: ключа арбитра нет ни на сервере, ни в
 * Privy. Перед подписью транзакция прогоняется вхолостую - видно, примет ли
 * её программа.
 */

type Phantom = {
  isPhantom?: boolean;
  publicKey: PublicKey | null;
  connect(): Promise<{ publicKey: PublicKey }>;
  signAndSendTransaction(tx: VersionedTransaction): Promise<{ signature: string }>;
};

function phantom(): Phantom | null {
  const found = (window as unknown as { phantom?: { solana?: Phantom } }).phantom?.solana;
  return found?.isPhantom ? found : null;
}

/** Подписать в Phantom после холостого прогона. Возвращает подпись или текст ошибки. */
async function signInPhantom(
  build: (arbiter: PublicKey) => ReturnType<typeof decideInstruction>,
): Promise<{ ok: true; signature: string } | { ok: false; why: string }> {
  const wallet = phantom();
  if (!wallet) return { ok: false, why: "Phantom is not in this browser." };
  const arbiter = wallet.publicKey ?? (await wallet.connect()).publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      payerKey: arbiter,
      recentBlockhash: blockhash,
      instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), build(arbiter)],
    }).compileToV0Message(),
  );
  const sim = await connection.simulateTransaction(transaction, { sigVerify: false });
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).filter((one) => one.includes("Error") || one.includes("failed")).join(" ");
    return { ok: false, why: `The program would reject it: ${logs || JSON.stringify(sim.value.err)}` };
  }
  try {
    const { signature } = await wallet.signAndSendTransaction(transaction);
    return (await settled(signature)) === "ok" ? { ok: true, signature } : { ok: false, why: "Sent, but not confirmed." };
  } catch {
    return { ok: false, why: "Not signed in Phantom." };
  }
}

export type Dispute = {
  lotId: string;
  spot: string;
  thing: string;
  reason: string;
  createdAt: string;
  sellerBps: number | null;
  saleAddress: PublicKey;
  lotAddress: PublicKey;
  sale: ChainSale | null;
  /** null - место уже закрыто: решено или вышло по сроку. */
  lot: ChainLot | null;
  proof: ProofRow | null;
};

/** Все споры, нерешённые сверху. Админ видит их все по политике базы. */
export async function loadDisputes(): Promise<Dispute[]> {
  if (!db) return [];
  const { data: rows } = await db
    .from("disputes")
    .select("lot_id, reason, created_at, seller_bps, lots(chain_lot, chain_sale, thing_spots(label), things:thing_id(title))")
    .order("created_at", { ascending: false });
  if (!rows || rows.length === 0) return [];
  const lots = rows.map((row) => row.lots as unknown as {
    chain_lot: string;
    chain_sale: string;
    thing_spots: { label?: string } | null;
    things: { title?: string } | null;
  });
  const sales = [...new Set(lots.map((one) => one.chain_sale))];
  const [{ data: proofs }, accounts, chainSales] = await Promise.all([
    db.from("proofs").select("sale, photos, links, note, hash, signature, proved_at").in("sale", sales),
    connection.getMultipleAccountsInfo(lots.map((one) => new PublicKey(one.chain_lot))).catch(() => null),
    Promise.all(sales.map(async (sale) => [sale, await readSale(new PublicKey(sale)).catch(() => null)] as const)),
  ]);
  const saleMap = new Map(chainSales);
  const list = rows.map((row, at) => {
    const lot = lots[at]!;
    const proof = (proofs ?? []).find((one) => one.sale === lot.chain_sale);
    return {
      lotId: row.lot_id as string,
      spot: lot.thing_spots?.label ?? "?",
      thing: lot.things?.title ?? "",
      reason: row.reason as string,
      createdAt: row.created_at as string,
      sellerBps: (row.seller_bps as number | null) ?? null,
      saleAddress: new PublicKey(lot.chain_sale),
      lotAddress: new PublicKey(lot.chain_lot),
      sale: saleMap.get(lot.chain_sale) ?? null,
      lot: accounts?.[at] ? decodeLot(accounts[at]!.data) : null,
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
    };
  });
  return list.sort((a, b) => Number(a.sellerBps !== null) - Number(b.sellerBps !== null));
}

export async function decideDispute(dispute: Dispute, sellerBps: number) {
  if (!db || !dispute.sale || !dispute.lot) return { ok: false as const, why: "This spot is already settled." };
  const result = await signInPhantom((arbiter) =>
    decideInstruction(arbiter, dispute.saleAddress, dispute.sale!, dispute.lotAddress, dispute.lot!, sellerBps),
  );
  if (result.ok) {
    await db
      .from("disputes")
      .update({ seller_bps: sellerBps, decided_at: new Date().toISOString(), decision_signature: result.signature })
      .eq("lot_id", dispute.lotId);
  }
  return result;
}

export type AwaitingProof = { sale: PublicKey; thing: string; chain: ChainSale };

/** Торги с победителями, у которых ещё нет пруфа: им можно отодвинуть срок. */
export async function loadAwaitingProof(): Promise<AwaitingProof[]> {
  if (!db) return [];
  const { data: lots } = await db
    .from("lots")
    .select("chain_sale, things:thing_id(title)")
    .eq("status", "won")
    .not("chain_sale", "is", null);
  if (!lots || lots.length === 0) return [];
  const bySale = new Map<string, string>();
  for (const lot of lots) bySale.set(lot.chain_sale as string, (lot.things as { title?: string } | null)?.title ?? "");
  const { data: proofs } = await db.from("proofs").select("sale").in("sale", [...bySale.keys()]);
  const proved = new Set((proofs ?? []).map((one) => one.sale));
  const out: AwaitingProof[] = [];
  for (const [sale, thing] of bySale) {
    if (proved.has(sale)) continue;
    const chain = await readSale(new PublicKey(sale)).catch(() => null);
    if (chain && chain.proofDeadline > 0 && chain.provedAt === 0) out.push({ sale: new PublicKey(sale), thing, chain });
  }
  return out;
}

export async function moveProof(sale: PublicKey, newDeadlineMs: number) {
  if (!db) return { ok: false as const, why: "No connection." };
  const result = await signInPhantom((arbiter) => moveProofInstruction(arbiter, sale, newDeadlineMs));
  if (result.ok) {
    await db.rpc("admin_moves_proof_by", { sale: sale.toBase58(), proof_by: new Date(newDeadlineMs).toISOString() });
  }
  return result;
}
