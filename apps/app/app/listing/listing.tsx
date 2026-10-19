"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd, hasOpened, isOpen, minBidCents, shortWallet } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import { loadBids, loadTopBids, type Bid } from "@/lib/auction";
import { loadListedThing, type ListedThing } from "@/lib/listing";
import { SellerLine } from "../reviews.tsx";
import { SoonHologram } from "../soon.tsx";
import { SpotInside, spotBox } from "../seller/parts.tsx";
import { BidForm } from "../auction/bid.tsx";
import { ShareAuction, ShareBid } from "../auction/share.tsx";
import { TIE } from "@oxar/stage";
import { useConnectedStandardWallets } from "@privy-io/react-auth/solana";
import { useAdmin } from "../admin/use-admin.ts";
import { WornInfo } from "../worn.tsx";

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
  const { wallets } = useConnectedStandardWallets();
  const admin = useAdmin();
  // Админ до открытия смотрит вещь как есть: голограмма - для всех остальных.
  const [peek, setPeek] = useState(false);
  // Снимок модели вместо фото: у нашей вещи без снимков фото-режим
  // показывает её саму, снятую сценой при переключении.
  const [still, setStill] = useState<string | null>(null);
  // Сумма только что прошедшей ставки: под формой - поделиться ею в X.
  // Другое место - другая ставка, прежняя карточка уходит.
  const [shared, setShared] = useState<{ cents: number; brand: string; mine: boolean } | null>(null);
  useEffect(() => setShared(null), [picked]);

  useEffect(() => {
    void loadListedThing(thingId).then((loaded) => {
      setThing(loaded);
      if (!loaded) return;
      if (loaded.shape || loaded.model) setLook("live");
      // С «Raise your bid» торг открывается сразу на том месте.
      // Снимаем метку, только если место наше: на вкладке Auction рядом
      // грузится торг футболки, и метка могла прийти к нему.
      const jump = window.sessionStorage.getItem("oxar.jump");
      const mine = loaded.spots.some((spot) => spot.code === jump);
      if (mine) window.sessionStorage.removeItem("oxar.jump");
      const first = loaded.spots.find((spot) => loaded.lots.some((lot) => lot.spot_code === spot.code));
      setPicked(mine ? jump : (first?.code ?? loaded.spots[0]?.code ?? null));
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [thingId]);

  // Выбрали место - показываем снимок, на котором оно размечено.
  useEffect(() => {
    const spot = thing?.spots.find((one) => one.code === picked);
    if (spot) setPhoto(spot.photo);
  }, [picked, thing]);

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
  // Пока места подготовленной вещи - черновики, публике их не видно, и дата
  // открытия берётся с самой вещи.
  const opensAt = lots.length && lots.every((one) => one.opens_at)
    ? Math.min(...lots.map((one) => Date.parse(one.opens_at as string)))
    : lots.length === 0 && thing.opensAt
      ? Date.parse(thing.opensAt)
      : null;
  const started = hasOpened(opensAt, now);
  const soon = (lots.length > 0 || thing.prepared) && !started;
  // Наша или подготовленная нами вещь: до открытия - голограмма её модели, а
  // не знак вопроса. Признаки - флаги из базы, их ставим только мы; по адресу
  // модели судить нельзя - его можно подделать.
  const ours = thing.house || thing.prepared;
  // Сцена и без разметки мест: модель видна, выбирать на ней пока нечего.
  const scene = thing.shape ?? (thing.model ? { model: thing.model, spots: [], depth: 0.05, cloth: false, noun: "thing" } : null);
  const ghost = soon && !(admin && peek);
  const top = bids[0] ?? null;
  const need = lot ? minBidCents(lot.reserve_cents, top?.amount_cents ?? null, lot.min_step_cents) : 0;
  const running = lot ? started && isOpen(Date.parse(lot.closes_at), now) : false;
  // Мой кошелёк ведёт на этом месте - значит, есть чем поделиться.
  const leading = Boolean(lot && running && top && wallets[0] && top.bidder_wallet === wallets[0].address);
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
          {thing.seller && <SellerLine seller={thing.seller} house={ours} />}
          <h1>{thing.title}</h1>
          {pot > 0 && (
            <p className="lot-pot">
              <strong>{formatUsd(pot)}</strong> bid so far
            </p>
          )}
          <ShareAuction thingId={thingId} />
        </div>
        <div className="lot-side">
          {!started && opensAt !== null && (
            <div className="lot-cd">
              <span className="lot-cd-cap">Opens in</span>
              <span className="lot-cd-num" suppressHydrationWarning>
                {clock(opensAt - now)}
              </span>
            </div>
          )}
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
        {/* Торг назначен, но ещё не открылся - голограмма: у нашей вещи её
            модель, у вещи продавца знак вопроса. Подложка светлая, как на
            экране между торгами: тёмный прямоугольник на светлой странице
            читался дырой. */}
        {ghost ? (
          <div className="look between-scene">
            <SoonHologram model={ours ? (thing.hologram ?? scene?.model) : null} />
          </div>
        ) : look === "live" && scene ? (
          <div className="look">
            <ThingStage
              shape={scene}
              picked={picked}
              onPick={(code) => setPicked(code)}
              stage={stage}
              onReady={dress}
            />
          </div>
        ) : (
          // Снимки без разметки мест - целиком, без кадра 4:5: обрезать их
          // незачем, места на них не стоят.
          <div className={thing.photos.length > 0 && !thing.spots.some((spot) => spot.rect) ? "sl-photo ls-photo loose" : "sl-photo ls-photo"}>
            {thing.photos[photo] && <img src={thing.photos[photo]} alt="" />}
            {thing.photos.length === 0 && still && <img className="ls-still" src={still} alt="" />}
            {thing.photos.length === 0 && thing.spots.length === 1 && (
              // Место у вещи одно и занимает её целиком: выбрать - нажать на вещь.
              <button
                type="button"
                className="ls-still-pick"
                aria-label={thing.spots[0]!.label}
                onClick={() => setPicked(thing.spots[0]!.code)}
              />
            )}
            {thing.spots.map((spot, index) => {
                // Каждое место - на своём снимке.
                if (!spot.rect || spot.photo !== photo) return null;
                const one = lotOf(spot.code);
                const url = art[spot.code]?.url ?? (one ? tops[one.id]?.media_url : undefined);
                return (
                  <button
                    type="button"
                    key={spot.code}
                    className={[
                      "sl-spot ls-spot",
                      spot.outline ? "shaped" : "",
                      spot.code === picked ? "on" : "",
                    ].join(" ")}
                    style={spotBox(spot.rect)}
                    aria-label={spot.label}
                    onClick={() => setPicked(spot.code)}
                  >
                    <SpotInside rect={spot.rect} outline={spot.outline} number={index + 1} art={url} />
                  </button>
                );
              })}
          </div>
        )}

        {scene && (!soon || admin) && (
          <div className="looks over-scene" role="group" aria-label="How to view">
            {/* До открытия админ переключает голограмму и вещь как есть. */}
            {soon && (
              <button
                type="button"
                className={ghost ? "look-tab on" : "look-tab"}
                aria-pressed={ghost}
                onClick={() => setPeek(false)}
              >
                Hologram
              </button>
            )}
            {([
              ["live", "3D"],
              ["shot", "Photo"],
            ] as const).map(([which, name]) => (
              <button
                key={which}
                type="button"
                className={!ghost && look === which ? "look-tab on" : "look-tab"}
                aria-pressed={!ghost && look === which}
                onClick={() => {
                  setPeek(true);
                  // Своих снимков нет - снимаем модель, пока сцена ещё на экране.
                  if (which === "shot" && thing.photos.length === 0) {
                    const azimuth = thing.shape?.spots.find((spot) => spot.code === picked)?.azimuth ?? 0;
                    setStill(stage.current?.snapshot(Math.round(azimuth / 90) * 90)?.toDataURL("image/png") ?? null);
                  }
                  setLook(which);
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {look === "shot" && !ghost && thing.photos.length > 1 && (
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

      {/* Кто носит вещь, где, когда и срок пруфа - до выбора места: деньги
          победителя держит программа до пруфа, и этот срок покупатель видит
          прежде, чем ставит. */}
      <WornInfo thingId={thingId} />

      {/* До открытия мест не показываем: выбирать и ставить ещё нечего, а
          сетка с ценами обещала торг, который не идёт. */}
      {started && lots.length > 0 && (
        <>
          <div className="pick-head">
            <span className="pick-title">Pick a spot</span>
            <span className="muted small">{thing.spots.length === 1 ? "1 spot" : `${thing.spots.length} spots`}</span>
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
          onPlaced={(bid) => {
            refresh();
            setShared({ cents: bid.cents, brand: bid.brand, mine: true });
          }}
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

      {shared !== null && (
        <ShareBid
          thingId={thingId}
          stage={stage}
          azimuth={Math.round((thing.shape?.spots.find((spot) => spot.code === picked)?.azimuth ?? 0) / 90) * 90}
          title={thing.title}
          spot={thing.spots.length > 1 ? spotLabel : undefined}
          cents={shared.cents}
          mine={shared.mine}
          brand={shared.brand}
          broadcast={thing.shape?.model === TIE.model}
          onClose={() => setShared(null)}
        />
      )}

      {/* Лидируешь - можешь поделиться и потом, а не только сразу после
          ставки: вернулся на страницу, а кнопка на месте. Перебили - пропала.
          Админ делится ставкой лидера от имени площадки, не от первого лица. */}
      {shared === null && (leading || (admin && running)) && top && (
        <button
          type="button"
          className="sl-btn light share-lead"
          onClick={() => setShared({ cents: top.amount_cents, brand: top.brand ?? "", mine: leading })}
        >
          {leading ? "Share your lead" : "Share the lead"}
        </button>
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
                  <span className="mono">{shortWallet(bid.bidder_wallet)}</span>
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
