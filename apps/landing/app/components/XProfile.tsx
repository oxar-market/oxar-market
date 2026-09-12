"use client";

import { useEffect, useState } from "react";
import { formatUsd, placementSpec, type PlacementKind } from "@oxar/core";
import { offersFor, type Offer } from "@/lib/listings";
import { RequestPlacement } from "./RequestPlacement";
import {
  ArrowLeft,
  Calendar,
  Dots,
  Envelope,
  Heart,
  LinkIcon,
  Pin,
  Reply,
  Repost,
  Share,
  Verified,
} from "./icons";

/**
 * Макет профиля X, собранный по настоящей странице: шапка с именем и числом
 * постов в две строки, баннер, круглая аватарка внахлёст с белой обводкой,
 * кнопки справа, имя с галочкой, хэндл, био, строка со ссылкой, локацией и
 * датой, счётчики, табы и пост под ними.
 *
 * Узнаваемость тут и есть смысл: человек видит свой профиль и понимает, что
 * именно продаётся, без единого слова объяснений.
 *
 * Что показывать под выбранным местом, зависит от роли. Покупателю - кто это
 * место сдаёт и по какой цене. Продавцу чужие предложения не нужны: ему нужно
 * выставить своё, а это у нас идёт через живой разговор.
 */

const CALL_URL = "https://calendly.com/daniel-l-oxar";

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
    title: `${placementSpec(kind).label} - for sale`,
  });

  return (
    <div className="xp">
      <div className="xp-mock">
        <div className="xp-topline">
          <ArrowLeft className="xp-arrow" />
          <span className="xp-topstack">
            <span className="xp-topname">
              Account name
              <Verified className="xp-badge" />
            </span>
            <span className="xp-posts">96 posts</span>
          </span>
        </div>

        <button {...spot("banner", "xp-banner")}>Banner</button>

        <div className="xp-avatar-row">
          <button {...spot("avatar", "xp-avatar")}>Avatar</button>
          <span className="xp-actions" aria-hidden>
            <span className="xp-round">
              <Dots />
            </span>
            <span className="xp-round">
              <Envelope />
            </span>
            <span className="xp-follow">Follow</span>
          </span>
        </div>

        <div className="xp-lines">
          <div className="xp-nameline">
            <span className="xp-name">Account name</span>
            <Verified className="xp-badge" />
            <button {...spot("name_suffix")}>Name suffix</button>
          </div>
          <span className="xp-handle">@handle</span>

          <button {...spot("bio_text", "xp-wide")}>Bio text</button>

          <div className="xp-meta">
            <span className="xp-meta-item">
              <LinkIcon className="xp-ico" />
              <button {...spot("bio_link")}>Bio link</button>
            </span>
            <span className="xp-meta-item">
              <Pin className="xp-ico" />
              <button {...spot("location")}>Location</button>
            </span>
            <span className="xp-meta-item xp-joined">
              <Calendar className="xp-ico" />
              Joined April 2026
            </span>
          </div>

          <div className="xp-counts">
            <span>
              <strong>2,191</strong> Following
            </span>
            <span>
              <strong>984K</strong> Followers
            </span>
          </div>
        </div>

        <div className="xp-tabs" aria-hidden>
          <span className="on">Posts</span>
          <span>Replies</span>
          <span>Media</span>
          <span>Likes</span>
        </div>

        <div className="xp-post">
          <span className="xp-post-avatar" aria-hidden />
          <div className="xp-post-body">
            <span className="xp-post-head" aria-hidden>
              <strong>Account name</strong> @handle · 22h
            </span>
            <button {...spot("pinned_post", "xp-pinned")}>Pinned post</button>
            <span className="xp-post-actions" aria-hidden>
              <span>
                <Reply className="xp-ico" />
                76
              </span>
              <span>
                <Repost className="xp-ico" />
                59
              </span>
              <span>
                <Heart className="xp-ico" />
                159
              </span>
              <span>
                <Share className="xp-ico" />
              </span>
            </span>
          </div>
        </div>
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
