"use client";

import { APP_URL, FOLLOW, TONES, day, usd, type Auction, type Next } from "./data.ts";
import type { View } from "./spots.tsx";

/** Карточки торгов - одни и те же на главной и на странице всех торгов. */

/**
 * Настоящий кадр вещи для карточки. Снимок 3D-модели рядом с ним выглядел
 * игрушкой, поэтому где есть съёмка - показываем её, где нет - модель.
 */
const PHOTOS: Record<string, string> = {
  "the-van": "/site/van-card.jpg",
};

export function AuctionCard({ one, view }: { one: Auction; view: View | null | undefined }) {
  const total = view ? Object.keys(view.quads).length : null;
  const sold = Object.keys(one.won).length;
  return (
    <a className={`v2-card tone-${TONES[one.slug] ?? "light"}`} href={`${APP_URL}?thing=${one.id}`}>
      <div className={PHOTOS[one.slug] ? "v2-visual photo" : "v2-visual"}>
        {PHOTOS[one.slug] ? (
          <img className="v2-photo" src={PHOTOS[one.slug]} alt="" />
        ) : view ? (
          <div className="v2-spotview">
            <img src={view.src} alt="" />
          </div>
        ) : (
          <span className="v2-wait" />
        )}
        <span className={one.status === "live" ? "v2-tag live" : "v2-tag soft ended"}>
          <span className="v2-dot" />
          {one.status === "live" ? "Live" : "Ended"}
        </span>
        <span className="v2-chip">{total ? `${sold} of ${total} ${total === 1 ? "spot" : "spots"} sold` : `${sold} ${sold === 1 ? "spot" : "spots"} sold`}</span>
      </div>
      <div className="v2-card-body">
        <div className="v2-card-name">{one.owner}</div>
        <p className="v2-card-sub">{one.title}</p>
        <dl className="v2-facts">
          <div>
            <dt>{one.status === "live" ? "Top bids" : "Raised"}</dt>
            <dd>{usd(one.raisedCents)}</dd>
          </div>
          <div>
            <dt>Bidders</dt>
            <dd>{one.bidders}</dd>
          </div>
          <div>
            <dt>{one.status === "live" ? "Closes" : "Closed"}</dt>
            <dd>{day(one.closedAt)}</dd>
          </div>
        </dl>
      </div>
    </a>
  );
}

/** Объявленный торг: в стиле самого шоу, мест и цен у него ещё нет. */
export function NextCard({ next }: { next: Next }) {
  return (
    <a className="v2-card tone-show" href={FOLLOW}>
        <div className="v2-visual v2-show">
          <span className="v2-show-word" aria-hidden>
            The
            <br />
            Ecosystem
            <br />
            Call
          </span>
          <span className="v2-tag soft">
            <span className="v2-dot" />
            Coming soon
          </span>
          <span className="v2-chip">Holiday edition</span>
        </div>
        <div className="v2-card-body">
          <div className="v2-card-name">{next.owner}</div>
          <p className="v2-card-sub">{next.title}</p>
          <dl className="v2-facts">
          <div>
            <dt>Format</dt>
            <dd>Live show</dd>
          </div>
          <div>
            <dt>Edition</dt>
            <dd>Holiday</dd>
          </div>
          <div>
            <dt>Opens</dt>
            <dd>{next.when}</dd>
          </div>
        </dl>
        </div>
      </a>
  );
}
