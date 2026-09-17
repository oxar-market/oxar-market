"use client";

import { streamPlan, type StreamPlan } from "@oxar/core";
import type { Wallet } from "./wallet.ts";

/**
 * Стрим в Streamflow - это и есть наш эскроу.
 *
 * Ключа у платформы нет и быть не должно: стрим создаёт покупатель на кошелёк
 * продавца, а отменить его может любая из двух сторон. Мы - интерфейс и лог.
 * Почему именно так, разобрано в docs/plan-payments.md.
 *
 * Пока только девнет. Сеть заодно записана в самой брони, и база не даст
 * создать mainnet-строку из браузера.
 */

/**
 * Куда ходим за цепочкой. Через переменную, чтобы прогон
 * scripts/devnet-check.mjs мог направить тот же код на локальный валидатор:
 * кран публичного девнета исчерпывается, а проверка не должна от него
 * зависеть. Умолчание - девнет, мейннета в коде нет вовсе.
 */
export const CLUSTER_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";

/**
 * Тестовый USDC на девнете от Circle. В мейннете адрес другой.
 *
 * Через переменную, чтобы прогон scripts/devnet-check.mjs мог подставить свою
 * монету: девнетовый USDC выдаётся через кран с капчей, а проверять механику
 * перевода и стрима это не мешает - важны шесть знаков после точки.
 */
export const USDC_DEVNET_MINT =
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/**
 * SDK и web3.js весят больше мегабайта и нужны только на экране оплаты,
 * поэтому грузятся по требованию - как three.js у футболки.
 *
 * Buffer нужен обеим библиотекам, а в браузере его нет. Next его не
 * подкладывает, поэтому кладём сами, до импорта: иначе первое же обращение
 * падает с «Buffer is not defined».
 */
async function sdk() {
  const { Buffer } = await import("buffer");
  const globals = globalThis as unknown as { Buffer?: unknown };
  globals.Buffer ??= Buffer;

  const [{ SolanaStreamClient, ICluster }, BN] = await Promise.all([
    import("@streamflow/stream"),
    import("bn.js").then((m) => m.default ?? m),
  ]);
  return { SolanaStreamClient, ICluster, BN };
}

export type OpenStream = {
  /** Что записывать в бронь: id стрима у Streamflow. */
  streamId: string;
  /** Подпись транзакции, по ней сделку видно в обозревателе. */
  txId: string;
};

/**
 * Открыть стрим под конкретную бронь.
 *
 * Суммы считает `streamPlan` из core, здесь только перевод в тип SDK. Остаток
 * от деления кладём в первый платёж (`cliffAmount`): иначе он повис бы нигде,
 * а так вся сумма разложена без потерь и это видно в тесте пакета.
 */
export async function openStream(input: {
  wallet: Wallet;
  recipient: string;
  priceCents: number;
  startDate: string;
  endDate: string;
  name: string;
}): Promise<OpenStream> {
  const { SolanaStreamClient, ICluster, BN } = await sdk();
  const plan: StreamPlan = streamPlan({
    priceCents: input.priceCents,
    startDate: input.startDate,
    endDate: input.endDate,
  });

  const client = new SolanaStreamClient(CLUSTER_URL, ICluster.Devnet);
  const now = Math.floor(Date.now() / 1000);

  const result = await client.create(
    {
      recipient: input.recipient,
      tokenId: USDC_DEVNET_MINT,
      // Имя видно в дашборде Streamflow - там должно читаться, что это за сделка.
      name: input.name.slice(0, 64),
      amount: new BN(plan.depositedBaseUnits),
      amountPerPeriod: new BN(plan.amountPerPeriod),
      cliffAmount: new BN(plan.dustBaseUnits),
      period: plan.period,
      // Бронь могла начаться вчера: стрим с прошедшим стартом протокол не
      // примет, поэтому не раньше текущей секунды.
      start: Math.max(plan.startUnix, now + 60),
      cliff: 0,
      // Обе стороны могут остановить. Продавец - когда снимает размещение
      // честно, покупатель - когда наш лог показал, что места больше нет.
      cancelableBySender: true,
      cancelableByRecipient: true,
      // Передавать сделку третьему лицу нельзя: место продано этому покупателю.
      transferableBySender: false,
      transferableByRecipient: false,
      canTopup: false,
    },
    { sender: input.wallet as never },
  );

  return { streamId: result.metadataId, txId: result.txId };
}

/** Остановить стрим. Накопленное остаётся продавцу, остальное возвращается. */
export async function cancelStream(input: {
  wallet: Wallet;
  streamId: string;
}): Promise<string> {
  const { SolanaStreamClient, ICluster } = await sdk();
  const client = new SolanaStreamClient(CLUSTER_URL, ICluster.Devnet);
  const result = await client.cancel(
    { id: input.streamId },
    { invoker: input.wallet as never },
  );
  return result.txId;
}
