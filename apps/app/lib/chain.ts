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
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { ACCOUNT_OVERHEAD, EXTEND_SECONDS, centsToUnits, hasFeeSol } from "@oxar/core";

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
const PROGRAM_ID = new PublicKey("4zBp61iGL7f9zybTfrtwydUZmM2WxRsskedqFNdHiDpe");
/** Загрузчик программ: у него лежит право на обновление нашей. */
const LOADER_UPGRADEABLE = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

/** `bidder_places_bid` из IDL. */
const PLACE_BID = new Uint8Array([172, 147, 26, 172, 0, 179, 171, 148]);

/** Программа Memo: подписывает транзакцию текстом, который видно в кошельке. */
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

// `||`, а не `??`: на проде переменная приходит пустой строкой, а не
// отсутствует, и `??` пропускал бы её как заданное значение. Пустая строка -
// это «не задано», и тогда девнет. Иначе `""` !== `"devnet"` уводило кошелёк
// в mainnet, пока торги шли на девнете.
const CLUSTER = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER || "devnet") as
  | "devnet"
  | "mainnet-beta";

/** Как сеть называется у кошелька: он говорит на языке wallet-standard. */
export const WALLET_CHAIN =
  CLUSTER === "devnet" ? "solana:devnet" : "solana:mainnet";

/**
 * Сеть и её нода - для конфигурации Privy.
 *
 * Кошелёк Privy сам шлёт транзакцию в сеть и требует, чтобы нода этой сети была
 * названа в его конфиге, иначе `signAndSendTransaction` падает с «No RPC
 * configuration found». Значит и экран, и Privy обязаны знать одну и ту же
 * сеть, и берут они её отсюда, а не каждый из своего `process.env`.
 */
export const SOLANA_CLUSTER = CLUSTER;
export const SOLANA_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl(CLUSTER);

/**
 * Тот же адрес, но для подписки на события по WebSocket. Его требует Privy для
 * своего кошелька: он не только шлёт транзакцию, но и ждёт её подтверждения по
 * сокету. Выводим из RPC-адреса заменой схемы - у публичной ноды Solana и у
 * большинства провайдеров ws живёт по тому же хосту. Отдельный ws-адрес, если
 * он у ноды другой, зададим переменной, когда до неё дойдёт.
 */
export const SOLANA_WS_URL =
  process.env.NEXT_PUBLIC_SOLANA_WS ||
  SOLANA_RPC_URL.replace(/^http/, "ws");

/**
 * Своя нода, если она есть.
 *
 * `clusterApiUrl` отдаёт публичную ноду Solana Labs. Для девнета этого хватает,
 * для боевой сети - нет: она режет частые запросы и отвечает отказом тем
 * чаще, чем больше людей на экране, а экран спрашивает её на каждую ставку и
 * на каждый выбор места. Адрес своей ноды публичный, как и всё остальное
 * здесь: он уезжает в браузер вместе с бандлом.
 */
export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

/**
 * Ставка залога сети в лампортах за байт. Сеть её снижает по шагам
 * (SIMD-0437), поэтому спрашиваем, а не помним: залог пустого аккаунта -
 * это 128 байт служебных данных по ставке.
 */
export async function rentPerByte(): Promise<number> {
  return (await connection.getMinimumBalanceForRentExemption(0)) / ACCOUNT_OVERHEAD;
}

export type ChainLot = {
  /** Торг вещи, которому место принадлежит. Срок живёт там, а не здесь. */
  sale: PublicKey;
  mint: PublicKey;
  /** Кто сейчас ведёт. Его счёт обязан стоять в следующей ставке. */
  topBidder: PublicKey | null;
  topBid: bigint;
  reserve: bigint;
  minStep: bigint;
  /** Победитель оспорил пруф: деньги места ждут арбитра. */
  disputed: boolean;
  /** Когда оспорили, секунды epoch; ноль - спора не было. */
  disputedAt: number;
};

