"use client";

import { useMemo, useState } from "react";
import { formatUsd, isValidHandle, normalizeHandle } from "@oxar/core";
import { endDate, requestPlacement } from "@/lib/request-placement";

type Busy = { start_date: string; end_date: string };
type Status = "idle" | "sending" | "done" | "error";

const DAYS_AHEAD = 28;

export function RequestForm({
  listingId,
  termDays,
  priceCents,
  busy,
}: {
  listingId: string;
  termDays: number;
  priceCents: number;
  busy: Busy[];
}) {
  const days = useMemo(() => upcomingDays(DAYS_AHEAD, termDays, busy), [termDays, busy]);
  const firstFree = days.find((d) => d.free)?.date ?? "";

  const [start, setStart] = useState(firstFree);
  const [handle, setHandle] = useState("");
  const [contact, setContact] = useState("");
  const [creative, setCreative] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const buyer = normalizeHandle(handle);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!isValidHandle(buyer)) {
      setError("Enter the X handle the campaign is for.");
      return;
    }
    if (!start) {
      setError("Pick a start date.");
      return;
    }

    setStatus("sending");
    const result = await requestPlacement({
      listing_id: listingId,
      buyer_handle: buyer,
      buyer_contact: contact.trim() || null,
      creative_text: creative.trim() || null,
      start_date: start,
      end_date: endDate(start, termDays),
      price_cents: priceCents,
    });

    if (result === "created") {
      setStatus("done");
    } else {
      setStatus("error");
      setError("Could not send the request. Try again in a minute.");
    }
  }

  if (status === "done") {
    return (
      <section className="card">
        <h2>Request sent</h2>
        <p>
          The seller sees your request with the creative attached and either
          approves it or turns it down. Nothing is charged until they approve.
        </p>
        <p className="muted small">
          {start} → {endDate(start, termDays)} · {formatUsd(priceCents)}
        </p>
      </section>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Request this placement</h2>

      <div>
        <span className="field-label">Start date · {termDays} days</span>
        <div className="calendar">
          {days.map((day) => (
            <button
              key={day.date}
              type="button"
              disabled={!day.free}
              className={
                day.date === start ? "day on" : day.free ? "day" : "day busy"
              }
              onClick={() => setStart(day.date)}
              title={day.free ? day.date : `${day.date} - taken`}
            >
              {day.label}
            </button>
          ))}
        </div>
        {start && (
          <p className="muted small">
            {start} → {endDate(start, termDays)}
          </p>
        )}
      </div>

      <label>
        Your X handle
        <input
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@yourproject"
          autoComplete="off"
          required
        />
      </label>

      <label>
        What goes up <span className="optional">link or text</span>
        <input
          value={creative}
          onChange={(e) => setCreative(e.target.value)}
          placeholder="https://… or the exact text"
        />
      </label>

      <label>
        Email or Telegram <span className="optional">optional</span>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@example.com"
          autoComplete="off"
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button type="submit" className="primary" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : `Request · ${formatUsd(priceCents)}`}
      </button>
      <p className="muted small">
        Sending a request doesn&apos;t charge anything. The seller approves first.
      </p>
    </form>
  );
}

type Day = { date: string; label: string; free: boolean };

/**
 * Дни, с которых можно начать. День свободен, если весь срок от него не
 * пересекается ни с одной занятой бронью.
 */
function upcomingDays(count: number, termDays: number, busy: Busy[]): Day[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const taken = new Set<string>();
  for (const range of busy) {
    for (
      const d = new Date(`${range.start_date}T00:00:00Z`);
      d <= new Date(`${range.end_date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      taken.add(d.toISOString().slice(0, 10));
    }
  }

  const days: Day[] = [];
  for (let i = 1; i <= count; i += 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);

    let free = true;
    for (let offset = 0; offset < termDays; offset += 1) {
      const inTerm = new Date(date);
      inTerm.setUTCDate(inTerm.getUTCDate() + offset);
      if (taken.has(inTerm.toISOString().slice(0, 10))) {
        free = false;
        break;
      }
    }

    days.push({ date: iso, label: String(date.getUTCDate()), free });
  }

  return days;
}
