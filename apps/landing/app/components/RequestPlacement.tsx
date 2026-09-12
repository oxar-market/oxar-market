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
  splitPayout,
  type DayRange,
} from "@oxar/core";
import { busyRanges, requestPlacement, type Offer } from "@/lib/listings";
import { Calendar } from "./Calendar";
import { Notice } from "./Notice";
import { MAX_BYTES, uploadCreative } from "@/lib/upload";

// Заявка на размещение живёт здесь же, в окне приложения: отдельного сайта для
// покупателя больше нет.

const DAYS_AHEAD = 28;
/** Дальше окна календаря продавать нечего: занятость за его пределами неизвестна. */
const MAX_DAYS = DAYS_AHEAD;

type Status = "loading" | "idle" | "sending" | "done" | "error";

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
          {chosen} to {endDate(chosen, term)} · {formatUsd(total)}
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

      <h2>
        @{offer.seller.x_handle} · {formatUsd(offer.price_cents)}
        {offer.pricing === "daily" ? " / day" : ` / ${offer.term_days}d`}
      </h2>
      <p className="muted small">
        {offer.pricing === "daily" && `${term} days · ${formatUsd(total)} total. `}
        Seller receives {formatUsd(payout.netCents)}, platform fee{" "}
        {formatUsd(payout.feeCents)}. Escrow releases money only for time the
        placement actually ran.
      </p>

      {offer.pricing === "daily" && (
        <div>
          <span className="field-label">
            How many days{" "}
            {offer.term_days > 1 && `· from ${offer.term_days}`}
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

      <div>
        <span className="field-label">Start date · {term} days</span>
        {status === "loading" ? (
          <p className="muted small">Checking the calendar…</p>
        ) : (
          <Calendar
            days={calendar}
            termDays={term}
            chosen={chosen}
            onPick={setStart}
          />
        )}
        {chosen && (
          <p className="muted small">
            {chosen} to {endDate(chosen, term)}
          </p>
        )}
      </div>

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
        <label className="attach">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime"
            onChange={async (event) => {
              const picked = event.target.files?.[0];
              event.target.value = "";
              if (!picked) return;
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
            }}
          />
          <span className="attach-button">
            {uploading ? "Uploading…" : "Attach a file"}
          </span>
          <span className="attach-hint">image or mp4, up to 8 MB</span>
        </label>

        {file && (
          <div className="attached">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {file.url.match(/\.(png|jpe?g|webp|gif)$/i) ? (
              <img src={file.url} alt="" className="attached-preview" />
            ) : (
              <span className="attached-preview file" aria-hidden />
            )}
            <span className="attached-name">{file.name}</span>
            <button
              type="button"
              className="attached-remove"
              onClick={() => setFile(null)}
              aria-label="Remove file"
            >
              ×
            </button>
          </div>
        )}
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