/** Торг вещи целиком: срок один на все её места. */
export type ChainSale = {
  seller: PublicKey;
  platform: PublicKey;
  /** Момент закрытия всей вещи, секунды epoch. */
  closesAt: number;
  extendSeconds: number;
  feeBps: number;
  /** Дальше этого ставки торг не продлят; ноль - торг открыт до потолка. */
  hardClosesAt: number;
  /** До когда продавец обязан прислать пруф; ноль - торг до защиты покупателя. */
  proofDeadline: number;
  /** Когда пришёл пруф; ноль - ещё нет. */
  provedAt: number;
  /** Срок пруфа при открытии торга: от него потолок переносов. */
  firstProofDeadline: number;
};

/** `seller_opens_sale` из IDL. */
const OPEN_SALE = new Uint8Array([28, 241, 5, 89, 66, 221, 82, 99]);
function i64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigInt64(0, value, true);
  return out;
}

/** Дискриминаторы инструкций защиты покупателя - из IDL. */
const SUBMIT_PROOF = new Uint8Array([56, 171, 129, 167, 249, 210, 127, 218]);
const DISPUTE = new Uint8Array([100, 80, 101, 176, 187, 14, 90, 123]);
const PAY = new Uint8Array([36, 169, 202, 43, 22, 233, 147, 190]);
const DECIDE = new Uint8Array([125, 152, 123, 57, 231, 57, 241, 89]);
const MOVE_PROOF = new Uint8Array([51, 172, 4, 45, 206, 188, 43, 192]);
/** Разрешение админа на торг без пруфа - из IDL. */
const PERMIT_SALE = new Uint8Array([159, 156, 93, 203, 15, 186, 204, 167]);
const REVOKE_PERMIT = new Uint8Array([90, 92, 105, 98, 172, 168, 160, 230]);
/** Условия площадки - из IDL: комиссия, касса, монета, админ. */
const SET_TERMS = new Uint8Array([184, 202, 182, 27, 206, 9, 24, 159]);

function join(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, one) => sum + one.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Пруф продавца: в программу уходит только sha256 записи пруфа. */
export function proofData(hash: Uint8Array): Uint8Array {
  if (hash.length !== 32) throw new Error("хеш пруфа - тридцать два байта");
  return join(SUBMIT_PROOF, hash);
}

/** Спор победителя: аргументов нет. */
export function disputeData(): Uint8Array {
  return DISPUTE.slice();
}

/** Выплата места: её зовёт победитель («Looks good») или расчёт после окна. */
export function payData(): Uint8Array {
  return PAY.slice();
}

/** Решение арбитра: доля продавцу в сотых процента, u16. */
export function decideData(sellerBps: number): Uint8Array {
  const bps = new Uint8Array(2);
  new DataView(bps.buffer).setUint16(0, sellerBps, true);
  return join(DECIDE, bps);
}

/**
 * Новая комиссия площадки в сотых процента. Админство не передаётся
 * (new_admin = None): передача необратима, и кнопки для неё нет нарочно.
 */
export function termsData(feeBps: number): Uint8Array {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error("комиссия - целое число от 0 до 10 000 сотых процента");
  }
  const bps = new Uint8Array(2);
  new DataView(bps.buffer).setUint16(0, feeBps, true);
  return join(SET_TERMS, bps, new Uint8Array([0]));
}

/** Перенос срока пруфа: новое время - миллисекунды на входе, секунды в программу. */
export function moveProofData(newDeadlineMs: number): Uint8Array {
  return join(MOVE_PROOF, i64(BigInt(Math.floor(newDeadlineMs / 1000))));
}

/**
 * Данные инструкции открытия торга: id, срок закрытия, продление, срок пруфа.
 * Время на входе - миллисекунды, в программу уходят секунды. Порядок полей -
 * как в IDL; тест сверяет байты с кодировщиком Anchor.
 */
