"use client";

import { useEffect, useState } from "react";
import { formatUsd, isValidHandle, normalizeHandle, splitPayout } from "@oxar/core";
import {
  busyRanges,
  endDate,
  requestPlacement,
  upcomingDays,
  type BusyRange,
  type Offer,
} from "@/lib/listings";
import { Notice } from "./Notice";
import { MAX_BYTES, uploadCreative } from "@/lib/upload";

// Заявка на размещение живёт здесь же, в окне приложения: отдельного сайта для
// покупателя больше нет.

const DAYS_AHEAD = 28;

type Status = "loading" | "idle" | "sending" | "done" | "error";

export function RequestPlacement({
  offer,
  onBack,
}: {
  offer: Offer;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState<BusyRange[] | null>(null);
  const [start, setStart] = useState("");
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

  const days = busy ? upcomingDays(DAYS_AHEAD, offer.term_days, busy) : [];
  const chosen = start || days.find((day) => day.free)?.date || "";
  const payout = splitPayout(offer.price_cents);

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
      end_date: endDate(chosen, offer.term_days),
      price_cents: offer.price_cents,
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
          {chosen} to {endDate(chosen, offer.term_days)} ·{" "}
          {formatUsd(offer.price_cents)}
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
        @{offer.seller.x_handle} · {formatUsd(offer.price_cents)} /{" "}
        {offer.term_days}d
      </h2>
      <p className="muted small">
        Seller receives {formatUsd(payout.netCents)}, platform fee{" "}
        {formatUsd(payout.feeCents)}. Escrow releases money only for time the
        placement actually ran.
      </p>

      <div>
        <span className="field-label">
          Start date · {offer.term_days} days
        </span>
        {status === "loading" ? (
          <p className="muted small">Checking the calendar…</p>
        ) : (
          <div className="calendar">
            {days.map((day) => (
              <button
                key={day.date}
                type="button"
                disabled={!day.free}
                className={
                  day.date === chosen ? "day on" : day.free ? "day" : "day busy"
                }
                onClick={() => setStart(day.date)}
                title={day.free ? day.date : `${day.date} - taken`}
              >
                {day.label}
              </button>
            ))}
          </div>
        )}
        {chosen && (
          <p className="muted small">
            {chosen} to {endDate(chosen, offer.term_days)}
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
          : `Request · ${formatUsd(offer.price_cents)}`}
      </button>
      <p className="muted small">
        Sending a request charges nothing. The seller approves first.
      </p>
    </form>
  );
}
