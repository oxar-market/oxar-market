"use client";

/**
 * То немногое, что функциям оплаты нужно от кошелька.
 *
 * Сам кошелёк приходит из @solana/wallet-adapter: он находит по Wallet
 * Standard любой установленный на устройстве и даёт общий интерфейс. Здесь
 * остался только тип, чтобы lib не тянул типы адаптера в сигнатуры.
 */
export type Wallet = {
  publicKey: { toBase58(): string } | null;
  signTransaction: (tx: unknown) => Promise<unknown>;
  signAllTransactions: (txs: unknown[]) => Promise<unknown[]>;
  /** Есть не у всех: часть кошельков подписывает и отправляет сама. */
  signAndSendTransaction?: (tx: unknown) => Promise<{ signature: string }>;
};