export function openSaleData(saleId: string, closesAtMs: number, proofByMs: number): Uint8Array {
  return join(
    OPEN_SALE,
    auctionBytes(saleId),
    i64(BigInt(Math.floor(closesAtMs / 1000))),
    i64(BigInt(EXTEND_SECONDS)),
    i64(BigInt(Math.floor(proofByMs / 1000))),
  );
}

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

/** Адрес торга вещи по его uuid из базы. */
export function saleAddress(saleId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("sale"), auctionBytes(saleId)],
    PROGRAM_ID,
  )[0];
}

/**
 * Прочитать место из аккаунта.
 *
 * Разбор идёт подряд, а не по готовым сдвигам, и это не лень: `top_bidder` -
 * это `Option<Pubkey>`, и borsh пишет его байтом-признаком плюс тридцатью
 * двумя байтами только когда лидер есть. Значит всё, что лежит дальше,
 * съезжает на эти тридцать два байта, стоит появиться первой ставке.
 *
 * Срока здесь нет: он общий на вещь и лежит в торге. Его читает `decodeSale`.
 */
export function decodeLot(data: Uint8Array): ChainLot {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Восемь байт дискриминатора аккаунта, дальше сразу торг: продавец переехал
  // в него, у места его больше нет.
  let at = 8;

  const sale = new PublicKey(data.slice(at, at + 32));
  at += 32;

  const mint = new PublicKey(data.slice(at, at + 32));
  at += 32;

  const led = data[at] === 1;
  at += 1;
  const topBidder = led ? new PublicKey(data.slice(at, at + 32)) : null;
  if (led) at += 32;

  const topBid = view.getBigUint64(at, true);
  const reserve = view.getBigUint64(at + 8, true);
  const minStep = view.getBigUint64(at + 16, true);
  at += 24;

  // Шестнадцать байт uuid и два bump, дальше спор - в прежнем запасе.
  at += 16 + 2;
  const disputed = data[at] === 1;
  const disputedAt = Number(view.getBigInt64(at + 1, true));

  return { sale, mint, topBidder, topBid, reserve, minStep, disputed, disputedAt };
}

/** Прочитать торг вещи: срок, продление и комиссия - общие на все места. */
export function decodeSale(data: Uint8Array): ChainSale {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Дискриминатор и шестнадцать байт uuid торга.
  let at = 8 + 16;

  const seller = new PublicKey(data.slice(at, at + 32));
  at += 32;
  const platform = new PublicKey(data.slice(at, at + 32));
  at += 32;

  const closesAt = Number(view.getBigInt64(at, true));
  const extendSeconds = Number(view.getBigInt64(at + 8, true));
  const feeBps = view.getUint16(at + 16, true);
  // Комиссия (2) и bump (1), дальше поля, легшие в прежний запас.
  at += 16 + 2 + 1;
  const hardClosesAt = Number(view.getBigInt64(at, true));
  const proofDeadline = Number(view.getBigInt64(at + 8, true));
  const provedAt = Number(view.getBigInt64(at + 16, true));
  const firstProofDeadline = Number(view.getBigInt64(at + 24, true));

  return { seller, platform, closesAt, extendSeconds, feeBps, hardClosesAt, proofDeadline, provedAt, firstProofDeadline };
}

export async function readLot(lotId: string): Promise<ChainLot | null> {
  const account = await connection.getAccountInfo(lotAddress(lotId));
  // Лота в цепочке может не быть: строка заводится раньше него. Такой торг
  // ещё не принимает ставок, и это не сбой.
  return account ? decodeLot(account.data) : null;
}

/**
 * Прочитать торг вещи по адресу из места.
 *
 * Срок торга спрашиваем у цепочки, а не у базы: там он общий на все места и
 * двигается ставкой под конец. База его повторяет для показа, но решает
 * программа.
 */
export async function readSale(sale: PublicKey): Promise<ChainSale | null> {
  const account = await connection.getAccountInfo(sale);
  return account ? decodeSale(account.data) : null;
}

