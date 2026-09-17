"use client";

import { useEffect, useState } from "react";
import { formatUsd, isValidHandle, minBidCents, normalizeHandle } from "@oxar/core";
import { lastBidOf, lotBids, placeBid, type Lot, type PublicBid } from "@/lib/auctions";
import { CreativeDrop } from "./CreativeDrop";
import { Notice } from "./Notice";
import { committed } from "@/lib/haptics";
import { MAX_BYTES, uploadCreative } from "@/lib/upload";

// Лот: срок размещения, текущая ставка и сколько осталось торговаться.
//
// Минимальную ставку показываем из правил в core, но проверяет её база: ставку
// можно послать и запросом, минуя эту форму.

function left(closesAt: number, now: number): string {
  const ms = closesAt - now;
  if (ms <= 0) return "closed";

  const minutes = Math.floor(ms / 60_000);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return hours >= 24
      ? `${Math.floor(hours / 24)}d ${hours % 24}h left`
      : `${hours}h ${minutes % 60}m left`;
  }
  // Под конец счёт идёт на секунды: там и решается исход
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s left`;
}

function day(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function AuctionLot({ lot }: { lot: Lot }) {
  const [bids, setBids] = useState<PublicBid[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);

  const closesAt = Date.parse(lot.closes_at);

  useEffect(() => {
    let live = true;
    lotBids(lot.id).then((rows) => {
      if (live) setBids(rows);
    });
    return () => {
      live = false;
    };
  }, [lot.id]);

  // Тикаем раз в секунду: под конец торга минуты уже не хватает.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const top = bids?.[0] ?? null;
  const need = minBidCents(lot.reserve_cents, top?.amount_cents ?? null);
  const running = closesAt > now;

  async function refresh() {
    setBids(await lotBids(lot.id));
  }

  return (
    <div className="lot">
      <div className="lot-head">
        <div>
          <strong>
            {day(lot.start_date)} - {day(lot.end_date)}
          </strong>
          <span className="muted small"> · @{lot.listing.seller.x_handle}</span>
        </div>
        <span className={running ? "lot-clock" : "lot-clock over"}>
          {left(closesAt, now)}
        </span>
      </div>

      <div className="lot-price">
        <span>
          {top ? (
            <>
              <strong>{formatUsd(top.amount_cents)}</strong>
              <span className="muted small"> from @{top.bidder_handle}</span>
            </>
          ) : (
            <>
              <strong>{formatUsd(lot.reserve_cents)}</strong>
              <span className="muted small"> reserve, no bids yet</span>
            </>
          )}
        </span>
        {running && (
          <button type="button" className="lot-bid" onClick={() => setOpen(!open)}>
            {open ? "Close" : `Bid ${formatUsd(need)}+`}
          </button>
        )}
      </div>

      {bids && bids.length > 1 && (
        <ul className="lot-bids">
          {bids.slice(1, 4).map((bid) => (
            <li key={bid.id}>
              @{bid.bidder_handle} · {formatUsd(bid.amount_cents)}
            </li>
          ))}
        </ul>
      )}

      {open && running && (
        <BidForm
          lot={lot}
          need={need}
          onPlaced={() => {
            setOpen(false);
            refresh();
          }}
        />
      )}

      {!running && (
        <p className="muted small">
          Bidding is over. The winner gets the spot for these dates.
        </p>
      )}
    </div>
  );
}

function BidForm({
  lot,
  need,
  onPlaced,
}: {
  lot: Lot;
  need: number;
  onPlaced: () => void;
}) {
  const [amount, setAmount] = useState((need / 100).toString());
  const [handle, setHandle] = useState("");
  const [creative, setCreative] = useState("");
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // Один участник торгов ставит на несколько зон подряд, и хэндл с логотипом у
  // него те же. Заполняем их из прошлой ставки: вводить заново одиннадцать раз
  // - причина не ставить вовсе. Поле остаётся обычным, поверх подставленного
  // можно написать своё.
  useEffect(() => {
    let live = true;
    lastBidOf().then((last) => {
      if (!live || !last) return;
      setHandle((now) => now || `@${last.bidder_handle}`);
      setFile((now) =>
        now ?? (last.creative_url ? { name: "last upload", url: last.creative_url } : null),
      );
    });
    return () => {
      live = false;
    };
  }, []);

  async function upload(picked: File) {
    setError("");
    setUploading(true);
    const result = await uploadCreative(picked);
    setUploading(false);
    if (result.ok) {
      setFile({ name: picked.name, url: result.url });
      return;
    }
    setError(
      result.reason === "type"
        ? "Attach an image or an mp4."
        : result.reason === "size"
          ? `Keep the file under ${Math.round(MAX_BYTES / 1024 / 1024)} MB.`
          : "Could not upload that file. Try again.",
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const bidder = normalizeHandle(handle);
    if (!isValidHandle(bidder)) {
      setError("Enter the X handle this campaign is for.");
      return;
    }

    const cents = Math.round(Number(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < need) {
      setError(`The bid has to be at least ${formatUsd(need)}.`);
      return;
    }
    if (uploading) {
      setError("The file is still uploading.");
      return;
    }

    setSending(true);
    const result = await placeBid({
      auction_id: lot.id,
      bidder_handle: bidder,
      amount_cents: cents,
      creative_url: file?.url ?? null,
      creative_text: creative.trim() || null,
    });
    setSending(false);

    if (result === "placed") {
      committed();
      onPlaced();
      return;
    }
    setError(
      result === "closed"
        ? "Bidding on this lot has closed."
        : result === "low"
          ? "Someone outbid you. Refresh and try again."
          : "Could not place the bid. Try again in a minute.",
    );
  }

  // Что доказывает размещение, то и просим. У ткани это фотография, у строки
  // в профиле - текст. Спрашивать и то и другое значит спрашивать лишнее.
  const wantsFile = lot.listing.catalog?.proof !== "text";
  const wantsText = lot.listing.catalog?.proof !== "photo";

  return (
    <form className="lot-form" onSubmit={submit} noValidate>
      <label>
        Your bid, $
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value.replace(/[^\d.,]/g, ""))}
          inputMode="decimal"
        />
      </label>

      <label>
        Your X handle
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="@yourproject"
          autoComplete="off"
        />
      </label>

      <div className="field">
        <span className="field-label">What goes up if you win</span>
        {wantsText && (
          <input
            value={creative}
            onChange={(event) => setCreative(event.target.value)}
            placeholder={wantsFile ? "https://… or the exact text" : "The exact text"}
          />
        )}
        {wantsFile && (
          <CreativeDrop
            file={file}
            uploading={uploading}
            onPick={upload}
            onClear={() => setFile(null)}
          />
        )}
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <button type="submit" className="primary" disabled={sending}>
        {sending ? "Placing…" : "Place the bid"}
      </button>
      <p className="muted small">
        A bid cannot be taken back. There is no escrow yet, so this is a promise
        to pay, and we hold you to it by hand.
      </p>
    </form>
  );
}
