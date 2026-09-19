"use client";

import { splitPayout, toUsdcBaseUnits } from "@oxar/core";
import { CLUSTER_URL, USDC_DEVNET_MINT } from "./stream.ts";
import type { Wallet } from "./wallet.ts";

/**
 * Разовый перевод USDC: покупатель платит продавцу и всё.
 *
 * Второй способ оплаты рядом с потоком, а не вместо него. Поток осмыслен там,
 * где есть автоматическая проверка и деньги можно остановить; перевод - там,
 * где проверять нечем, а у продавца есть невозвратная трата до начала. Что
 * именно применяется, решает продавец при листинге.
 *
 * Дешевле потока на порядки: открытие контракта в Streamflow стоит 0.117 SOL,
 * перевод - доли цента. На одиннадцати зонах футболки разница заметная.
 */

/**
 * Библиотеки Solana весят много и нужны только на экране оплаты. Buffer им
 * обеим нужен, а в браузере его нет и Next его не подкладывает - кладём сами,
 * до импорта.
 */
async function sdk() {
  const { Buffer } = await import("buffer");
  const globals = globalThis as unknown as { Buffer?: unknown };
  globals.Buffer ??= Buffer;

  const [web3, token] = await Promise.all([
    import("@solana/web3.js"),
    import("@solana/spl-token"),
  ]);
  return { web3, token };
}

type PhantomWallet = Wallet & {
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string }>;
};

/**
 * Куда уходит наши 10%. Через переменную по той же причине, что сеть и монета:
 * адрес разный на девнете и в мейннете, а прогон должен уметь подставить свой.
 *
 * Пусто - комиссия не берётся и продавец получает всё. Это рабочее состояние,
 * а не поломка: на первых сделках мы её не берём, и тогда адреса просто нет.
 */
export const FEE_WALLET = process.env.NEXT_PUBLIC_OXAR_FEE_WALLET ?? null;

/**
 * Заплатить за бронь. Возвращает подпись транзакции - по ней сделку видно в
 * обозревателе, и её же мы записываем в бронь.
 *
 * Покупатель платит полную цену одной подписью, а делится она уже внутри
 * транзакции: продавцу за вычетом комиссии, нам - комиссия. Двумя переводами
 * это делать нельзя - второй мог бы не пройти, и деньги разъехались бы.
 */
export async function payOnce(input: {
  wallet: PhantomWallet;
  recipient: string;
  priceCents: number;
}): Promise<string> {
  const { web3, token } = await sdk();
  const from = input.wallet.publicKey;
  if (!from) throw new Error("wallet is not connected");

  const connection = new web3.Connection(CLUSTER_URL, "confirmed");
  const payer = new web3.PublicKey(from.toBase58());
  const mint = new web3.PublicKey(USDC_DEVNET_MINT);
  const fromAta = await token.getAssociatedTokenAddress(mint, payer);

  // Тип указан явно: инструкции складывает вложенная функция, а по её вызовам
  // вывести элемент массива TypeScript уже не может.
  const instructions: ReturnType<typeof token.createTransferCheckedInstruction>[] = [];

  /**
   * Перевод одному получателю. У него может не быть счёта под этот токен -
   * заводим за счёт покупателя: иначе перевод просто отвалится, а человек не
   * поймёт почему.
   */
  async function sendTo(owner: string, baseUnits: number) {
    const to = new web3.PublicKey(owner);
    const toAta = await token.getAssociatedTokenAddress(mint, to);

    if (!(await connection.getAccountInfo(toAta))) {
      instructions.push(
        token.createAssociatedTokenAccountInstruction(payer, toAta, to, mint),
      );
    }
    instructions.push(
      token.createTransferCheckedInstruction(fromAta, mint, toAta, payer, baseUnits, 6),
    );
  }

  // Как делится сумма, считает core: и веб, и мобилка, и тест должны получать
  // один и тот же ответ, включая округление последнего цента.
  const split = splitPayout(input.priceCents);
  const fee = FEE_WALLET && split.feeCents > 0 ? FEE_WALLET : null;

  await sendTo(input.recipient, toUsdcBaseUnits(fee ? split.netCents : split.grossCents));
  if (fee) await sendTo(fee, toUsdcBaseUnits(split.feeCents));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new web3.Transaction({
    feePayer: payer,
    blockhash,
    lastValidBlockHeight,
  }).add(...instructions);

  // Phantom умеет подписать и отправить сам - так надёжнее, чем собирать
  // сырые байты руками.
  if (input.wallet.signAndSendTransaction) {
    const { signature } = await input.wallet.signAndSendTransaction(tx);
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    return signature;
  }

  const signed = (await input.wallet.signTransaction(tx)) as {
    serialize(): Uint8Array;
  };
  const signature = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  return signature;
}
