"use client";

import { useEffect, useState } from "react";
import { formatUsd, placementSpec, type PlacementKind } from "@oxar/core";
import { offersFor, type Offer } from "@/lib/listings";

/**
 * Пустой макет профиля X. Места кликабельны: наводишь - подсвечивается, жмёшь -
 * видишь, кто это место продаёт.
 *
 * Макет намеренно без имён и аватарок: продаётся место, а не конкретный человек,
 * и список продавцов под местом это показывает лучше любого текста.
 */

const CALL_URL = "https://cal.com/oxar";

type Role = "creator" | "advertiser";

export function XProfile({ role }: { role: Role }) {
  const [picked, setPicked] = useState<PlacementKind | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);

  useEffect(() => {
    if (!picked) return;
    let live = true;
    setOffers(null);
    offersFor(picked).then((rows) => {
      if (live) setOffers(rows);
    });
    return () => {
      live = false;
    };
  }, [picked]);

  return (
    <div className="xp">
      <div className="xp-mock">
        <Spot kind="banner" picked={picked} onPick={setPicked} className="xp-banner">
          Banner
        </Spot>

        <div className="xp-head">
          <Spot kind="avatar" picked={picked} onPick={setPicked} className="xp-avatar">
            Avatar
          </Spot>
        </div>

        <div className="xp-lines">
          <div className="xp-row">
            <span className="xp-fake-name" />
            <Spot kind="name_suffix" picked={picked} onPick={setPicked}>
              Name suffix
            </Spot>
          </div>

          <Spot kind="bio_text" picked={picked} onPick={setPicked} className="xp-wide">
            Bio text
          </Spot>

          <div className="xp-row">
            <Spot kind="bio_link" picked={picked} onPick={setPicked}>
              Bio link
            </Spot>
            <Spot kind="location" picked={picked} onPick={setPicked}>
              Location
            </Spot>
          </div>

          <Spot kind="pinned_post" picked={picked} onPick={setPicked} className="xp-pinned">
            Pinned post
          </Spot>
        </div>
      </div>

      {!picked && (
        <p className="muted small">
          Every highlighted area is for sale. Pick one to see who is renting it out.
        </p>
      )}

      {picked && (
        <div className="xp-offers">
          <div className="xp-offers-head">
            <strong>{placementSpec(picked).label}</strong>
            <button type="button" className="xp-clear" onClick={() => setPicked(null)}>
              Clear
            </button>
          </div>

          {offers === null && <p className="muted small">Loading…</p>}

          {offers?.length === 0 && (
            <p className="muted small">
              Nobody is selling this spot yet. Advertisers on the waitlist get it first.
            </p>
          )}

          {offers?.map((offer) => (
            <div key={offer.id} className="xp-offer">
              <div>
                <strong>@{offer.seller.x_handle}</strong>
                <span className="muted small">
                  {" "}
                  {offer.seller.follower_count.toLocaleString("en-US")} followers
                  {offer.seller.is_org ? " · community" : ""}
                </span>
              </div>
              <div className="xp-offer-right">
                <span className="price">{formatUsd(offer.price_cents)}</span>
                <span className="muted small"> / {offer.term_days}d</span>
              </div>
            </div>
          ))}

          {role === "creator" ? (
            <a className="primary" href={CALL_URL} target="_blank" rel="noreferrer">
              Sell this spot - book a call
            </a>
          ) : (
            offers &&
            offers.length > 0 && (
              <a
                className="primary"
                href={`https://app.oxar.app/?kind=${picked}`}
                target="_blank"
                rel="noreferrer"
              >
                Request a placement
              </a>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Spot({
  kind,
  picked,
  onPick,
  className = "",
  children,
}: {
  kind: PlacementKind;
  picked: PlacementKind | null;
  onPick: (kind: PlacementKind) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const state = picked === kind ? "spot on" : "spot";
  return (
    <button type="button" className={`${state} ${className}`} onClick={() => onPick(kind)}>
      <span className="spot-label">{children}</span>
    </button>
  );
}
