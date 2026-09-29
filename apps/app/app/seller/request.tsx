"use client";

import { avatarLetter } from "@oxar/core";
import type { SellerRequest } from "@/lib/seller";
import { Bar, SpotMark, clock, shortDay, shortWallet, usd } from "./parts.tsx";

/**
 * Заявка на аренду: чьё лого, на каком месте, на сколько и за сколько.
 * Деньги не двигаются, пока продавец не одобрит; отказ ничего не стоит
 * никому.
 */
export function RequestView({
  request,
  now,
  onBack,
  onAnswer,
  busy,
  failed,
}: {
  request: SellerRequest;
  now: number;
  onBack: () => void;
  onAnswer: (approve: boolean) => void;
  busy: boolean;
  failed: boolean;
}) {
  // Последний день аренды входит в срок: «Oct 1 - Oct 14» - это 14 дней.
  const days =
    Math.round((Date.parse(request.endsOn) - Date.parse(request.startsOn)) / 86_400_000) + 1;
  const scoreLine =
    request.buyerDeals < 3 || request.buyerRating === null
      ? "New buyer"
      : `Buyer ★ ${request.buyerRating.toFixed(1)} · ${request.buyerDeals} deals`;
  return (
    <>
      <Bar title="Request" onBack={onBack} />
      <div className="sl-meta">
        <span>Rental request</span>
        <span>answer within {clock(Date.parse(request.answerBy) - now)}</span>
      </div>
      <h2 className="sl-h2">
        {request.spotLabel} · {request.thingTitle}
      </h2>

      <div className="sl-photo" style={{ aspectRatio: "350 / 320" }}>
        {request.thingPhoto && <img src={request.thingPhoto} alt="" />}
        {request.spotRect && (
          <SpotMark
            rect={request.spotRect}
            number={Number(request.spotLabel.replace(/\D/g, "")) || 1}
            art={request.artworkUrl}
          />
        )}
      </div>

      <div className="sl-card sl-buyer">
        <i>{avatarLetter(request.buyerWallet)}</i>
        <b>{shortWallet(request.buyerWallet)}</b>
        <small>{scoreLine}</small>
      </div>

      <div className="sl-card sl-table">
        <div>
          <span>Dates</span>
          <span>
            {shortDay(request.startsOn)} - {shortDay(request.endsOn)}, {days} days
          </span>
        </div>
        <div>
          <span>Price</span>
          <span>{usd(request.pricePerDayCents)} / day</span>
        </div>
        <div className="total">
          <span>Total</span>
          <span>{usd(days * request.pricePerDayCents)}</span>
        </div>
      </div>

      <p className="sl-lead">
        Nothing is charged until you approve. Declining costs neither of you
        anything.
      </p>

      {failed && <p className="bad">That did not go through. The request may have expired.</p>}

      <div className="sl-pair">
        <button type="button" className="sl-btn light" disabled={busy} onClick={() => onAnswer(false)}>
          Decline
        </button>
        <button type="button" className="sl-btn dark" disabled={busy} onClick={() => onAnswer(true)}>
          Approve
        </button>
      </div>
    </>
  );
}
