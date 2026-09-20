"use client";

import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { Buffer } from "buffer";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { USDC_DECIMALS, toUsdcBaseUnits } from "@oxar/core";

/**
 * Разговор со своей программой на Solana.
 *
 * Источник истины про торг - цепочка, а не наша база. В базе лежит витрина:
 * что показать на экране и что было раньше. Поэтому ставка строится по тому,
 * что прочитано из сети: и минимальная сумма, и прежний лидер, чей счёт
 * обязан стоять в транзакции ровно тот, что записан в лоте.
 *
 * Клиент Anchor сюда не приехал намеренно: он тянет в браузер полсотни
 * килобайт ради одной инструкции с одним числом. Дискриминатор взят из IDL
 * (`chain/idl/oxar_escrow.json`), и если инструкцию переименуют, он изменится
 * вместе с ней - это ровно то, для чего дискриминаторы и нужны.
 */

/** Адрес программы. Он вшит в неё саму (`declare_id!`) и одинаков во всех сетях. */
const PROGRAM_ID = new PublicKey("Hzh8CjF8ZmmtqVro2dVR54uFVcyjWfp3Aenvh782QYr5");

/** `bidder_places_bid` из IDL. */
const PLACE_BID = new Uint8Array([172, 147, 26, 172, 0, 179, 171, 148]);

const CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as
  | "devnet"
  | "mainnet-beta";

/** Как сеть называется у кошелька: он говорит на языке wallet-standard. */
export const WALLET_CHAIN =
  CLUSTER === "devnet" ? "solana:devnet" : "solana:mainnet";

export const connection = new Connection(clusterApiUrl(CLUSTER), "confirmed");

export type ChainLot = {
  mint: PublicKey;
  /** Кто сейчас ведёт. Его счёт обязан стоять в следующей ставке. */
  topBidder: PublicKey | null;
  topBid: bigint;
  reserve: bigint;
  minStep: bigint;
  /** Момент закрытия, секунды epoch. */
  closesAt: number;
};

/** uuid лота в шестнадцать байт: ровно то, что программа кладёт в сиды. */
export function auctionBytes(lotId: string): Uint8Array {
  const hex = lotId.replace(/-/g, "");
  if (hex.length !== 32) throw new Error(`«${lotId}» не похож на uuid`);
  return Uint8Array.from(
    hex.match(/../g)!.map((pair) => Number.parseInt(pair, 16)),
  );
}

export function lotAddress(lotId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("lot"), auctionBytes(lotId)],
    PROGRAM_ID,
  )[0];
}

/**
 * Прочитать лот из аккаунта.
 *
 * Разбор идёт подряд, а не по готовым сдвигам, и это не лень: `top_bidder` -
 * это `Option<Pubkey>`, и borsh пишет его байтом-признаком плюс тридцатью
 * двумя байтами только когда лидер есть. Значит всё, что лежит дальше,
 * съезжает на эти тридцать два байта, стоит появиться первой ставке.
 */
export function decodeLot(data: Uint8Array): ChainLot {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Восемь байт дискриминатора аккаунта и тридцать два - продавец.
  let at = 8 + 32;

  const mint = new PublicKey(data.slice(at, at + 32));
  at += 32;

  const led = data[at] === 1;
  at += 1;
  const topBidder = led ? new PublicKey(data.slice(at, at + 32)) : null;
  if (led) at += 32;

  const topBid = view.getBigUint64(at, true);
  const reserve = view.getBigUint64(at + 8, true);
  const minStep = view.getBigUint64(at + 16, true);
  const closesAt = Number(view.getBigInt64(at + 24, true));

  return { mint, topBidder, topBid, reserve, minStep, closesAt };
}

export async function readLot(lotId: string): Promise<ChainLot | null> {
  const account = await connection.getAccountInfo(lotAddress(lotId));
  // Лота в цепочке может не быть: строка заводится раньше него. Такой торг
  // ещё не принимает ставок, и это не сбой.
  return account ? decodeLot(account.data) : null;
}

/**
 * Наименьшая ставка, которую примет программа. Считается её же арифметикой.
 *
 * То же правило живёт в `packages/core` для экрана и в триггере базы как
 * последний барьер. Здесь оно повторено третий раз не от небрежности: те двое
 * считают в центах и округляют, а программа делит целые базовые единицы и
 * отбрасывает остаток. На круглых долларах числа совпадают до единицы, но
 * стоит верхней ставке оказаться, скажем, $50.01 - и округлённый центами
 * минимум окажется на полцента ниже того, что примет программа.
 */
export function minNextUnits(lot: ChainLot): bigint {
  if (!lot.topBidder) return lot.reserve;
  const step = (lot.topBid * 5n) / 100n;
  return lot.topBid + (step > lot.minStep ? step : lot.minStep);
}

const UNITS_PER_CENT = BigInt(10 ** (USDC_DECIMALS - 2));

/** Тот же минимум в центах, вверх до целого: ставку набирают центами. */
export function minNextCents(lot: ChainLot): number {
  const units = minNextUnits(lot);
  return Number((units + UNITS_PER_CENT - 1n) / UNITS_PER_CENT);
}

/**
 * Транзакция ставки.
 *
 * Прежний лидер стоит в ней отдельным счётом, потому что ему той же
 * транзакцией возвращаются деньги. Когда ставок ещё не было, на его место
 * встаёт сам участник - возврата не будет, а счёт всё равно нужен.
 */
export async function bidTransaction(
  lotId: string,
  lot: ChainLot,
  bidder: PublicKey,
  amountCents: number,
): Promise<VersionedTransaction> {
  const lotKey = lotAddress(lotId);
  const [vault] = PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("lot_vault"), lotKey.toBytes()],
    PROGRAM_ID,
  );
  const previous = lot.topBidder ?? bidder;

  const data = new Uint8Array(16);
  data.set(PLACE_BID, 0);
  new DataView(data.buffer).setBigUint64(
    8,
    BigInt(toUsdcBaseUnits(amountCents)),
    true,
  );

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(data),
    keys: [
      { pubkey: bidder, isSigner: true, isWritable: true },
      { pubkey: lotKey, isSigner: false, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: ata(lot.mint, bidder), isSigner: false, isWritable: true },
      { pubkey: previous, isSigner: false, isWritable: false },
      { pubkey: ata(lot.mint, previous), isSigner: false, isWritable: true },
      { pubkey: lot.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });

  const { blockhash } = await connection.getLatestBlockhash();
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: bidder,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message(),
  );
}

/**
 * Дождаться, чем кончилась транзакция.
 *
 * Три исхода, а не два: кошелёк возвращает подпись раньше, чем сеть решает
 * судьбу ставки, и «не дождались» - это не «не прошло». Свалить их в одно
 * значило бы сказать человеку «ничего не списано» там, где списано.
 */
export async function settled(
  signature: string,
): Promise<"ok" | "failed" | "unknown"> {
  for (let tries = 0; tries < 30; tries++) {
    const { value } = await connection.getSignatureStatuses([signature]);
    const status = value[0];
    if (status?.err) return "failed";
    if (status?.confirmationStatus === "confirmed") return "ok";
    if (status?.confirmationStatus === "finalized") return "ok";
    await new Promise((done) => setTimeout(done, 1000));
  }
  return "unknown";
}

/** Счёт монеты у владельца. Токен-программа одна - та, на которой живёт USDC. */
function ata(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true);
}
