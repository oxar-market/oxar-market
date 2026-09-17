"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { setPayoutWallet } from "@/lib/payments.ts";
import { Notice } from "../Notice";
import { ConnectWallet } from "./ConnectWallet";

/**
 * Куда продавцу приходят деньги.
 *
 * Поля для адреса тут нет и не будет: base58 руками не набирают, а опечатка в
 * нём означает, что деньги ушли туда, откуда их никто не достанет. Адрес
 * приходит от кошелька и сохраняется сам, как только тот подключился.
 */
export function PayoutPanel({
  sellerId,
  saved,
}: {
  sellerId: string;
  saved: string | null;
}) {
  const { publicKey } = useWallet();
  const [wallet, setWallet] = useState(saved);
  const [error, setError] = useState("");

  const connected = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!connected || connected === wallet) return;
    let live = true;
    setPayoutWallet(sellerId, connected).then((result) => {
      if (!live) return;
      if (result === "error") setError("Could not save that. Try again in a minute.");
      else {
        setError("");
        setWallet(connected);
      }
    });
    return () => {
      live = false;
    };
  }, [connected, wallet, sellerId]);

  return (
    <div className="req-row wallet-row">
      <span className="wallet-known">
        <span className="muted small">
          {wallet ? "Money lands on" : "Connect a wallet so buyers have somewhere to pay."}
        </span>
        {wallet && <strong>{short(wallet)}</strong>}
      </span>

      {/* Кнопка адаптера: она же открывает список кошельков, найденных на
          устройстве, и она же показывает подключённый. */}
      <ConnectWallet />

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** Адрес целиком нечитаем и ничего не проверяет: хвоста и головы достаточно. */
function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
