"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import { myOrders, attachPayment, type MyOrder } from "@/lib/payments.ts";
import { reviewsFor, type Review as ReviewRow } from "@/lib/reviews.ts";
import { cancelStream, openStream } from "@/lib/stream.ts";
import { payOnce } from "@/lib/transfer.ts";
import { useWallet } from "@solana/wallet-adapter-react";
import { Notice } from "../Notice";
import { Review } from "../Review";
import { ConnectWallet } from "./ConnectWallet";

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

/** Поток можно остановить, разовый перевод - нет: он уже ушёл. */
const isStream = (order: MyOrder) => order.listing?.payment !== "transfer";

/** Сделки, по которым больше ничего не произойдёт. */
const OVER = new Set(["completed", "cancelled", "rejected"]);

export function OrdersPanel({ onWaitlist }: { onWaitlist: () => void }) {
  const adapter = useWallet();
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function reload() {
    const fresh = await myOrders();
    setOrders(fresh);
    setReviews(await reviewsFor(fresh.filter((o) => o.status === "completed").map((o) => o.id)));
  }

  useEffect(() => {
    reload();
  }, []);

  // Адаптер отдаёт ровно то, что нужно нашим функциям оплаты: ключ и две
  // подписи. Приводим, чтобы не тащить его типы в lib.
  const signer = adapter.publicKey ? (adapter as never) : null;

  async function pay(order: MyOrder) {
    const seller = order.listing?.seller;
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
      // Что именно происходит с деньгами, решает место, а не платформа: у
      // профиля X есть автопроверка и поток осмыслен, у футболки проверять
      // нечем и печать оплачена до начала.
      const paid = isStream(order)
        ? await openStream({
            wallet: signer,
            recipient: seller.payout_wallet,
            priceCents: order.price_cents,
            startDate: order.start_date,
            endDate: order.end_date,
            name: `${order.listing?.kind ?? "spot"} @${seller.x_handle}`,
          }).then((stream) => stream.streamId)
        : await payOnce({
            wallet: signer,
            recipient: seller.payout_wallet,
            priceCents: order.price_cents,
          });

      const saved = await attachPayment({
        bookingId: order.id,
        wallet: adapter.publicKey!.toBase58(),
        streamId: paid,
      });
      if (saved === "error") {
        // Деньги уже ушли, а запись не легла: молчать тут нельзя, иначе
        // человек решит, что платёж не прошёл, и заплатит второй раз.
        setError(`Paid, but we could not record it. Send us this id: ${paid}`);
      } else {
        setDone(
          isStream(order)
            ? "The stream is open. Money moves by the second once the dates start."
            : "Paid. The seller has the money and your spot is booked.",
        );
      }
      await reload();
    } catch (cause) {
      setError(reason(cause));
    } finally {
      setBusy(null);
    }
  }

  async function stop(order: MyOrder) {
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
      await reload();
    } catch (cause) {
      setError(reason(cause));
    } finally {
      setBusy(null);
    }
  }

  if (orders === null) return <p className="muted small">Loading…</p>;

  function row(order: MyOrder) {
    const mine = reviews.find((r) => r.booking_id === order.id && r.author === "buyer");
    const theirs = reviews.find((r) => r.booking_id === order.id && r.author === "seller");
    // Остановить можно только то, что ещё идёт: у завершённой сделки стрим уже
    // закрылся сам, и кнопка вела бы в ошибку контракта.
    const live = order.status === "approved" || order.status === "running";

    return (
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
            {busy?.id === order.id
              ? isStream(order)
                ? "Opening…"
                : "Paying…"
              : isStream(order)
                ? "Pay into the stream"
                : "Pay now"}
          </button>
        )}

        {order.stream_id && isStream(order) && live && (
          <button
            type="button"
            className="dock-item"
            disabled={busy?.id === order.id}
            onClick={() => stop(order)}
          >
            {busy?.id === order.id ? "Stopping…" : "Stop the stream"}
          </button>
        )}

        {order.status === "completed" && (
          <Review
            bookingId={order.id}
            side="buyer"
            mine={mine}
            theirs={theirs}
            onSaved={reload}
          />
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="pay-wallet">
        <span className="small muted">
          {adapter.publicKey
            ? `Paying from ${short(adapter.publicKey.toBase58())}`
            : "No wallet connected"}
        </span>
        <ConnectWallet />
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

      {orders.filter((order) => !OVER.has(order.status)).map(row)}

      {/* История отделена заголовком, а не просто лежит ниже: завершённая
          сделка и та, по которой ещё надо платить, требуют разного внимания, а
          вперемешку они выглядели одинаково. */}
      {orders.some((order) => OVER.has(order.status)) && (
        <>
          <p className="desk-head">History</p>
          {orders.filter((order) => OVER.has(order.status)).map(row)}
        </>
      )}

      {done && <Notice tone="success">{done}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function label(order: MyOrder): string {
  // Конечные состояния идут первыми: у завершённой сделки платёж тоже привязан,
  // и без этой проверки она бы годами показывала «paid, streaming».
  if (order.status === "completed") return "finished";
  if (order.status === "cancelled") return order.stream_id ? "stopped" : "expired, not paid";
  if (order.status === "rejected") return "the seller passed";
  if (order.status === "running") {
    return order.listing?.payment === "transfer" ? "up now, paid" : "up now, streaming";
  }
  if (order.stream_id) {
    return order.listing?.payment === "transfer" ? "paid" : "paid, streaming";
  }
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
