"use client";

import { dealPlan, type DealPlan, type DealShape } from "@oxar/core";
import type { Wallet } from "./wallet.ts";
import idl from "../../../chain/idl/oxar_escrow.json";

/**
 * Наш эскроу. Своя программа на Solana вместо Streamflow.
 *
 * Ключа от хранилища нет ни у кого: им владеет PDA сделки. Деньги уходят
 * продавцу по расписанию, которое записано при открытии и после этого не
 * меняется ни одной стороной, включая нас. Мы здесь такой же пассивный
 * получатель комиссии, как продавец - получатель выплаты.
 *
 * Почему ушли от Streamflow: он навязывал форму расчёта (периоды и остаток от
 * деления), не давал взять комиссию без регистрации в их партнёрской программе,
 * жёг 0.0078 SOL на каждой сделке безвозвратно и держал нас на web3.js v1.
 * Здесь всё это наше: расчёт линейный, комиссия - поле, аренда возвращается при
 * закрытии.
 *
 * Пока только девнет. Сеть записана и в самой брони, и база не даст создать
 * mainnet-строку из браузера.
 */

export const PROGRAM_ID = idl.address;

/**
 * Куда ходим за цепочкой. Через переменную, чтобы прогон мог направить тот же
 * код на локальный валидатор. Умолчание - девнет, мейннета в коде нет вовсе.
 */
export const CLUSTER_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

/**
 * Тестовый USDC на девнете от Circle. В мейннете адрес другой.
 *
 * Через переменную, чтобы прогон мог подставить свою монету: девнетовый USDC
 * выдаётся краном с капчей, а механику это не проверяет - важны только шесть
 * знаков после точки.
 */
export const USDC_MINT =
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** Куда уходит комиссия. Пусто - не берём, и продавец получает всё. */
export const FEE_WALLET = process.env.NEXT_PUBLIC_OXAR_FEE_WALLET ?? null;

/** Комиссия в сотых долях процента, как её ждёт программа. 1000 - это 10%. */
const FEE_BPS = FEE_WALLET ? 1_000 : 0;

/**
 * Клиент Anchor и web3.js весят больше мегабайта и нужны только на экране
 * оплаты, поэтому грузятся по требованию.
 *
 * Buffer нужен им обоим, а в браузере его нет и Next его не подкладывает -
 * кладём сами, до импорта: иначе первое же обращение падает с «Buffer is not
 * defined».
 */
async function sdk() {
  const { Buffer } = await import("buffer");
  const globals = globalThis as unknown as { Buffer?: unknown };
  globals.Buffer ??= Buffer;

  const [anchor, web3, token] = await Promise.all([
    import("@anchor-lang/core"),
    import("@solana/web3.js"),
    import("@solana/spl-token"),
  ]);
  return { anchor, web3, token };
}

type Sdk = Awaited<ReturnType<typeof sdk>>;

/**
 * Идентификатор брони - шестнадцать байт uuid. Он же входит в сиды сделки,
 * поэтому по нему её всегда можно найти, не храня адрес отдельно.
 */
function bookingBytes(bookingId: string): number[] {
  const hex = bookingId.replace(/-/g, "");
  if (hex.length !== 32) throw new Error("booking id must be a uuid");
  return Array.from({ length: 16 }, (_, i) =>
    parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}

function dealAddress({ web3 }: Sdk, bookingId: string) {
  return web3.PublicKey.findProgramAddressSync(
    [Buffer.from("deal"), Buffer.from(bookingBytes(bookingId))],
    new web3.PublicKey(PROGRAM_ID),
  )[0];
}

/** Ключ подписанта в виде, который понимает web3.js. */
function payer({ web3 }: Sdk, wallet: Wallet) {
  if (!wallet.publicKey) throw new Error("wallet is not connected");
  return new web3.PublicKey(wallet.publicKey.toBase58());
}

async function program(parts: Sdk, wallet: Wallet) {
  const connection = new parts.web3.Connection(CLUSTER_URL, "confirmed");
  const provider = new parts.anchor.AnchorProvider(connection, wallet as never, {
    commitment: "confirmed",
  });
  return new parts.anchor.Program(idl as never, provider);
}

/**
 * Как ложится бронь на расписание сделки.
 *
 * Поток - там, где состояние места читается автоматически и деньги можно
 * остановить. Заморозка - там, где проверить нечем, а продавец несёт
 * невозвратные расходы до начала.
 */
export function shapeOf(payment: "stream" | "transfer"): DealShape {
  return payment === "transfer" ? "hold" : "stream";
}

export type OpenedDeal = {
  /** Адрес сделки. Его записываем в бронь. */
  dealId: string;
  /** Подпись транзакции: по ней сделку видно в обозревателе. */
  txId: string;
};

/** Открыть сделку и положить в хранилище всю сумму. */
export async function openDeal(input: {
  wallet: Wallet;
  bookingId: string;
  seller: string;
  priceCents: number;
  startDate: string;
  endDate: string;
  shape: DealShape;
}): Promise<OpenedDeal> {
  const parts = await sdk();
  const { web3 } = parts;
  const app = await program(parts, input.wallet);

  const plan: DealPlan = dealPlan({
    priceCents: input.priceCents,
    startDate: input.startDate,
    endDate: input.endDate,
    shape: input.shape,
  });

  // Начало в прошлом программа не примет: продавец получил бы за время до
  // сделки. Бронь могла быть заведена давно, поэтому не раньше текущей секунды.
  const now = Math.floor(Date.now() / 1000);
  const startsAt = Math.max(plan.startsAt, now + 60);
  const endsAt = Math.max(plan.endsAt, startsAt);

  const txId = await app.methods
    .buyerOpensDeal(
      bookingBytes(input.bookingId),
      new parts.anchor.BN(plan.amountBaseUnits),
      new parts.anchor.BN(startsAt),
      new parts.anchor.BN(endsAt),
      new parts.anchor.BN(Math.min(plan.refundableUntil, endsAt)),
      FEE_BPS,
    )
    .accounts({
      buyer: payer(parts, input.wallet),
      seller: new web3.PublicKey(input.seller),
      // Комиссия не берётся - получателем ставим продавца: программа всё равно
      // отдаст ему ноль, а лишнего счёта заводить не придётся.
      platform: new web3.PublicKey(FEE_WALLET ?? input.seller),
      mint: new web3.PublicKey(USDC_MINT),
      tokenProgram: parts.token.TOKEN_PROGRAM_ID,
      associatedTokenProgram: parts.token.ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
    } as never)
    .rpc();

  return { dealId: dealAddress(parts, input.bookingId).toBase58(), txId };
}

/**
 * Закрыть сделку. Продавцу за отстоявшее время, остальное покупателю, аккаунты
 * закрываются и аренда возвращается.
 */
export async function closeDeal(input: {
  wallet: Wallet;
  bookingId: string;
  seller: string;
  buyer: string;
}): Promise<string> {
  const parts = await sdk();
  const { web3 } = parts;
  const app = await program(parts, input.wallet);

  return app.methods
    .partyClosesDeal()
    .accounts({
      party: payer(parts, input.wallet),
      deal: dealAddress(parts, input.bookingId),
      buyer: new web3.PublicKey(input.buyer),
      seller: new web3.PublicKey(input.seller),
      platform: new web3.PublicKey(FEE_WALLET ?? input.seller),
      mint: new web3.PublicKey(USDC_MINT),
      tokenProgram: parts.token.TOKEN_PROGRAM_ID,
    } as never)
    .rpc();
}
