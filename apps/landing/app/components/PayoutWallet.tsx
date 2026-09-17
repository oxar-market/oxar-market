"use client";

import { useState } from "react";
import { setPayoutWallet } from "@/lib/payments";
import { connectWallet, walletInstalled } from "@/lib/wallet";
import { Notice } from "./Notice";

/**
 * Куда продавцу приходят деньги.
 *
 * Одна кнопка, как во всех приложениях с кошельком. Поля для адреса тут не
 * было и не будет: base58 руками не набирают, а опечатка в нём означает, что
 * деньги ушли в никуда и вернуть их некому.
 *
 * Адрес сохраняется сразу после подключения. Отдельная кнопка «сохранить»
 * добавляла бы шаг, на котором человек уходит с половиной дела.
 */
export function PayoutWallet({
  sellerId,
  saved,
}: {
  sellerId: string;
  saved: string | null;
}) {
  const [wallet, setWallet] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setError("");
    if (!walletInstalled()) {
      setError("Phantom is not installed in this browser.");
      return;
    }

    setBusy(true);
    const address = await connectWallet();
    if (!address) {
      setBusy(false);
      setError("The wallet did not confirm the connection.");
      return;
    }

    const result = await setPayoutWallet(sellerId, address);
    setBusy(false);
    if (result === "error") {
      setError("Could not save that. Try again in a minute.");
      return;
    }
    setWallet(address);
  }

  return (
    <div className="req-row wallet-row">
      {wallet ? (
        <>
          <span className="wallet-known">
            <span className="muted small">Money lands on</span>
            <strong>{short(wallet)}</strong>
          </span>
          <button
            type="button"
            className="dock-item"
            onClick={connect}
            disabled={busy}
          >
            {busy ? "Waiting…" : "Change"}
          </button>
        </>
      ) : (
        <>
          <span className="muted small">
            Connect a wallet so buyers have somewhere to pay.
          </span>
          <button type="button" className="primary" onClick={connect} disabled={busy}>
            {busy ? "Waiting for the wallet…" : "Connect wallet"}
          </button>
        </>
      )}

      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

/** Адрес целиком нечитаем и ничего не проверяет: хвоста и головы достаточно. */
function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
