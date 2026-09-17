"use client";

import { useEffect, useState } from "react";
import { setPayoutWallet } from "@/lib/payments";
import { connectWallet, walletInstalled } from "@/lib/wallet";
import { Notice } from "./Notice";

/**
 * Куда продавцу текут деньги.
 *
 * Без этого адреса покупатель не может открыть стрим: получателя задаёт
 * продавец, а не мы, и ключа от него у платформы нет. Поэтому поле стоит в
 * кабинете рядом с местами, а не прячется в настройках.
 *
 * Адрес один на обе сети: в Solana он не различается между девнетом и
 * мейннетом.
 */
export function PayoutWallet({
  sellerId,
  saved,
}: {
  sellerId: string;
  saved: string | null;
}) {
  const [wallet, setWallet] = useState(saved ?? "");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setWallet(saved ?? "");
  }, [saved]);

  async function fromPhantom() {
    setError("");
    if (!walletInstalled()) {
      setError("Phantom is not installed in this browser.");
      return;
    }
    const address = await connectWallet();
    if (address) setWallet(address);
  }

  async function save() {
    setError("");
    // Тот же алфавит и та же длина, что проверяет база. Дублируем, чтобы
    // человек увидел ошибку до запроса, а не после.
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet.trim())) {
      setError("That does not look like a Solana address.");
      return;
    }
    setState("saving");
    const result = await setPayoutWallet(sellerId, wallet.trim());
    setState(result === "saved" ? "done" : "error");
    if (result === "error") setError("Could not save that. Try again in a minute.");
  }

  return (
    <div className="req-row">
      <label>
        Payout wallet{" "}
        <span className="need">where the stream lands</span>
        <input
          value={wallet}
          onChange={(event) => {
            setWallet(event.target.value);
            setState("idle");
          }}
          placeholder="Your Solana address"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="pay-wallet">
        <button type="button" className="dock-item" onClick={fromPhantom}>
          Use Phantom
        </button>
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={state === "saving" || wallet.trim() === (saved ?? "")}
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
      </div>

      {state === "done" && (
        <Notice tone="success">Saved. Buyers can stream to this address now.</Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
