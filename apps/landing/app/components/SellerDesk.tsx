"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsd, PLACEMENTS, placementSpec, type PlacementKind } from "@oxar/core";
import { sendLink, signOut } from "@/lib/auth";
import { closeDueLots } from "@/lib/auctions";
import type { SellerAccount } from "@/lib/use-seller-account";
import {
  addListing,
  decide,
  myBookings,
  myListings,
  myLots,
  mySeller,
  setActive,
  updateListing,
  type MyBooking,
  type MyListing,
  type MyLot,
  type MySeller,
} from "@/lib/seller";
import { Cross, Eye, EyeOff, Pencil, SignOut } from "./icons";
import { Notice } from "./Notice";
import { usePriceFields } from "./PriceFields";
import { SpotAuctions } from "./SellerLots";

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
  const [lots, setLots] = useState<MyLot[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    // Лоты грузим здесь, а не внутри каждого места: один запрос на кабинет
    // вместо запроса на карточку. Сначала закрываем то, у чего вышел срок -
    // продавец должен видеть исход, а не висящий торг.
    await closeDueLots();
    const [spots, requests, auctions] = await Promise.all([
      myListings(seller.id),
      myBookings(),
      myLots(),
    ]);
    setListings(spots);
    setBookings(requests);
    setLots(auctions);
  }, [seller.id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const waiting = (bookings ?? []).filter((booking) => booking.status === "requested");

  return (
    <div className="card">
      <header className="req-head desk-head">
        <div>
          <h2>@{seller.x_handle}</h2>
          <p className="req-sub">
            {seller.follower_count.toLocaleString("en-US")} followers
            {seller.verified ? " · verified" : " · not verified yet"}
          </p>
        </div>

        {/* Выход стоит у имени: он про этот аккаунт, а не про места в списке
            ниже, где он и висел. Иконка без подписи - действие редкое, а место
            в потоке кабинета занимало строку. */}
        <button
          type="button"
          className="desk-out"
          onClick={async () => {
            await signOut();
          }}
          aria-label="Sign out"
          title="Sign out"
        >
          <SignOut />
        </button>
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
          <Spot
            key={listing.id}
            listing={listing}
            lots={(lots ?? []).filter((lot) => lot.listing_id === listing.id)}
            onChanged={reload}
          />
        ))}

        {listings?.length === 0 && (
          <p className="muted small">Nothing listed yet. Add your first spot.</p>
        )}

        {/* Форма стоит за кнопкой: место добавляют один раз, а поля висели
            всегда и удлиняли кабинет на целый экран. */}
        {adding ? (
          <AddSpot
            sellerId={seller.id}
            taken={(listings ?? []).map((listing) => listing.kind)}
            onAdded={() => {
              setAdding(false);
              reload();
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <button type="button" className="desk-more" onClick={() => setAdding(true)}>
            Add a spot
          </button>
        )}
      </section>
    </div>
  );
}

/**
 * Место продавца. Здесь всё, что к нему относится: цена, продажа и торги -
 * раньше торги лежали отдельным списком в конце кабинета, и связь с местом
 * приходилось держать в голове.
 */