/**
 * Сколько монеты торга лежит на кошельке - в базовых единицах.
 *
 * Ставить вслепую нельзя: человек должен видеть, хватает ли ему. Монету берём
 * не из базы, а из самого лота - ставка идёт в неё, и баланс надо показывать
 * ровно по ней.
 *
 * Счёта монеты у кошелька может не быть вовсе - тогда на нём ноль, а не ошибка:
 * `getTokenAccountBalance` на несуществующем счёте кидает, и мы гасим это в
 * ноль. Иначе чтение баланса роняло бы форму у всякого, кто монету ещё не
 * держал.
 */
export async function walletUnits(
  mint: PublicKey,
  owner: PublicKey,
): Promise<bigint> {
  try {
    const balance = await connection.getTokenAccountBalance(ata(mint, owner));
    return BigInt(balance.value.amount);
  } catch {
    return 0n;
  }
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
  new DataView(data.buffer).setBigUint64(8, centsToUnits(amountCents), true);

  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(data),
    keys: [
      { pubkey: bidder, isSigner: true, isWritable: true },
      // Торг вещи меняется этой же транзакцией: ставка под конец двигает его
      // срок, и двигает сразу всем местам футболки.
      { pubkey: lot.sale, isSigner: false, isWritable: true },
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

  const instructions = [instruction];
  // Возврат прежнему лидеру уходит этой же транзакцией, и в его кошельке он
  // выглядит безымянным приходом USDC. Мемо подписывает, что это и откуда.
  if (lot.topBidder && !lot.topBidder.equals(bidder)) {
    instructions.push(
      new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [],
        data: Buffer.from("You've been outbid on OXAR - app.oxar.app", "utf8"),
      }),
    );
  }

  const { blockhash } = await connection.getLatestBlockhash();
  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: bidder,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message(),
  );
}

/**
 * Нечем заплатить комиссию сети: на кошельке нет SOL. Кошелёк Privy рождается
 * пустым, люди кладут на него только USDC - и ставка подписывается, а сеть её
 * молча отбрасывает (отправка без предпроверки), и человек видел «потеряли
 * ставку». Баланс не прочитался - не мешаем: пусть решает сеть.
 */
export async function lacksFeeSol(owner: PublicKey): Promise<boolean> {
  const lamports = await connection.getBalance(owner).catch(() => null);
  return lamports !== null && !hasFeeSol(lamports);
}

/** Что сказать человеку без SOL на комиссию. */
export const NO_FEE_SOL =
  "Your wallet has no SOL for the network fee. Send about 0.01 SOL to your wallet address (You, Wallet) and try again. Nothing was charged.";

/**
 * Отправить подписанную транзакцию через нашу ноду и вернуть её подпись.
 *
 * Privy её только подписал: отправку и ожидание держим у себя, чтобы не
 * зависеть от его WebSocket. `bs58` для подписи не нужен - её печатает сама
 * нода в ответе на отправку.
 */
export async function sendSigned(signed: Uint8Array): Promise<string> {
  return connection.sendRawTransaction(signed, {
    // Транзакцию мы уже собрали и знаем валидной - симуляция на отправке
    // только удвоила бы задержку и второй раз ударила бы по ноде.
    skipPreflight: true,
    preflightCommitment: "confirmed",
  });
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

// ---------------------------------------------------------------------------
// Защита покупателя: инструкции. Порядок аккаунтов - как в IDL.

const CONFIG = PublicKey.findProgramAddressSync([new TextEncoder().encode("config")], PROGRAM_ID)[0];

function vaultOf(lot: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("lot_vault"), lot.toBytes()], PROGRAM_ID)[0];
}

/**
 * Завести счёт монеты получателю, если его нет; есть - инструкция пустая.
 * Программа платит только на готовый счёт, а закрыть свой счёт может любой -
 * например, победитель, чтобы застопорить решение арбитра. Создать счёт за
 * другого может кто угодно, поэтому перед каждой выплатой мы заводим его сами.
 */
