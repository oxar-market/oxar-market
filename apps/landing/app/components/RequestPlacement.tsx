"use client";

import { useEffect, useState } from "react";
import {
  calendarDays,
  endDate,
  formatUsd,
  isValidHandle,
  minDaysFor,
  normalizeHandle,
  orderTotalCents,
  placementSpec,
  splitPayout,
  type DayRange,
} from "@oxar/core";
import { busyRanges, requestPlacement, type Offer } from "@/lib/listings";
import { Calendar, monthSpan } from "./Calendar";
import { CreativeDrop } from "./CreativeDrop";
import { Notice } from "./Notice";
import { MAX_BYTES, uploadCreative } from "@/lib/upload";

// Заявка на размещение живёт здесь же, в окне приложения: отдельного сайта для
// покупателя больше нет.

const DAYS_AHEAD = 28;
/** Дальше окна календаря продавать нечего: занятость за его пределами неизвестна. */
const MAX_DAYS = DAYS_AHEAD;

type Status = "loading" | "idle" | "sending" | "done" | "error";

/** Sep 13 вместо 2026-09-13: даты читает человек, а не машина. */
function humanDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Окно начинается с завтра: сегодняшний день продавец уже не успеет поставить. */
function tomorrow(): string {
  const at = new Date();
  at.setUTCHours(0, 0, 0, 0);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

export function RequestPlacement({
  offer,
  onBack,
}: {
  offer: Offer;
  onBack: () => void;
}) {
  // Правила цены живут в core и знают поля в своём написании, витрина отдаёт их
  // как в базе - переводим здесь, в одном месте.
  const listing = {
    pricing: offer.pricing,
    priceCents: offer.price_cents,
    termDays: offer.term_days,
  };
  const minDays = minDaysFor(listing);

  const [busy, setBusy] = useState<DayRange[] | null>(null);
  const [start, setStart] = useState("");
  // Пакет продаётся целиком, у ставки за сутки срок выбирает покупатель.
  const [days, setDays] = useState(minDays);
  const [handle, setHandle] = useState("");
  const [contact, setContact] = useState("");
  const [creative, setCreative] = useState("");
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    busyRanges(offer.id).then((rows) => {
      if (!live) return;
      setBusy(rows);
      setStatus("idle");
    });
    return () => {
      live = false;
    };
  }, [offer.id]);

  const term = offer.pricing === "daily" ? days : offer.term_days;
  const calendar = busy
    ? calendarDays({ from: tomorrow(), count: DAYS_AHEAD, termDays: term, busy })
    : [];
  const chosen = start || calendar.find((day) => day.canStart)?.date || "";
  const total = orderTotalCents(listing, term);
  const payout = splitPayout(total);

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

    const buyer = normalizeHandle(handle);
    if (!isValidHandle(buyer)) {
      setError("Enter the X handle this campaign is for.");
      return;
    }
    if (!chosen) {
      setError("Pick a start date.");
      return;
    }

    if (uploading) {
      setError("The file is still uploading.");
      return;
    }

    setStatus("sending");
    const result = await requestPlacement({
      listing_id: offer.id,
      buyer_handle: buyer,
      buyer_contact: contact.trim() || null,
      creative_url: file?.url ?? null,
      creative_text: creative.trim() || null,
      start_date: chosen,
      end_date: endDate(chosen, term),
      price_cents: total,
    });

    if (result === "created") {
      setStatus("done");
      return;
    }
    setStatus("error");
    setError("Could not send the request. Try again in a minute.");
  }

  if (status === "done") {
    return (
      <div className="card">
        <Notice tone="success" title="Request sent">
          @{offer.seller.x_handle} sees your request with the creative attached and
          either approves it or turns it down. Nothing is charged until they approve.
        </Notice>
        <p className="muted small">
          {humanDay(chosen)} - {humanDay(endDate(chosen, term))} · {formatUsd(total)}
        </p>
        <button type="button" className="primary" onClick={onBack}>
          Back to placements
        </button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <button type="button" className="link-back" onClick={onBack}>
        Back
      </button>

      <header className="req-head">
        <h2>{placementSpec(offer.kind).label}</h2>
        <p className="req-sub">
          @{offer.seller.x_handle} ·{" "}
          {offer.pricing === "daily"
            ? `${formatUsd(offer.price_cents)} a day`
            : `${formatUsd(offer.price_cents)} for ${offer.term_days} days`}
        </p>
      </header>

      {offer.pricing === "daily" && (
        <div className="req-row">
          <span className="field-label">
            How many days{offer.term_days > 1 && ` · from ${offer.term_days}`}
          </span>
          <div className="stepper">
            <button
              type="button"
              onClick={() => setDays((d) => Math.max(minDays, d - 1))}
              disabled={days <= minDays}
              aria-label="One day less"
            >
              -
            </button>
            <span className="stepper-value">{days}</span>
            <button
              type="button"
              onClick={() => setDays((d) => Math.min(MAX_DAYS, d + 1))}
              disabled={days >= MAX_DAYS}
              aria-label="One day more"
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className="req-row">
        {status === "loading" ? (
          <p className="muted small">Checking the calendar…</p>
        ) : (
          <>
            <div className="cal-head">
              <span className="cal-month">{monthSpan(calendar)}</span>
              <span className="cal-legend">
                <span className="cal-dot" aria-hidden /> booked
              </span>
            </div>
            <Calendar
              days={calendar}
              termDays={term}
              chosen={chosen}
              onPick={setStart}
            />
          </>
        )}
      </div>

      {chosen && (
        <div className="req-total">
          <span>
            {humanDay(chosen)} - {humanDay(endDate(chosen, term))}
            <span className="req-days"> · {term} days</span>
          </span>
          <strong>{formatUsd(total)}</strong>
        </div>
      )}
      <p className="req-fine">
        Seller gets {formatUsd(payout.netCents)}, our fee{" "}
        {formatUsd(payout.feeCents)}. Escrow pays out only for the time the
        placement actually runs.
      </p>

      <label>
        Your X handle
        <input
          value={handle}
          onChange={(event) => setHandle(event.target.value)}
          placeholder="@yourproject"
          autoComplete="off"
          required
        />
      </label>

      <div className="field">
        <span className="field-label">What goes up</span>
        <input
          value={creative}
          onChange={(event) => setCreative(event.target.value)}
          placeholder="https://… or the exact text"
        />
        <CreativeDrop
          file={file}
          uploading={uploading}
          onPick={upload}
          onClear={() => setFile(null)}
        />
      </div>

      <label>
        Email or Telegram <span className="optional">optional</span>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="you@example.com"
          autoComplete="off"
        />
      </label>

      {error && <Notice tone="error">{error}</Notice>}

      <button type="submit" className="primary" disabled={status === "sending"}>
        {status === "sending"
          ? "Sending…"
          : `Request · ${formatUsd(total)}`}
      </button>
      <p className="muted small">
        Sending a request charges nothing. The seller approves first.
      </p>
    </form>
  );
}
