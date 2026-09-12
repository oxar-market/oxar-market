"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsd, PLACEMENTS, placementSpec, type PlacementKind } from "@oxar/core";
import { sendLink, signOut } from "@/lib/auth";
import type { SellerAccount } from "@/lib/use-seller-account";
import {
  addListing,
  decide,
  myBookings,
  myListings,
  mySeller,
  setActive,
  type MyBooking,
  type MyListing,
  type MySeller,
} from "@/lib/seller";
import { Notice } from "./Notice";
import { SellerLots } from "./SellerLots";

// Кабинет продавца. Вход по ссылке на почту, дальше свои места и заявки на них.
// Онбординг ручной: войти может любой, но местами владеет только тот, чей адрес
// мы завели в базе.

export function SellerDesk({
  account,
}: {
  account: SellerAccount & { reload: () => void };
}) {
  const [sentTo, setSentTo] = useState("");

  if (account.status === "loading") {
    return <p className="muted small">Checking…</p>;
  }

  if (account.status === "guest") {
    return sentTo ? (
      <LinkSent email={sentTo} onAgain={() => setSentTo("")} />
    ) : (
      <SignIn onSent={setSentTo} />
    );
  }

  if (account.status === "stranger") {
    return (
      <div className="card">
        <Notice tone="error" title="No spots on this account">
          You are signed in as {account.email}, but no seller is attached to it.
          Onboarding is by hand - book a call and we will set it up.
        </Notice>
        <button
          type="button"
          className="link-back"
          onClick={async () => {
            await signOut();
            account.reload();
          }}
        >
          Sign out
        </button>
      </div>
    );
  }

  return <Desk seller={account.seller} />;
}

function SignIn({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const address = email.trim();
    if (!address.includes("@")) {
      setError("Enter the email we onboarded you with.");
      return;
    }
    setSending(true);
    const result = await sendLink(address);
    setSending(false);
    if (result === "sent") {
      onSent(address);
      return;
    }
    setError("Could not send the link. Try again in a minute.");
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>Sign in</h2>
      <p className="muted small">
        Sellers are onboarded by hand, so use the address we agreed on. No
        password - we send a link.
      </p>
      <label>
        Email
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@mail.com"
          autoComplete="email"
        />
      </label>
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" className="primary" disabled={sending}>
        {sending ? "Sending…" : "Send the link"}
      </button>
    </form>
  );
}

/**
 * Письмо ушло. Повторить можно, но не сразу: у встроенной почты Supabase есть
 * свой предел, и второе письмо в ту же секунду просто не уйдёт.
 */
