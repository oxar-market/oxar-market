"use client";

import { toUsdcBaseUnits } from "@oxar/core";
import { CLUSTER_URL, USDC_DEVNET_MINT } from "./stream";
import type { Wallet } from "./wallet";

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
 * Заплатить за бронь. Возвращает подпись транзакции - по ней сделку видно в
 * обозревателе, и её же мы записываем в бронь.
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
  const seller = new web3.PublicKey(input.recipient);
  const mint = new web3.PublicKey(USDC_DEVNET_MINT);

  const fromAta = await token.getAssociatedTokenAddress(mint, payer);
  const toAta = await token.getAssociatedTokenAddress(mint, seller);

  const instructions = [];
  // У продавца может не быть счёта под этот токен. Заводим его за счёт
  // покупателя: иначе перевод просто отвалится, а человек не поймёт почему.
  const sellerAccount = await connection.getAccountInfo(toAta);
  if (!sellerAccount) {
    instructions.push(
      token.createAssociatedTokenAccountInstruction(payer, toAta, seller, mint),
    );
  }

  instructions.push(
    token.createTransferCheckedInstruction(
      fromAta,
      mint,
      toAta,
      payer,
      toUsdcBaseUnits(input.priceCents),
      6,
    ),
  );

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