export function ensureAccount(payer: PublicKey, mint: PublicKey, owner: PublicKey): TransactionInstruction {
  return createAssociatedTokenAccountIdempotentInstruction(payer, ata(mint, owner), owner, mint);
}

/** Продавец присылает пруф торга: подпись продавца, торг меняется. */
export function proofInstruction(seller: PublicKey, sale: PublicKey, hash: Uint8Array): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(proofData(hash)),
    keys: [
      { pubkey: seller, isSigner: true, isWritable: false },
      { pubkey: sale, isSigner: false, isWritable: true },
    ],
  });
}

/** Победитель оспаривает пруф: место замораживается. */
export function disputeInstruction(winner: PublicKey, sale: PublicKey, lot: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(disputeData()),
    keys: [
      { pubkey: winner, isSigner: true, isWritable: false },
      { pubkey: sale, isSigner: false, isWritable: false },
      { pubkey: lot, isSigner: false, isWritable: true },
    ],
  });
}

/**
 * Выплата места продавцу: 90% ему, 10% площадке, аренда аккаунтов - ему же.
 * Зовёт победитель («Looks good») или расчёт после окна спора.
 */
export function payInstruction(
  crank: PublicKey,
  saleAddress: PublicKey,
  sale: ChainSale,
  lotAddress: PublicKey,
  lot: ChainLot,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(payData()),
    keys: [
      { pubkey: crank, isSigner: true, isWritable: false },
      { pubkey: saleAddress, isSigner: false, isWritable: false },
      { pubkey: lotAddress, isSigner: false, isWritable: true },
      { pubkey: vaultOf(lotAddress), isSigner: false, isWritable: true },
      { pubkey: sale.seller, isSigner: false, isWritable: true },
      { pubkey: ata(lot.mint, sale.seller), isSigner: false, isWritable: true },
      { pubkey: sale.platform, isSigner: false, isWritable: false },
      { pubkey: ata(lot.mint, sale.platform), isSigner: false, isWritable: true },
      { pubkey: lot.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

/** Арбитр делит ставку оспоренного места: доля продавцу в сотых процента. */
export function decideInstruction(
  arbiter: PublicKey,
  saleAddress: PublicKey,
  sale: ChainSale,
  lotAddress: PublicKey,
  lot: ChainLot,
  sellerBps: number,
): TransactionInstruction {
  if (!lot.topBidder) throw new Error("у места нет победителя");
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(decideData(sellerBps)),
    keys: [
      { pubkey: arbiter, isSigner: true, isWritable: false },
      { pubkey: CONFIG, isSigner: false, isWritable: false },
      { pubkey: saleAddress, isSigner: false, isWritable: false },
      { pubkey: lotAddress, isSigner: false, isWritable: true },
      { pubkey: vaultOf(lotAddress), isSigner: false, isWritable: true },
      { pubkey: sale.seller, isSigner: false, isWritable: true },
      { pubkey: ata(lot.mint, sale.seller), isSigner: false, isWritable: true },
      { pubkey: sale.platform, isSigner: false, isWritable: false },
      { pubkey: ata(lot.mint, sale.platform), isSigner: false, isWritable: true },
      { pubkey: lot.topBidder, isSigner: false, isWritable: false },
      { pubkey: ata(lot.mint, lot.topBidder), isSigner: false, isWritable: true },
      { pubkey: lot.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

/** Разрешение на торг без пруфа: id торга и продавец, которому разрешено. */
export function permitData(saleId: string, seller: PublicKey): Uint8Array {
  return join(PERMIT_SALE, auctionBytes(saleId), seller.toBytes());
}

export function revokePermitData(saleId: string): Uint8Array {
  return join(REVOKE_PERMIT, auctionBytes(saleId));
}

/** Адрес разрешения выводится из id торга: на один торг - одно. */
export function permitAddress(saleId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [new TextEncoder().encode("permit"), auctionBytes(saleId)],
    PROGRAM_ID,
  )[0];
}

/** Админ разрешает продавцу открыть торг без пруфа: деньги по закрытию. */
export function permitInstruction(admin: PublicKey, saleId: string, seller: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(permitData(saleId, seller)),
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: CONFIG, isSigner: false, isWritable: false },
      { pubkey: permitAddress(saleId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

/** Админ отзывает разрешение, аренда возвращается ему. */
export function revokePermitInstruction(admin: PublicKey, saleId: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(revokePermitData(saleId)),
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: CONFIG, isSigner: false, isWritable: false },
      { pubkey: permitAddress(saleId), isSigner: false, isWritable: true },
    ],
  });
}

/** Условия площадки: кто админ, куда идёт комиссия, какая она, какая монета. */
export type Terms = { admin: PublicKey; platform: PublicKey; feeBps: number; mint: PublicKey };

/** Разбор аккаунта настроек: 8 байт метки, admin, platform, fee_bps, bump, mint. */
export function decodeConfig(data: Uint8Array): Terms {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    admin: new PublicKey(data.slice(8, 40)),
    platform: new PublicKey(data.slice(40, 72)),
    feeBps: view.getUint16(72, true),
    mint: new PublicKey(data.slice(75, 107)),
  };
}

/** Нынешние условия площадки из сети. null - настроек нет или не прочитались. */
export async function readTerms(): Promise<Terms | null> {
  const account = await connection.getAccountInfo(CONFIG);
  return account ? decodeConfig(account.data) : null;
}

/**
 * Админ меняет комиссию. Касса и монета передаются нынешние: инструкция
 * пишет все поля разом, и пустое поле обнулило бы кассу. Действует только на
 * торги, открытые после: у открытых комиссия вморожена при открытии.
 */
export function termsInstruction(admin: PublicKey, terms: Terms, feeBps: number): TransactionInstruction {
  const programData = PublicKey.findProgramAddressSync([PROGRAM_ID.toBytes()], LOADER_UPGRADEABLE)[0];
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(termsData(feeBps)),
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: CONFIG, isSigner: false, isWritable: true },
      { pubkey: terms.platform, isSigner: false, isWritable: false },
      { pubkey: terms.mint, isSigner: false, isWritable: false },
      { pubkey: programData, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

/** Арбитр отодвигает срок пруфа торга. */
export function moveProofInstruction(arbiter: PublicKey, saleAddress: PublicKey, newDeadlineMs: number): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(moveProofData(newDeadlineMs)),
    keys: [
      { pubkey: arbiter, isSigner: true, isWritable: false },
      { pubkey: CONFIG, isSigner: false, isWritable: false },
      { pubkey: saleAddress, isSigner: false, isWritable: true },
    ],
  });
}

