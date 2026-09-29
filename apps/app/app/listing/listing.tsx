"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd, hasOpened, isOpen, minBidCents } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import { loadBids, loadTopBids, type Bid } from "@/lib/auction";
import { loadListedThing, type ListedThing } from "@/lib/listing";
import { SellerLine } from "../reviews.tsx";
import { BidForm } from "../auction/bid.tsx";

/**
 * Торг вещи продавца.
 *
 * Тот же торг, что у футболки, - та же форма ставки, та же программа, - но
 * вещь показывается по-своему: снимками продавца с местами, которые он
 * разметил, а когда мы приложили модель и поставили на ней места, - ещё и
 * в 3D. Экран футболки не тронут намеренно: её торг живой, и менять его
 * ради чужих вещей значило бы рисковать им.
 */
export function ListingAuction({ thingId, onBack }: { thingId: string; onBack: () => void }) {
  const [thing, setThing] = useState<ListedThing | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tops, setTops] = useState<Record<string, Bid | undefined>>({});
  const [bids, setBids] = useState<Bid[]>([]);
  const [photo, setPhoto] = useState(0);
  const [look, setLook] = useState<"live" | "shot">("shot");
  const [art, setArt] = useState<Record<string, { url: string; file: File }>>({});
  const [artError, setArtError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const stage = useRef<Stage | null>(null);

  useEffect(() => {
    void loadListedThing(thingId).then((loaded) => {
      setThing(loaded);
      if (!loaded) return;
      if (loaded.shape) setLook("live");
      // С «Raise your bid» торг открывается сразу на том месте.
      const jump = window.sessionStorage.getItem("oxar.jump");
      window.sessionStorage.removeItem("oxar.jump");
      const first = loaded.spots.find((spot) => loaded.lots.some((lot) => lot.spot_code === spot.code));
      setPicked(
        loaded.spots.some((spot) => spot.code === jump) ? jump : (first?.code ?? loaded.spots[0]?.code ?? null),
      );
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [thingId]);

  const lots = thing?.lots ?? [];
  const lotOf = (code: string) => lots.find((lot) => lot.spot_code === code) ?? null;
  const lot = picked ? lotOf(picked) : null;

  useEffect(() => {
    if (lots.length === 0) return;
    void loadTopBids(lots.map((one) => one.id)).then(setTops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thing]);

  useEffect(() => {
    if (!lot) return setBids([]);
    let live = true;
    void loadBids(lot.id).then((rows) => live && setBids(rows));
    return () => {
      live = false;
    };
  }, [lot?.id]);

  // Логотипы лидеров и своя примерка - на модель, как у футболки.
  function dress() {
    if (!thing) return;
    for (const spot of thing.spots) {
      const one = lotOf(spot.code);
      const url = art[spot.code]?.url ?? (one ? tops[one.id]?.media_url : undefined);
      if (!url) continue;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => stage.current?.show(spot.code, image);
      image.src = url;
    }
  }
  useEffect(() => {
    if (look === "live") dress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tops, art, look]);

  function refresh() {
    if (lot) void loadBids(lot.id).then(setBids);
    void loadTopBids(lots.map((one) => one.id)).then(setTops);
  }

  async function tryOn(file: File | undefined) {
    setArtError("");
    if (!file || !picked) return;
    if (file.size > 8 * 1024 * 1024) {
      return setArtError("That file is over 8 MB. A logo should be far smaller.");
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch {
      URL.revokeObjectURL(url);
      return setArtError("Could not read that image. PNG, JPEG, WebP or SVG.");
    }
    setArt((was) => {
      const old = was[picked];
      if (old) URL.revokeObjectURL(old.url);
      return { ...was, [picked]: { url, file } };
    });
  }

  function takeOff() {
    if (!picked) return;
    stage.current?.show(picked, null);
    setArt((was) => {
      const old = was[picked];
      if (old) URL.revokeObjectURL(old.url);
      const next = { ...was };
      delete next[picked];
      return next;
    });
  }

  if (!thing) {
    return (
      <section className="lot">
        <button type="button" className="case-back" onClick={onBack}>
          &larr; Market
        </button>
      </section>
    );
  }

  const closesAt = lots.length ? Math.min(...lots.map((one) => Date.parse(one.closes_at))) : null;
  const opensAt = lots.length && lots.every((one) => one.opens_at)
    ? Math.min(...lots.map((one) => Date.parse(one.opens_at as string)))
    : null;
  const started = hasOpened(opensAt, now);
  const top = bids[0] ?? null;
  const need = lot ? minBidCents(lot.reserve_cents, top?.amount_cents ?? null, lot.min_step_cents) : 0;
  const running = lot ? started && isOpen(Date.parse(lot.closes_at), now) : false;
  const pot = lots.reduce((sum, one) => sum + (tops[one.id]?.amount_cents ?? 0), 0);
  const spotLabel = thing.spots.find((spot) => spot.code === picked)?.label ?? "";

  return (
    <section className="lot">
      <div className="lot-brandbar">
        <span className="mk-title">
          OXAR <span>Auction</span>
        </span>
        <button type="button" className="case-back" onClick={onBack}>
          &larr; Market
        </button>
      </div>

      <header className="lot-top">
        <div className="lot-title">
          {started && closesAt !== null && closesAt > now && (
            <span className="live-badge">
              <i aria-hidden />
              LIVE
            </span>
          )}
          {thing.seller && <SellerLine seller={thing.seller} house={false} />}
          <h1>{thing.title}</h1>
          {pot > 0 && (
            <p className="lot-pot">
              <strong>{formatUsd(pot)}</strong> bid so far
            </p>
          )}
        </div>
        <div className="lot-side">
          {started && closesAt !== null && (
            <div className="lot-cd">
              <span className="lot-cd-cap">Ends in</span>
              <span className="lot-cd-num" suppressHydrationWarning>
                {clock(closesAt - now)}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="lot-scene">
        {look === "live" && thing.shape ? (
          <div className="look">
            <ThingStage
              shape={thing.shape}
              picked={picked}
              onPick={(code) => setPicked(code)}
              stage={stage}
              onReady={dress}
            />
          </div>
        ) : (
          <div className="sl-photo ls-photo">
            {thing.photos[photo] && <img src={thing.photos[photo]} alt="" />}
            {photo === 0 &&
              thing.spots.map((spot, index) => {
                if (!spot.rect) return null;
                const one = lotOf(spot.code);
                const url = art[spot.code]?.url ?? (one ? tops[one.id]?.media_url : undefined);
                return (
                  <button
                    type="button"
                    key={spot.code}
                    className={spot.code === picked ? "sl-spot ls-spot on" : "sl-spot ls-spot"}
                    style={{
                      left: `${spot.rect.x * 100}%`,
                      top: `${spot.rect.y * 100}%`,
                      width: `${spot.rect.w * 100}%`,
                      height: `${spot.rect.h * 100}%`,
                    }}
                    aria-label={spot.label}
                    onClick={() => setPicked(spot.code)}
                  >
                    <i />
                    <i />
                    <i />
                    <i />
                    {url && <img src={url} alt="" />}
                    <b>{index + 1}</b>
                  </button>
                );
              })}
          </div>
        )}

        {thing.shape && (
          <div className="looks over-scene" role="group" aria-label="How to view">
            {([
              ["live", "3D"],
              ["shot", "Photo"],
            ] as const).map(([which, name]) => (
              <button
                key={which}
                type="button"
                className={look === which ? "look-tab on" : "look-tab"}
                aria-pressed={look === which}
                onClick={() => setLook(which)}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {look === "shot" && thing.photos.length > 1 && (
        <div className="angles">
          {thing.photos.map((url, index) => (
            <button
              type="button"
              key={url}
              className={index === photo ? "angle on" : "angle"}
              onClick={() => setPhoto(index)}
              aria-label={`Photo ${index + 1}`}
            >
              <img src={url} alt="" />
            </button>
          ))}
        </div>
      )}

      {lots.length > 0 && (
        <>
          <div className="pick-head">
            <span className="pick-title">Pick a spot</span>
            <span className="muted small">{thing.spots.length} spots</span>
          </div>
          <div className="pick-grid" role="group" aria-label="Spots with prices">
            {thing.spots.map((spot) => {
              const one = lotOf(spot.code);
              const holder = one ? tops[one.id] : undefined;
              return (
                <button
                  key={spot.code}
                  type="button"
                  className={spot.code === picked ? "pick-cell on" : "pick-cell"}
                  aria-pressed={spot.code === picked}
                  onClick={() => setPicked(spot.code)}
                >
                  <span className="pick-n">{spot.label}</span>
                  <span className="pick-price">
                    {one
                      ? holder
                        ? formatUsd(holder.amount_cents)
                        : `from ${formatUsd(one.reserve_cents)}`
                      : "-"}
                  </span>
                  <span className="pick-count">
                    {one ? holder?.brand || "No bids yet" : "not for sale"}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {lot && running && (
        <BidForm
          key={lot.id}
          lot={lot}
          need={need}
          spotLabel={spotLabel}
          topCents={top?.amount_cents ?? null}
          topBrand={top?.brand ?? ""}
          art={picked ? art[picked] : undefined}
          onPlaced={refresh}
        >
          <label className="art-row">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              hidden
              onChange={(event) => {
                void tryOn(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {picked && art[picked] ? (
              <>
                <img src={art[picked].url} alt="" />
                <span className="art-row-name">{art[picked].file.name}</span>
                <button
                  type="button"
                  className="art-row-drop"
                  onClick={(event) => {
                    event.preventDefault();
                    takeOff();
                  }}
                >
                  Remove
                </button>
              </>
            ) : (
              <>
                <span className="art-row-name">Upload artwork</span>
                <span className="art-row-hint">PNG, JPG, SVG or WebP</span>
              </>
            )}
          </label>
          {artError ? (
            <p className="bad">{artError}</p>
          ) : (
            picked &&
            art[picked] && (
              <p className="muted small">Only you can see this. It goes public when you bid with it.</p>
            )
          )}
        </BidForm>
      )}

      {!started && opensAt !== null && (
        <p className="lot-state">
          <strong>Bidding opens {new Date(opensAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</strong>
        </p>
      )}

      {bids.length > 0 && (
        <div className="lot-bids">
          <p className="list-head">
            Bids on {spotLabel}
            <span>{bids.length === 1 ? "1 bid" : `${bids.length} bids`}</span>
          </p>
          {bids.map((bid, index) => (
            <div key={bid.id} className="bid-row">
              <img className="bid-row-art" src={bid.media_url} alt="" />
              <span className="bid-row-who">
                <span>{bid.brand}</span>
                <em>
                  <span className="mono">{`${bid.bidder_wallet.slice(0, 4)}..${bid.bidder_wallet.slice(-4)}`}</span>
                  {" · "}
                  {ago(bid.created_at, now)}
                </em>
              </span>
              <span className={index === 0 ? "tagchip red" : "tagchip"}>
                {index === 0 ? "LEADING" : "REFUNDED"}
              </span>
              <span className="bid-row-amt">{formatUsd(bid.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${time}` : time;
}

function ago(at: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
