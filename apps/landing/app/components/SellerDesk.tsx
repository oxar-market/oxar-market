"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsd, PLACEMENTS, placementSpec, type PlacementKind } from "@oxar/core";
import { sendLink, signInWithCode, signOut } from "@/lib/auth";
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
import { ArrowLeft, Chevron, Gavel, Pause, Pencil, Play, Plus, SignOut } from "./icons";
import { Notice } from "./Notice";
import { PayoutWallet } from "./PayoutWallet";
import { usePriceFields } from "./PriceFields";
import { NewAuction, SpotAuctions } from "./SellerLots";

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
    setError(
      result === "unknown"
        ? "No seller on that address yet. Onboarding is by hand - book a call and we will add you."
        : "Could not send the link. Try again in a minute.",
    );
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
 *
 * Рядом со ссылкой - поле для кода из того же письма. Оно нужно там, где
 * ссылка бесполезна: во встроенном браузере кошелька почта откроет её в
 * системном браузере, сессия окажется в нём, а человек останется в кошельке.
 */
function LinkSent({ email, onAgain }: { email: string; onAgain: () => void }) {
  const [wait, setWait] = useState(60);
  const [again, setAgain] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [codeError, setCodeError] = useState("");

  useEffect(() => {
    if (wait === 0) return;
    const timer = window.setTimeout(() => setWait((left) => left - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function enter(event: React.FormEvent) {
    event.preventDefault();
    setCodeError("");
    setChecking(true);
    const result = await signInWithCode(email, code.trim());
    setChecking(false);
    // На успехе делать нечего: сессия сменилась, и кабинет перерисует себя сам.
    if (result === "bad") setCodeError("That code does not match. Check the email again.");
    else if (result === "error") setCodeError("Could not check the code. Try again in a minute.");
  }

  return (
    <div className="card">
      <Notice tone="success" title="Check your inbox">
        A sign-in link is on its way to {email}. Open it on this device.
      </Notice>

      <form className="code-form" onSubmit={enter}>
        <label>
          Or type the code from the same email
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="Code from the email"
          />
        </label>
        {codeError && <Notice tone="error">{codeError}</Notice>}
        {/* Длину кода не проверяем: она настраивается в Supabase и у нас уже
            не та, что по умолчанию. Неверный код отбракует сервер. */}
        <button type="submit" className="primary" disabled={checking || !code.trim()}>
          {checking ? "Checking…" : "Sign in with the code"}
        </button>
      </form>

      {again === "error" && (
        <Notice tone="error">Could not send it again. Try in a minute.</Notice>
      )}

      <div className="desk-acts">
        <button
          type="button"
          className="pill"
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
        <button type="button" className="pill" onClick={onAgain}>
          Other email
        </button>
      </div>
    </div>
  );
}

/**
 * Где сейчас продавец. Раньше каждое действие раскрывало поля прямо в списке:
 * кабинет удлинялся вдвое, а место, к которому относились поля, уезжало вверх.
 * Теперь это страницы - на каждой одно дело и стрелка обратно.
 */
type View =
  | { kind: "list" }
  | { kind: "add" }
  | { kind: "spot"; id: string }
  | { kind: "price"; id: string }
  | { kind: "auction"; id: string };

function priceLine(listing: MyListing): string {
  return listing.pricing === "daily"
    ? `${formatUsd(listing.price_cents)} a day · from ${listing.term_days} days`
    : `${formatUsd(listing.price_cents)} for ${listing.term_days} days`;
}

/** Страница кабинета: стрелка обратно, заголовок и само дело под ними. */
function DeskPage({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card desk">
      <header className="desk-page-head">
        <button type="button" className="pill pill-icon" onClick={onBack} aria-label="Back">
          <ArrowLeft />
        </button>
        <h2>{title}</h2>
      </header>
      {children}
    </div>
  );
}

function Desk({ seller }: { seller: MySeller }) {
  const [listings, setListings] = useState<MyListing[] | null>(null);
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [lots, setLots] = useState<MyLot[] | null>(null);
  const [view, setView] = useState<View>({ kind: "list" });
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
  const spot =
    view.kind === "list" || view.kind === "add"
      ? null
      : (listings ?? []).find((listing) => listing.id === view.id) ?? null;

  if (view.kind === "add") {
    return (
      <DeskPage title="Add a spot" onBack={() => setView({ kind: "list" })}>
        <AddSpot
          sellerId={seller.id}
          taken={(listings ?? []).map((listing) => listing.kind)}
          onAdded={() => {
            setView({ kind: "list" });
            reload();
          }}
        />
      </DeskPage>
    );
  }

  // Место могло исчезнуть между переходом и обновлением списка - тогда показываем
  // сам список, а не пустую страницу неизвестно чего.
  if (spot) {
    const label = placementSpec(spot.kind).label;

    if (view.kind === "price") {
      return (
        <DeskPage title={`${label} price`} onBack={() => setView({ kind: "spot", id: spot.id })}>
          <EditPrice
            listing={spot}
            onSaved={() => {
              setView({ kind: "spot", id: spot.id });
              reload();
            }}
          />
        </DeskPage>
      );
    }

    if (view.kind === "auction") {
      return (
        <DeskPage title={`Auction the ${label.toLowerCase()}`} onBack={() => setView({ kind: "spot", id: spot.id })}>
          <NewAuction
            listing={spot}
            onOpened={() => {
              setView({ kind: "spot", id: spot.id });
              reload();
            }}
          />
        </DeskPage>
      );
    }

    return (
      <DeskPage title={label} onBack={() => setView({ kind: "list" })}>
        <SpotPage
          listing={spot}
          lots={(lots ?? []).filter((lot) => lot.listing_id === spot.id)}
          onEditPrice={() => setView({ kind: "price", id: spot.id })}
          onAuction={() => setView({ kind: "auction", id: spot.id })}
          onChanged={reload}
        />
      </DeskPage>
    );
  }

  return (
    <div className="card desk">
      <header className="desk-head">
        {/* Число подписчиков отсюда убрано: продавец знает его и без нас, а
            строка занимала самое заметное место в кабинете. */}
        <h2>@{seller.x_handle}</h2>

        {/* Выход стоит у имени: он про этот аккаунт, а не про места в списке
            ниже, где он и висел. Иконка без подписи - действие редкое, а место
            в потоке кабинета занимало строку. */}
        <button
          type="button"
          className="pill pill-icon"
          onClick={async () => {
            await signOut();
          }}
          aria-label="Sign out"
          title="Sign out"
        >
          <SignOut />
        </button>
      </header>

      <PayoutWallet sellerId={seller.id} saved={seller.payout_wallet} />

      {error && <Notice tone="error">{error}</Notice>}

      {/* Пустая секция «Requests waiting» стояла всегда и занимала две строки
          ради слова «nothing». Заявок нет - и говорить не о чем. */}
      {waiting.length > 0 && (
      <section className="req-row">
        <span className="field-label">Requests waiting</span>
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
                className="pill pill-yes"
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
                className="pill"
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
      )}

      <section className="req-row">
        <span className="field-label">Your spots</span>
        {listings === null && <p className="muted small">Loading…</p>}

        {/* Список мест - строки, ведущие внутрь. Раньше в каждой строке стояли
            цена, состояние и две кнопки, а под ней ещё и третья: четыре ряда
            таких строк читались как приборная панель, хотя это список из
            четырёх пунктов. */}
        {listings && listings.length > 0 && (
          <div className="spot-list">
            {listings.map((listing) => (
              <button
                key={listing.id}
                type="button"
                className="spot-row"
                onClick={() => setView({ kind: "spot", id: listing.id })}
              >
                <span className="spot-row-name">{placementSpec(listing.kind).label}</span>
                <span className="spot-row-price">{priceLine(listing)}</span>
                <span className={listing.active ? "tag" : "tag off"}>
                  {listing.active ? "On sale" : "Paused"}
                </span>
                <Chevron className="spot-row-go" />
              </button>
            ))}
          </div>
        )}

        {listings?.length === 0 && (
          <p className="muted small">Nothing listed yet. Add your first spot.</p>
        )}

        <button type="button" className="pill" onClick={() => setView({ kind: "add" })}>
          <Plus />
          Add a spot
        </button>
      </section>
    </div>
  );
}

/**
 * Страница места. Здесь всё, что к нему относится: цена, продажа и торги -
 * раньше торги лежали отдельным списком в конце кабинета, и связь с местом
 * приходилось держать в голове.
 */
function SpotPage({
  listing,
  lots,
  onEditPrice,
  onAuction,
  onChanged,
}: {
  listing: MyListing;
  lots: MyLot[];
  onEditPrice: () => void;
  onAuction: () => void;
  onChanged: () => void;
}) {
  return (
    <>
      <div className="spot-facts">
        <span className="spot-fact">
          <span className="field-label">Price</span>
          <strong>{priceLine(listing)}</strong>
        </span>
        <span className="spot-fact">
          <span className="field-label">State</span>
          <span className={listing.active ? "tag" : "tag off"}>
            {listing.active ? "On sale" : "Paused"}
          </span>
        </span>
      </div>

      <div className="pill-row">
        <button type="button" className="pill" onClick={onEditPrice}>
          <Pencil />
          Edit price
        </button>
        <button
          type="button"
          className="pill"
          onClick={async () => {
            await setActive(listing.id, !listing.active);
            onChanged();
          }}
        >
          {listing.active ? <Pause /> : <Play />}
          {listing.active ? "Pause" : "Resume"}
        </button>
        <button type="button" className="pill" onClick={onAuction}>
          <Gavel />
          Start an auction
        </button>
      </div>

      <SpotAuctions lots={lots} onChanged={onChanged} />
    </>
  );
}

/** Цена места: те же поля, что при выставлении, только на своей странице. */
function EditPrice({
  listing,
  onSaved,
}: {
  listing: MyListing;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const price = usePriceFields(listing.kind, {
    pricing: listing.pricing,
    price_cents: listing.price_cents,
    term_days: listing.term_days,
    payment: listing.payment,
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
    onSaved();
  }

  return (
    <form className="desk-edit" onSubmit={save}>
      {price.fields}
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" className="primary">
        Save the price
      </button>
    </form>
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
}: {
  sellerId: string;
  taken: PlacementKind[];
  onAdded: () => void;
}) {
  const free = PLACEMENTS.filter((spec) => !taken.includes(spec.kind));
  const [kind, setKind] = useState<PlacementKind | "">("");
  const [error, setError] = useState("");

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
    if (!chosen) return;

    const read = price.read();
    if ("error" in read) {
      setError(read.error);
      return;
    }

    const result = await addListing(sellerId, { kind: chosen, ...read.value });
    if (result === "done") {
      // Отдельная плашка «место выставлено» тут больше не нужна: страница
      // закрывается, и место видно в списке, куда мы возвращаемся.
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

      <button type="submit" className="primary">
        List the spot
      </button>
    </form>
  );
}