// ---------------------------------------------------------------------------
// Стикеры: лист с ценой и лимитом, покупка по цене листа. Порядок - как в IDL.

const OPEN_STICKERS = new Uint8Array([190, 5, 188, 201, 155, 155, 175, 153]);
const BUY_STICKERS = new Uint8Array([81, 125, 10, 216, 9, 58, 211, 234]);

export type ChainSheet = {
  seller: PublicKey;
  platform: PublicKey;
  mint: PublicKey;
  /** Цена одного стикера в базовых единицах монеты. */
  price: bigint;
  feeBps: number;
  cap: number;
  sold: number;
};

export type ChainOrder = {
  buyer: PublicKey;
  first: number;
  count: number;
  /** Тег - id строки стикера в нашей базе, в виде uuid. */
  tag: string;
};

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

export function openStickersData(sheetId: string, seller: PublicKey, priceCents: number, cap: number): Uint8Array {
  const price = new Uint8Array(8);
  new DataView(price.buffer).setBigUint64(0, centsToUnits(priceCents), true);
  return join(OPEN_STICKERS, auctionBytes(sheetId), seller.toBytes(), price, u16(cap));
}

export function buyStickersData(count: number, tag: string): Uint8Array {
  return join(BUY_STICKERS, u16(count), auctionBytes(tag));
}

export function sheetAddress(sheetId: string): PublicKey {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("stickers"), auctionBytes(sheetId)], PROGRAM_ID)[0];
}