function LinkSent({ email, onAgain }: { email: string; onAgain: () => void }) {
  const [wait, setWait] = useState(60);
  const [again, setAgain] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (wait === 0) return;
    const timer = window.setTimeout(() => setWait((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  return (
    <div className="card">
      <Notice tone="success" title="Check your inbox">
        A sign-in link is on its way to {email}. Open it on this device.
      </Notice>

      {again === "error" && (
        <Notice tone="error">Could not send it again. Try in a minute.</Notice>
      )}

      <div className="desk-acts">
        <button
          type="button"
          className="desk-no"
          disabled={wait > 0 || again === "sending"}
          onClick={async () => {
            setAgain("sending");
            const result = await sendLink(email);
            setAgain(result === "sent" ? "sent" : "error");
            setWait(60);
          }}
        >
          {again === "sending"
            ? "Sending…"
            : wait > 0
              ? `Send again in ${wait}s`
              : "Send again"}
        </button>
        <button type="button" className="desk-no" onClick={onAgain}>
          Other email
        </button>
      </div>
    </div>
  );
}

function Desk({ seller }: { seller: MySeller }) {
  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const [spots, requests] = await Promise.all([myListings(seller.id), myBookings()]);
    setListings(spots);
    setBookings(requests);
  }, [seller.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const waiting = (bookings ?? []).filter((booking) => booking.status === "requested");

  return (
    <div className="card">
      <header className="req-head">
        <h2>@{seller.x_handle}</h2>
        <p className="req-sub">
          {seller.follower_count.toLocaleString("en-US")} followers
          {seller.verified ? " · verified" : " · not verified yet"}
        </p>
      </header>

      {error && <Notice tone="error">{error}</Notice>}

      <section className="req-row">
        <span className="field-label">Requests waiting</span>
        {bookings === null && <p className="muted small">Loading…</p>}
        {bookings !== null && waiting.length === 0 && (
          <p className="muted small">Nothing waiting for you right now.</p>
        )}
        {waiting.map((booking) => (
          <div key={booking.id} className="desk-item">
            <div className="desk-lines">
              <strong>@{booking.buyer_handle}</strong>
              <span className="muted small">
                {booking.start_date} to {booking.end_date} ·{" "}
                {formatUsd(booking.price_cents)}
              </span>
              {booking.creative_text && (
                <span className="muted small">{booking.creative_text}</span>
              )}
              {/* Продавец решает по тому, что увидит: показываем сам креатив,
                  а не ссылку на него. Клик открывает оригинал. */}
              {booking.creative_url && (
                <a
                  className={
                    /\.(png|jpe?g|webp|gif)$/i.test(booking.creative_url)
                      ? "desk-media"
                      : "desk-media is-video"
                  }
                  href={booking.creative_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {/\.(png|jpe?g|webp|gif)$/i.test(booking.creative_url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={booking.creative_url} alt="" />
                  ) : (
                    // Первого кадра у видео может и не быть, поэтому метка
                    // рисуется поверх: иначе продавец видит пустой прямоугольник.
                    <video src={booking.creative_url} muted playsInline preload="metadata" />
                  )}
                </a>
              )}
            </div>
            <div className="desk-acts">
              <button
                type="button"
                className="desk-yes"
                onClick={async () => {
                  setError("");
                  const result = await decide(booking.id, "approved");
                  if (result === "taken") {
                    setError("Those days are already taken by another booking.");
                  } else if (result === "error") {
                    setError("Could not save that. Try again.");
                  }
                  reload();
                }}
              >
                Approve
              </button>
              <button
                type="button"
                className="desk-no"
                onClick={async () => {
                  setError("");
                  await decide(booking.id, "rejected");
                  reload();
                }}
              >
                Turn down
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="req-row">
        <span className="field-label">Your spots</span>
        {listings === null && <p className="muted small">Loading…</p>}
        {listings?.map((listing) => (
          <div key={listing.id} className="desk-item">
            <div className="desk-lines">
              <strong>{placementSpec(listing.kind).label}</strong>
              <span className="muted small">
                {listing.pricing === "daily"
                  ? `${formatUsd(listing.price_cents)} a day · from ${listing.term_days} days`
                  : `${formatUsd(listing.price_cents)} for ${listing.term_days} days`}
                {listing.active ? "" : " · off sale"}
              </span>
            </div>
            <div className="desk-acts">
              <button
                type="button"
                className="desk-no"
                onClick={async () => {
                  await setActive(listing.id, !listing.active);
                  reload();
                }}
              >
                {listing.active ? "Take off sale" : "Put back"}
              </button>
            </div>
          </div>
        ))}
        {listings?.length === 0 && (
          <p className="muted small">Nothing listed yet. Add your first spot below.</p>
        )}
      </section>

      <AddSpot
        sellerId={seller.id}
        taken={(listings ?? []).map((listing) => listing.kind)}
        onAdded={reload}
      />

      <SellerLots listings={listings ?? []} />

      <button
        type="button"
        className="link-back"
        onClick={async () => {
          await signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );
}

function AddSpot({
  sellerId,
  taken,
  onAdded,
}: {
  sellerId: string;
  taken: PlacementKind[];
  onAdded: () => void;
}) {
  const free = PLACEMENTS.filter((spec) => !taken.includes(spec.kind));
  const [kind, setKind] = useState<PlacementKind | "">("");
  const [daily, setDaily] = useState(false);
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("");
  const [error, setError] = useState("");

  if (free.length === 0) {
    return (
      <section className="req-row">
        <span className="field-label">Add a spot</span>
        <p className="muted small">Every spot on your profile is listed already.</p>
      </section>
    );
  }

  const chosen = kind || free[0]!.kind;
  const spec = placementSpec(chosen);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    // Цену считаем в центах: доллары с копейками разошлись бы с выплатой.
    const dollars = Number(price.replace(",", "."));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Enter the price in dollars, like 250.");
      return;
    }
    const term = days.trim() ? Number(days) : daily ? 1 : spec.defaultDays;
    if (!Number.isInteger(term) || term < 1 || term > 90) {
      setError(daily ? "Minimum days: a whole number, 1 to 90." : "Term: 1 to 90 days.");
      return;
    }

    const result = await addListing(sellerId, {
      kind: chosen,
      pricing: daily ? "daily" : "term",
      price_cents: Math.round(dollars * 100),
      term_days: term,
    });

    if (result === "done") {
      setPrice("");
      setDays("");
      setKind("");
      onAdded();
      return;
    }
    setError(
      result === "duplicate"
        ? "That spot is already listed."
        : "Could not save that. Try again.",
    );
  }

  return (
    <form className="req-row desk-add" onSubmit={submit} noValidate>
      <span className="field-label">Add a spot</span>

      <label>
        Spot
        <select value={chosen} onChange={(event) => setKind(event.target.value as PlacementKind)}>
          {free.map((option) => (
            <option key={option.kind} value={option.kind}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="sides">
        <button
          type="button"
          className={daily ? "side" : "side active"}
          onClick={() => setDaily(false)}
        >
          Price for a term
        </button>
        <button
          type="button"
          className={daily ? "side active" : "side"}
          onClick={() => setDaily(true)}
        >
          Price per day
        </button>
      </div>

      <label>
        {daily ? "Price per day, $" : "Price for the whole term, $"}
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value.replace(/[^\d.,]/g, ""))}
          placeholder="250"
          inputMode="decimal"
        />
      </label>

      <label>
        {daily ? "Minimum days" : "Term in days"}
        <input
          value={days}
          onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
          placeholder={daily ? "1" : String(spec.defaultDays)}
          inputMode="numeric"
        />
      </label>

      {error && <Notice tone="error">{error}</Notice>}

      <button type="submit" className="primary">
        List the spot
      </button>
    </form>
  );
}
