"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import { myOrders, attachPayment, type MyOrder } from "@/lib/payments";
import { cancelStream, openStream } from "@/lib/stream";
import { connectWallet, currentWallet, walletInstalled } from "@/lib/wallet";
import { Notice } from "./Notice";

/**
 * Кабинет покупателя: свои брони и деньги по ним.
 *
 * До оплаты бронь ждёт одобрения продавца, после одобрения открывается окно
 * `pay_by`, в которое надо успеть открыть стрим. Стрим создаётся именно здесь,
 * а не при заявке: открытие контракта стоит невозвратных 0.117 SOL, и отказ
 * продавца сжигал бы их впустую.
 *
 * Останавливать стрим может любая из сторон, и это не симметрия ради красоты:
 * ключа у платформы нет, поэтому кнопка «снять» - единственный способ вернуть
 * неотстоявшее время, когда наш лог показал, что размещения больше нет.
 */

type Busy = { id: string; what: "paying" | "stopping" } | null;

export function MyOrders({ onWaitlist }: { onWaitlist: () => void }) {
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    myOrders().then(setOrders);
    // Разрешение могли выдать раньше: тогда адрес берётся без всплывающего окна.
    connectWallet(true).then(setWallet);
  }, []);

  async function connect() {
    setError("");
    if (!walletInstalled()) {
      setError("Phantom is not installed in this browser.");
      return;
    }
    const address = await connectWallet();
    if (!address) setError("The wallet did not confirm the connection.");
    setWallet(address);
  }

  async function pay(order: MyOrder) {
    const seller = order.listing?.seller;
    const signer = currentWallet();
    setError("");
    setDone("");

    if (!signer) {
      setError("Connect the wallet first.");
      return;
    }
    if (!seller?.payout_wallet) {
      setError("This seller has not set a payout wallet yet. We will nudge them.");
      return;
    }

    setBusy({ id: order.id, what: "paying" });
    try {
      const stream = await openStream({
        wallet: signer,
        recipient: seller.payout_wallet,
        priceCents: order.price_cents,
        startDate: order.start_date,
        endDate: order.end_date,
        name: `${order.listing?.kind ?? "spot"} @${seller.x_handle}`,
      });
      const saved = await attachPayment({
        bookingId: order.id,
        wallet: signer.publicKey!.toBase58(),
        streamId: stream.streamId,
      });
      if (saved === "error") {
        // Деньги уже в контракте, а запись не легла: молчать тут нельзя, иначе
        // человек решит, что платёж не прошёл, и заплатит второй раз.
        setError(`Paid, but we could not record it. Send us this id: ${stream.streamId}`);
      } else {
        setDone("The stream is open. Money moves by the second once the dates start.");
      }
      setOrders(await myOrders());
    } catch (cause) {
      setError(reason(cause));
    } finally {
      setBusy(null);
    }
  }

  async function stop(order: MyOrder) {
    const signer = currentWallet();
    setError("");
    setDone("");
    if (!signer || !order.stream_id) {
      setError("Connect the wallet first.");
      return;
    }

    setBusy({ id: order.id, what: "stopping" });
    try {
      await cancelStream({ wallet: signer, streamId: order.stream_id });
      setDone("Stopped. The seller keeps the time it ran, the rest comes back to you.");
      setOrders(await myOrders());
    } catch (cause) {
      setError(reason(cause));
    } finally {
      setBusy(null);
    }
  }

  if (orders === null) return <p className="muted small">Loading…</p>;

  return (
    <div className="card">
      <div className="pay-wallet">
        <span className="small muted">
          {wallet ? `Wallet ${short(wallet)}` : "No wallet connected"}
        </span>
        {!wallet && (
          <button type="button" className="dock-item" onClick={connect}>
            Connect Phantom
          </button>
        )}
      </div>

      <p className="small muted">
        Devnet only for now. Nothing here moves real money.
      </p>

      {orders.length === 0 && (
        <>
          <p className="muted small">
            Nothing booked yet. Pick a spot, and once the seller approves it you pay
            here.
          </p>
          <button type="button" className="primary" onClick={onWaitlist}>
            Join the waitlist
          </button>
        </>
      )}

      {orders.map((order) => (
        <div className="pay-row" key={order.id}>
          <span className="pay-what">
            <strong>{order.listing?.kind ?? "spot"}</strong>
            <span className="muted small">
              {" "}
              @{order.listing?.seller.x_handle ?? "unknown"} · {order.start_date} to{" "}
              {order.end_date}
            </span>
          </span>

          <span className="pay-right">
            <span className="price">{formatUsd(order.price_cents)}</span>
            <span className="muted small">{label(order)}</span>
          </span>

          {order.status === "approved" && !order.stream_id && (
            <button
              type="button"
              className="primary"
              disabled={busy?.id === order.id}
              onClick={() => pay(order)}
            >
              {busy?.id === order.id ? "Opening…" : "Pay into the stream"}
            </button>
          )}

          {order.stream_id && (
            <button
              type="button"
              className="dock-item"
              disabled={busy?.id === order.id}
              onClick={() => stop(order)}
            >
              {busy?.id === order.id ? "Stopping…" : "Stop the stream"}
            </button>
          )}
        </div>
      ))}

      {done && <Notice tone="success">{done}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function label(order: MyOrder): string {
  if (order.stream_id) return "paid, streaming";
  if (order.status === "requested") return "waiting for the seller";
  if (order.status === "approved") {
    return order.pay_by ? `approved, pay by ${order.pay_by.slice(0, 10)}` : "approved";
  }
  return order.status;
}

function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Кошелёк и SDK кидают что угодно, а человеку нужна одна внятная строка. */
function reason(cause: unknown): string {
  const text = cause instanceof Error ? cause.message : String(cause);
  if (/user rejected|declined/i.test(text)) return "You declined it in the wallet.";
  if (/insufficient/i.test(text)) return "Not enough devnet USDC or SOL in the wallet.";
  return text.slice(0, 200);
}
