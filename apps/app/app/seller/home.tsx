"use client";

import { useEffect, useState } from "react";
import type { DealToRate, Score, SellerRequest, SellerThing } from "@/lib/seller";
import { loadMyHandle, saveMyHandle } from "@/lib/reviews";
import { BUILD } from "@/lib/build";
import { Thumb, clock, shortDay, usd } from "./parts.tsx";

/**
 * Кабинет продавца по борду «Seller - home and add a thing»: счёт, заявка,
 * ждущая ответа, вещи с одним статусом и кнопка «Add a thing».
 *
 * Меньше трёх сделок - «New seller», а не цифра: две пятёрки подряд ещё не
 * репутация (правило «Where scores live» с борда).
 */
export function SellerHome({
  score,
  requests,
  toRate,
  things,
  now,
  onAdd,
  onRequest,
  onRate,
  onSetup,
  onOpen,
  onReviews,
  onWinners,
}: {
  score: Score;
  requests: SellerRequest[];
  toRate: DealToRate[];
  things: SellerThing[];
  now: number;
  onAdd: () => void;
  onRequest: (request: SellerRequest) => void;
  onRate: (deal: DealToRate) => void;
  onSetup: (thingId: string) => void;
  onOpen: (thingId: string) => void;
  onReviews: () => void;
  /** Закончившийся торг: логотипы победителей. */
  onWinners: (thing: SellerThing) => void;
}) {
  const first = requests[0];
  return (
    <>
      <div className="sl-card sl-score">
        <div>
          <span className="sl-score-cap">Seller score</span>
          <span className="sl-score-num">
            {score.deals < 3 || score.rating === null ? "New" : `★ ${score.rating.toFixed(1)}`}
          </span>
        </div>
        <div>
          <span className="sl-score-cap">Deals</span>
          <span className="sl-score-num">{score.deals}</span>
        </div>
        <p className="sl-score-note">
          Buyers rate each deal once it ends. It shows on your things in the
          Market.{" "}
          <button type="button" className="seller-line" onClick={onReviews}>
            <b>See reviews</b>
          </button>
        </p>
      </div>

      <NameCard />

      {first && (
        <button type="button" className="sl-waiting" onClick={() => onRequest(first)}>
          <span className="dot" />
          <span>
            <b>
              {requests.length === 1 ? "1 request waiting" : `${requests.length} requests waiting`}
            </b>
            <small>
              {first.spotLabel} · {first.thingTitle} · {days(first)} days ·{" "}
              {usd(days(first) * first.pricePerDayCents)}
            </small>
          </span>
          <span className="go">Review</span>
        </button>
      )}

      {/* Оценка сделки - та же карточка, что заявка: это тоже ход за
          продавцом, и прятать его ниже вещей значило бы забыть о нём. */}
      {toRate[0] && (
        <button type="button" className="sl-waiting" onClick={() => onRate(toRate[0]!)}>
          <span className="dot" />
          <span>
            <b>{toRate.length === 1 ? "1 deal to rate" : `${toRate.length} deals to rate`}</b>
            <small>{toRate[0].title}</small>
          </span>
          <span className="go">Rate</span>
        </button>
      )}

      <div className="sl-head">
        <h2>Your things</h2>
        <span>{things.length}</span>
      </div>

      {things.length > 0 && (
        <div className="sl-card sl-things">
          {things.map((one) => (
            <button
              type="button"
              key={one.id}
              className="sl-thing"
              // Цены ставятся, когда листинг готов; идущий торг открывается
              // той же страницей, что у покупателей.
              disabled={one.state === "preparing" || one.state === "rented"}
              onClick={() =>
                one.state === "live" ? onOpen(one.id) : one.state === "ended" ? onWinners(one) : onSetup(one.id)
              }
            >
              <Thumb src={one.cover} holo={one.state === "preparing"} />
              <span className="sl-thing-name">{one.title}</span>
              <span className={`sl-state ${one.state}`}>
                <i />
                {LABEL[one.state]}
              </span>
              <span className="sl-thing-sub">{line(one, now)}</span>
            </button>
          ))}
        </div>
      )}

      <button type="button" className="sl-btn dark" onClick={onAdd}>
        Add a thing
      </button>

      <p className="sl-foot">
        <span className="build">Build {BUILD}</span>
        <a href="/terms">Terms</a>
      </p>
    </>
  );
}

const LABEL = {
  live: "LIVE AUCTION",
  ended: "ENDED",
  rented: "RENTED",
  idle: "IDLE",
  preparing: "PREPARING",
} as const;

function line(one: SellerThing, now: number): string {
  switch (one.state) {
    case "live":
      return one.onMarket
        ? `Closes in ${clock(Date.parse(one.closesAt ?? "") - now)} · ${one.bidSpots} of ${one.spots} spots bid`
        : "Published. Waiting for our approval to show on the Market";
    case "ended":
      return one.wonSpots > 0
        ? `Auction ended · ${one.wonSpots} of ${one.spots} spots won · Get the logos`
        : "Auction ended without bids";
    case "rented":
      return `${one.rentedSpots} of ${one.spots} spots rented${
        one.rentedUntil ? `, until ${shortDay(one.rentedUntil)}` : ""
      }`;
    case "idle":
      return "Spots not priced yet. Set up spots";
    case "preparing":
      return "We build the 3D listing, usually within a day";
  }
}

/** Последний день аренды входит в срок: «Oct 1 - Oct 14» - это 14 дней. */
function days(request: SellerRequest): number {
  return Math.round((Date.parse(request.endsOn) - Date.parse(request.startsOn)) / 86_400_000) + 1;
}

/**
 * Имя на маркете: «Sold by @name» под каждой вещью. Без него покупатели
 * видят кошелёк.
 */
function NameCard() {
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "ok" | "taken" | "bad">("idle");
  useEffect(() => {
    void loadMyHandle().then((handle) => {
      setSaved(handle);
      setValue(handle ?? "");
    });
  }, []);

  return (
    <form
      className="sl-card ad-card"
      onSubmit={async (event) => {
        event.preventDefault();
        setState("saving");
        const result = await saveMyHandle(value.trim());
        setState(result);
        if (result === "ok") setSaved(value.trim());
      }}
    >
      <label className="sl-field">
        Your name on the Market
        <span className="sl-input soft">
          @
          <input
            value={value}
            maxLength={15}
            placeholder="nickname"
            onChange={(event) => {
              setValue(event.target.value.replace(/[^A-Za-z0-9_]/g, ""));
              setState("idle");
            }}
          />
        </span>
      </label>
      <p className="muted">
        {state === "taken"
          ? "That name is taken."
          : state === "bad"
            ? "Letters, digits and _, up to 15."
            : state === "ok"
              ? "Saved. Buyers see it under your things."
              : "Without a name, buyers see your wallet."}
      </p>
      <button
        type="submit"
        className="sl-btn light"
        disabled={!value.trim() || value.trim() === saved || state === "saving"}
      >
        {state === "saving" ? "Saving…" : "Save name"}
      </button>
    </form>
  );
}
