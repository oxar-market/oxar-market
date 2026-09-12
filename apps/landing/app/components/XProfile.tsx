"use client";

import { useEffect, useState } from "react";
import { formatUsd, placementSpec, type PlacementKind } from "@oxar/core";
import { offersFor, type Offer } from "@/lib/listings";
import { RequestPlacement } from "./RequestPlacement";

/**
 * Макет профиля X - настоящая раскладка, а не схема: шапка со счётчиком постов,
 * баннер, аватарка внахлёст, кнопка профиля, имя с галочкой, био, строка с
 * ссылкой и локацией, счётчики и табы. Узнаваемость тут и есть смысл: человек
 * видит свой профиль и понимает, что именно продаётся.
 *
 * Что показывать под выбранным местом, зависит от роли. Покупателю - кто это
 * место сдаёт и по какой цене. Продавцу чужие предложения не нужны: ему нужно
 * выставить своё, а это у нас идёт через живой разговор.
 */

const CALL_URL = "https://cal.com/oxar";

type Role = "creator" | "advertiser";

export function XProfile({ role }: { role: Role }) {
  const [picked, setPicked] = useState<PlacementKind | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [requesting, setRequesting] = useState<Offer | null>(null);

  useEffect(() => {
    // Продавцу список чужих предложений не показываем, значит и не грузим.
    if (!picked || role !== "advertiser") return;
    let live = true;
    setOffers(null);
    offersFor(picked).then((rows) => {
      if (live) setOffers(rows);
    });
    return () => {
      live = false;
    };
  }, [picked, role]);

  useEffect(() => {
    setRequesting(null);
  }, [role]);

  if (requesting) {
    return <RequestPlacement offer={requesting} onBack={() => setRequesting(null)} />;
  }

  const spot = (kind: PlacementKind, className = "") => ({
    className: `${picked === kind ? "spot on" : "spot"} ${className}`.trim(),
    onClick: () => setPicked(kind),
    type: "button" as const,
  });

  return (
    <div className="xp">
      <div className="xp-mock">
        <div className="xp-topline">
          <span className="xp-arrow" aria-hidden>
            &#8592;
          </span>
          <span className="xp-topname">
            Account name
            <span className="xp-badge" aria-hidden />
          </span>
          <span className="xp-posts">96 posts</span>
        </div>

        <button {...spot("banner", "xp-banner")}>Banner</button>

        <div className="xp-avatar-row">
          <button {...spot("avatar", "xp-avatar")}>Avatar</button>
          <span className="xp-editbtn" aria-hidden>
            Edit profile
          </span>
        </div>

        <div className="xp-lines">
          <div className="xp-nameline">
            <span className="xp-name">Account name</span>
            <span className="xp-badge" aria-hidden />
            <button {...spot("name_suffix")}>Name suffix</button>
          </div>
          <span className="xp-handle">@handle</span>

          <button {...spot("bio_text", "xp-wide")}>Bio text</button>

          <div className="xp-meta">
            <button {...spot("location")}>Location</button>
            <button {...spot("bio_link")}>Bio link</button>
            <span className="xp-joined">Joined April 2026</span>
          </div>

          <div className="xp-counts">
            <span>
              <strong>110</strong> Following
            </span>
            <span>
              <strong>117</strong> Followers
            </span>
          </div>
        </div>

        <div className="xp-tabs" aria-hidden>
          <span className="on">Posts</span>
          <span>Replies</span>
          <span>Reposts</span>
          <span>Media</span>
        </div>

        <button {...spot("pinned_post", "xp-pinned")}>Pinned post</button>
      </div>

      {!picked && (
        <p className="muted small">
          {role === "advertiser"
            ? "Every highlighted area is for sale. Pick one to see who is renting it out."
            : "Every highlighted area is something you could rent out. Pick one to see what it takes."}
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

          {role === "creator" ? (
            <>
              <p className="muted small">
                Set your own price and your own calendar for this spot. Onboarding is
                manual for now: we check the account is yours, then your spot goes live.
              </p>
              <a className="primary" href={CALL_URL} target="_blank" rel="noreferrer">
                Book a call to list it
              </a>
            </>
          ) : (
            <>
              {offers === null && <p className="muted small">Loading…</p>}

              {offers?.length === 0 && (
                <p className="muted small">
                  Nobody is selling this spot yet. Join the waitlist and you get it
                  first.
                </p>
              )}

              {offers?.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  className="xp-offer"
                  onClick={() => setRequesting(offer)}
                >
                  <span>
                    <strong>@{offer.seller.x_handle}</strong>
                    <span className="muted small">
                      {" "}
                      {offer.seller.follower_count.toLocaleString("en-US")} followers
                      {offer.seller.is_org ? " · community" : ""}
                    </span>
                  </span>
                  <span className="xp-offer-right">
                    <span className="price">{formatUsd(offer.price_cents)}</span>
                    <span className="muted small"> / {offer.term_days}d</span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