function Spot({
  listing,
  lots,
  onChanged,
}: {
  listing: MyListing;
  lots: MyLot[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const price = usePriceFields(listing.kind, {
    pricing: listing.pricing,
    price_cents: listing.price_cents,
    term_days: listing.term_days,
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const read = price.read();
    if ("error" in read) {
      setError(read.error);
      return;
    }

    const result = await updateListing(listing.id, read.value);
    if (result === "error") {
      setError("Could not save that. Try again.");
      return;
    }
    setEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 4000);
    onChanged();
  }

  return (
    <div className="desk-spot">
      <div className="desk-item">
        <div className="desk-lines">
          <strong>{placementSpec(listing.kind).label}</strong>
          <span className="muted small">
            {listing.pricing === "daily"
              ? `${formatUsd(listing.price_cents)} a day · from ${listing.term_days} days`
              : `${formatUsd(listing.price_cents)} for ${listing.term_days} days`}
            {listing.active ? "" : " · off sale"}
          </span>
          {saved && <span className="desk-saved">Price updated</span>}
        </div>
        {/* Иконки вместо подписей: у места два постоянных действия, и надписи
            на них занимали половину строки на телефоне. Что делает каждая,
            говорят aria-label и подсказка при наведении. */}
        <div className="desk-acts">
          <button
            type="button"
            className={editing ? "desk-icon on" : "desk-icon"}
            onClick={() => setEditing(!editing)}
            aria-label={editing ? "Close the price editor" : "Edit the price"}
            title={editing ? "Close the price editor" : "Edit the price"}
          >
            {editing ? <Cross /> : <Pencil />}
          </button>
          <button
            type="button"
            className="desk-icon"
            onClick={async () => {
              await setActive(listing.id, !listing.active);
              onChanged();
            }}
            aria-label={listing.active ? "Take off sale" : "Put back on sale"}
            title={listing.active ? "Take off sale" : "Put back on sale"}
          >
            {listing.active ? <EyeOff /> : <Eye />}
          </button>
        </div>
      </div>

      {editing && (
        <form className="desk-edit" onSubmit={save}>
          {price.fields}
          {error && <Notice tone="error">{error}</Notice>}
          <button type="submit" className="primary">
            Save the price
          </button>
        </form>
      )}

      <SpotAuctions listing={listing} lots={lots} onChanged={onChanged} />
    </div>
  );
}

/**
 * Выставить место. В списке все места профиля, а занятые помечены и не
 * выбираются: короткий список из трёх пунктов выглядел так, будто остальные
 * места пропали, хотя они просто уже выставлены.
 */
function AddSpot({
  sellerId,
  taken,
  onAdded,
  onCancel,
}: {
  sellerId: string;
  taken: PlacementKind[];
  onAdded: () => void;
  onCancel: () => void;
}) {
  const free = PLACEMENTS.filter((spec) => !taken.includes(spec.kind));
  const [kind, setKind] = useState<PlacementKind | "">("");
  const [error, setError] = useState("");
  const [listed, setListed] = useState("");

  const chosen = (kind || free[0]?.kind) as PlacementKind | undefined;
  const price = usePriceFields(chosen ?? "avatar");

  if (free.length === 0) {
    return (
      <p className="muted small">Every spot on your profile is listed already.</p>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setListed("");
    if (!chosen) return;

    const read = price.read();
    if ("error" in read) {
      setError(read.error);
      return;
    }

    const result = await addListing(sellerId, { kind: chosen, ...read.value });
    if (result === "done") {
      price.reset();
      setKind("");
      setListed(placementSpec(chosen).label);
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
    <form className="desk-edit" onSubmit={submit} noValidate>
      {/* Молча созданное место читается как сбой: человек не понимает, сделалось
          ли что-нибудь вообще. */}
      {listed && (
        <Notice tone="success" title={`${listed} is listed`}>
          It shows up in the list above, and buyers see it in the marketplace.
        </Notice>
      )}

      <label>
        Spot
        <select
          value={chosen ?? ""}
          onChange={(event) => setKind(event.target.value as PlacementKind)}
        >
          {PLACEMENTS.map((option) => {
            const busy = taken.includes(option.kind);
            return (
              <option key={option.kind} value={option.kind} disabled={busy}>
                {option.label}
                {busy ? " - listed already" : ""}
              </option>
            );
          })}
        </select>
      </label>

      {price.fields}

      {error && <Notice tone="error">{error}</Notice>}

      <div className="desk-acts">
        <button type="submit" className="primary">
          List the spot
        </button>
        <button type="button" className="desk-no" onClick={onCancel}>
          Never mind
        </button>
      </div>
    </form>
  );
}