/** Адрес покупки - из листа и первого номера в ней. */
export function orderAddress(sheet: PublicKey, first: number): PublicKey {
  return PublicKey.findProgramAddressSync([new TextEncoder().encode("sticker"), sheet.toBytes(), u16(first)], PROGRAM_ID)[0];
}

export function decodeSheet(data: Uint8Array): ChainSheet {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Дискриминатор и шестнадцать байт id листа.
  const at = 8 + 16;
  return {
    seller: new PublicKey(data.slice(at, at + 32)),
    platform: new PublicKey(data.slice(at + 32, at + 64)),
    mint: new PublicKey(data.slice(at + 64, at + 96)),
    price: view.getBigUint64(at + 96, true),
    feeBps: view.getUint16(at + 104, true),
    cap: view.getUint16(at + 106, true),
    sold: view.getUint16(at + 108, true),
  };
}

export function decodeOrder(data: Uint8Array): ChainOrder {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  // Дискриминатор и адрес листа.
  const at = 8 + 32;
  const hex = Array.from(data.slice(at + 36, at + 52), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    buyer: new PublicKey(data.slice(at, at + 32)),
    first: view.getUint16(at + 32, true),
    count: view.getUint16(at + 34, true),
    tag: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
  };
}

export async function readSheet(sheetId: string): Promise<ChainSheet | null> {
  const account = await connection.getAccountInfo(sheetAddress(sheetId));
  return account ? decodeSheet(account.data) : null;
}

/**
 * Все покупки листа одним запросом: адрес каждой выводится из номера, с
 * которого она начинается, и номеров не больше лимита листа.
 */
export async function readOrders(sheetId: string, cap: number): Promise<ChainOrder[]> {
  const sheet = sheetAddress(sheetId);
  const addresses = Array.from({ length: cap }, (_, first) => orderAddress(sheet, first));
  const accounts = await connection.getMultipleAccountsInfo(addresses);
  return accounts.flatMap((account) => (account ? [decodeOrder(account.data)] : []));
}

/** Админ заводит лист стикеров: сколько, почём и кому деньги. */
export function openStickersInstruction(
  admin: PublicKey,
  sheetId: string,
  seller: PublicKey,
  priceCents: number,
  cap: number,
): TransactionInstruction {
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(openStickersData(sheetId, seller, priceCents, cap)),
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: CONFIG, isSigner: false, isWritable: false },
      { pubkey: sheetAddress(sheetId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

/**
 * Транзакция покупки стикеров. Номер, с которого покупка, - из листа в
 * цепочке: успел кто-то купить раньше - программа отвергнет адрес покупки, и
 * деньги не уйдут.
 */
export async function buyStickersTransaction(
  sheetId: string,
  sheet: ChainSheet,
  buyer: PublicKey,
  count: number,
  tag: string,
): Promise<VersionedTransaction> {
  const address = sheetAddress(sheetId);
  const instruction = new TransactionInstruction({
    programId: PROGRAM_ID,
    data: Buffer.from(buyStickersData(count, tag)),
    keys: [
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: address, isSigner: false, isWritable: true },
      { pubkey: orderAddress(address, sheet.sold), isSigner: false, isWritable: true },
      { pubkey: ata(sheet.mint, buyer), isSigner: false, isWritable: true },
      { pubkey: sheet.seller, isSigner: false, isWritable: false },
      { pubkey: ata(sheet.mint, sheet.seller), isSigner: false, isWritable: true },
      { pubkey: sheet.platform, isSigner: false, isWritable: false },
      { pubkey: ata(sheet.mint, sheet.platform), isSigner: false, isWritable: true },
      { pubkey: sheet.mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });

  const { blockhash } = await connection.getLatestBlockhash();
  return new VersionedTransaction(
    new TransactionMessage({ payerKey: buyer, recentBlockhash: blockhash, instructions: [instruction] }).compileToV0Message(),
  );
}
