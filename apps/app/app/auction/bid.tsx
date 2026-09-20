"use client";

import { useEffect, useState } from "react";
import { useLogin, usePrivy } from "@privy-io/react-auth";
import {
  useConnectedStandardWallets,
  useStandardSignAndSendTransaction,
} from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { formatUsd, parseUsd } from "@oxar/core";
import {
  WALLET_CHAIN,
  bidTransaction,
  minNextCents,
  readLot,
  settled,
} from "@/lib/chain";
import { recordBid, uploadCreative, type Lot } from "@/lib/auction";

/**
 * Ставка.
 *
 * Деньги уходят из кошелька той же секунды - это и есть ответ на «поставлю
 * миллиард, а платить не буду». Прежнему лидеру его сумма возвращается той же
 * транзакцией, поэтому его счёт стоит в ней отдельной строкой, и берётся он
 * из цепочки, а не из нашей базы: разойдись они, транзакция просто не пройдёт.
 *
 * Порядок шагов выбран так, чтобы неудача на любом из них не оставила ставку
 * без картинки: сначала креатив в хранилище, потом деньги, потом строка.
 * Строка - последняя и самая безобидная: она витрина, а торг живёт в цепочке.
 */

/** Прибавки к сумме. Три штуки: длинный ряд читается как работа. */
const BUMPS = [500, 1000, 2500];

type Art = { url: string; file: File };

export function BidForm({
  lot,
  need,
  art,
  onPlaced,
}: {
  lot: Lot;
  /** Минимум по нашей витрине. Цепочку спросим ещё раз перед отправкой. */
  need: number;
  art: Art | undefined;
  onPlaced: () => void;
}) {
  const { authenticated } = usePrivy();
  const { login } = useLogin();
  const { wallets } = useConnectedStandardWallets();
  const { signAndSendTransaction } = useStandardSignAndSendTransaction();

  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Поле само встаёт на минимум: набирать сумму с нуля, когда она известна, -
  // лишняя работа. Своё, уже набранное, не трогаем.
  useEffect(() => {
    if (!busy) setAmount((was) => was || (need / 100).toFixed(2));
  }, [need, busy]);

  const wallet = wallets[0];
  const cents = parseUsd(amount);

  function bump(by: number) {
    const from = cents ?? need;
    setAmount(((from + by) / 100).toFixed(2));
  }

  async function place() {
    setError("");
    if (!art) return setError("Add your artwork first - it goes in with the bid.");
    if (!wallet) return setError("No wallet connected. Sign in again to get one.");
    if (cents === null) return setError("That is not an amount. Try 75 or 75.50.");

    setBusy(true);
    try {
      // Минимум спрашиваем у цепочки, а не у экрана: пока человек набирал,
      // его могли перебить, и тогда программа отвергла бы ставку сама.
      const chainLot = await readLot(lot.id);
      if (!chainLot) {
        return setError("This spot is not open on chain yet. Nothing to bid on.");
      }
      const least = Math.max(need, minNextCents(chainLot));
      if (cents < least) {
        return setError(`The bid has to be at least ${formatUsd(least)} now.`);
      }

      const mediaUrl = await uploadCreative(lot.id, art.file);
      if (!mediaUrl) return setError("Could not upload the artwork. Try again.");

      const bidder = new PublicKey(wallet.address);
      const transaction = await bidTransaction(lot.id, chainLot, bidder, cents);
      const sent = await signAndSendTransaction({
        transaction: transaction.serialize(),
        wallet,
        chain: WALLET_CHAIN,
      });
      const signature = bs58.encode(sent.signature);

      const outcome = await settled(signature);
      if (outcome === "failed") {
        return setError("The chain turned the bid down. Nothing was charged.");
      }
      if (outcome === "unknown") {
        return setError(
          `We lost sight of the bid. Look up ${signature} before bidding again.`,
        );
      }

      // Деньги уже в хранилище торга, поэтому неудача записи - не отказ в
      // ставке, а расхождение витрины с цепочкой. Подпись показываем: по ней
      // ставку видно в обозревателе, даже если наш экран о ней не знает.
      const written = await recordBid({
        lotId: lot.id,
        wallet: wallet.address,
        amountCents: cents,
        mediaUrl,
        signature,
      });
      if (!written) {
        return setError(
          `Your bid went through as ${signature}, but we could not show it here.`,
        );
      }

      setAmount("");
      onPlaced();
    } catch (cause) {
      setError(reason(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="bidding">
        <button type="button" className="primary" onClick={login}>
          Sign in to bid
        </button>
        <p className="muted">
          Bidding takes a wallet with USDC. Signing in makes you one if you do
          not have it.
        </p>
      </div>
    );
  }

  return (
    <div className="bidding">
      <div className="bid-row">
        <label className="bid-field">
          <span className="bid-sign">$</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            aria-label="Your bid in USDC"
          />
        </label>
        <button
          type="button"
          className="primary"
          disabled={busy || !art}
          onClick={() => void place()}
        >
          {busy ? "Bidding…" : "Bid"}
        </button>
      </div>

      <div className="bumps">
        {BUMPS.map((by) => (
          <button key={by} type="button" className="bump" onClick={() => bump(by)}>
            +{formatUsd(by)}
          </button>
        ))}
      </div>

      {error ? (
        <p className="bad">{error}</p>
      ) : (
        <p className="muted">
          {art
            ? "Your artwork goes public with the bid. The money leaves your wallet now and comes back if someone outbids you."
            : "Try your artwork on the shirt first - a bid without it has nothing to print."}
        </p>
      )}
    </div>
  );
}

/** Что показать вместо отказа кошелька. Их собственные слова читать нельзя. */
function reason(cause: unknown): string {
  const said = cause instanceof Error ? cause.message : String(cause);
  if (/reject|denied|cancel/i.test(said)) return "You turned the bid down.";
  if (/insufficient|0x1$/i.test(said)) return "Not enough USDC in the wallet.";
  return "The bid did not go through. Nothing was charged.";
}
