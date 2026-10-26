"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd, hasOpened, isOpen, minBidCents, shortWallet } from "@oxar/core";
import { ThingStage, type Corners, type Stage, type Views } from "@oxar/stage";
import { loadBids, loadFeed, loadTopBids, type Bid } from "@/lib/auction";
import { loadListedThing, type ListedThing } from "@/lib/listing";
import { SellerLine } from "../reviews.tsx";
import { SoonHologram } from "../soon.tsx";
import { SpotInside, spotBox } from "../seller/parts.tsx";
import { BidForm } from "../auction/bid.tsx";
import { PhotoView } from "../auction/photo.tsx";
import { ShareAuction, ShareBid } from "../auction/share.tsx";
import { Notify } from "../notify-me.tsx";
import { TIE } from "@oxar/stage";
import { useConnectedStandardWallets } from "@privy-io/react-auth/solana";
import { useAdmin } from "../admin/use-admin.ts";
import { WornInfo } from "../worn.tsx";
import { Stickers } from "./stickers.tsx";
import type { PaidSticker } from "@/lib/stickers";

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
  // На широком экране правая карточка - в два шага, как в конфигураторе:
  // список мест, а выбрал место - форма ставки на него, без прокрутки.
  // На телефоне видно и то, и другое одной колонкой.
  const [choosing, setChoosing] = useState(true);
  function choose(code: string) {
    setPicked(code);
    setChoosing(false);
  }
  const [tops, setTops] = useState<Record<string, Bid | undefined>>({});
  const [bids, setBids] = useState<Bid[]>([]);
  // Общая лента: все ставки на все места, чтобы было видно, где идёт торг,
  // а не только историю выбранного места.
  const [feed, setFeed] = useState<Bid[]>([]);
  const [feedOf, setFeedOf] = useState<"all" | "spot">("all");
  const [photo, setPhoto] = useState(0);
  // Какой ракурс вещи сейчас перед зрителем: для полоски ракурсов и кнопки
  // поворота.
  const [angle, setAngle] = useState(0);
  const [look, setLook] = useState<"live" | "shot">("shot");
  const [art, setArt] = useState<Record<string, { url: string; file: File }>>({});
  const [artError, setArtError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const stage = useRef<Stage | null>(null);
  const { wallets } = useConnectedStandardWallets();
  const admin = useAdmin();
  // Админ до открытия смотрит вещь как есть: голограмма - для всех остальных.
  const [peek, setPeek] = useState(false);
  // Ракурсы модели, снятые сценой: у вещи без своих снимков фото-режим
  // показывает их, и места на них нажимаются - как у футболки.
  const [views, setViews] = useState<Views>({ shots: [], quads: [] });
  // Купленные стикеры: сцена клеит их на вещь, когда соберётся.
  const [stuck, setStuck] = useState<PaidSticker[]>([]);
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
    void loadFeed(lots.map((one) => one.id)).then(setFeed);
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
      // CORS - только логотипам из хранилища. Своя примерка - blob-ссылка, и
      // Safari на iPhone с crossOrigin на ней картинку не грузил: на телефоне
      // загруженное фото на вещи не появлялось.
      if (!url.startsWith("blob:")) image.crossOrigin = "anonymous";
      image.onload = () => stage.current?.show(spot.code, image);
      image.src = url;
    }
  }
  useEffect(() => {
    if (look === "live") dress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tops, art, look]);

  // Стикеры - на вещь, когда сцена собралась (тогда приходят и ракурсы).
  // Каждый стикер покупки - отдельная наклейка: купил три - три на бампере.
  useEffect(() => {
    if (views.shots.length === 0 || stuck.length === 0) return;
    let live = true;
    const units = stuck.flatMap((one) => Array.from({ length: one.count }, () => one));
    void Promise.all(
      units.map(
        (one) =>
          new Promise<{ image: HTMLImageElement; size: [number, number] } | null>((done) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => done({ image, size: one.size === "12x6" ? [12, 6] : [10, 10] });
            image.onerror = () => done(null);
            image.src = one.logoUrl;
          }),
      ),
    ).then((loaded) => {
      // Не загрузившийся логотип оставляет свою ячейку пустой, а не сдвигает
      // остальных: у каждого стикера своё место на бампере.
      if (live) stage.current?.stickers(loaded);
    });
    return () => {
      live = false;
    };
  }, [stuck, views]);

  function refresh() {
    if (lot) void loadBids(lot.id).then(setBids);
    void loadTopBids(lots.map((one) => one.id)).then(setTops);
    void loadFeed(lots.map((one) => one.id)).then(setFeed);
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
  // Что лежит в месте на фото: своя примерка или креатив лидера.
  const shownArt = Object.fromEntries(
    thing.spots.map((spot) => {
      const one = lotOf(spot.code);
      return [spot.code, art[spot.code]?.url ?? (one ? tops[one.id]?.media_url : undefined)];
    }),
  );

  // Колонка ставок - пока идёт торг: до открытия ставить некуда, и пустая
  // колонка слева только сдвигала бы вещь.
  const showBids = started && lots.length > 0;

  return (
    <section className="lot">
      <div className="lot-brandbar">
        <span className="mk-title">
          OXAR <span>Auction</span>
        </span>
      </div>

      <header className="lot-top">
        <div className="lot-title">
          <button type="button" className="case-back" onClick={onBack}>
            &larr; Market
          </button>
          {thing.seller && <SellerLine seller={thing.seller} house={ours} />}
          <h1>{thing.title}</h1>
          {/* Сумма и «поделиться» - одной строкой: столбиком угол был
              перегружен. LIVE переехал к часам - он про время торга. */}
          <div className="lot-meta">
            {pot > 0 && (
              <p className="lot-pot">
                <strong>{formatUsd(pot)}</strong> bid so far
              </p>
            )}
            <ShareAuction thingId={thingId} />
          </div>
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
              {closesAt > now ? (
                <span className="lot-cd-live">
                  <span className="live-badge">
                    <i aria-hidden />
                    LIVE
                  </span>
                  Auction ends in
                </span>
              ) : (
                <span className="lot-cd-cap">Auction ended</span>
              )}
              <span className="lot-cd-num" suppressHydrationWarning>
                {clock(closesAt - now)}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* На широком экране три колонки: живые ставки слева, вещь по центру,
          места и ставка справа - всё на одном экране, без прокрутки вниз к
          истории. На телефоне одна колонка в порядке разметки: вещь, ставка,
          история. */}
      <div className={showBids ? "lot-body" : "lot-body two"}>
      <div className="lot-center">
      <div className="lot-scene">
        {/* Торг назначен, но ещё не открылся - голограмма: у нашей вещи её
            модель, у вещи продавца знак вопроса. Подложка светлая, как на
            экране между торгами: тёмный прямоугольник на светлой странице
            читался дырой. */}
        {ghost ? (
          <div className="look between-scene">
            <SoonHologram model={ours ? (thing.hologram ?? scene?.model) : null} />
          </div>
        ) : scene && (look === "live" || thing.photos.length === 0) ? (
          <>
            {/* Сцена остаётся собранной и в фото-режиме, только спрятана: у
                вещи без своих снимков её ракурсы и есть фото. */}
            <div className={look === "live" ? "look" : "look away"}>
              <ThingStage
                shape={scene}
                picked={picked}
                onPick={choose}
                stage={stage}
                onReady={(ready) => {
                  setViews(ready);
                  dress();
                }}
              />
            </div>
            {look === "shot" && views.shots[photo] && (
              <div className="ls-shots">
                <PhotoView
                  shot={views.shots[photo]!}
                  quads={views.quads[photo] ?? {}}
                  picked={picked ?? ""}
                  onPick={choose}
                  art={shownArt}
                  spots={scene.spots}
                />
              </div>
            )}
          </>
        ) : (
          // Снимки без разметки мест - целиком, без кадра 4:5: обрезать их
          // незачем, места на них не стоят.
          <div className={thing.photos.length > 0 && !thing.spots.some((spot) => spot.rect) ? "sl-photo ls-photo loose" : "sl-photo ls-photo"}>
            {thing.photos[photo] && <img src={thing.photos[photo]} alt="" />}
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

        {/* Правило одно на все вещи: до открытия - голограмма, а админ
            переключает её на 3D и фото, если они у вещи есть. */}
        {/* Кнопки сцены: во весь экран и повернуть вещь на четверть. */}
        {scene && !ghost && look === "live" && (
          <div className="scene-tools">
            <button
              type="button"
              className="scene-tool"
              aria-label="Full screen"
              onClick={(event) => {
                const box = (event.currentTarget.closest(".lot-scene") as HTMLElement | null) ?? null;
                if (!box) return;
                if (document.fullscreenElement) void document.exitFullscreen();
                else void box.requestFullscreen?.();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
            <button
              type="button"
              className="scene-tool"
              aria-label="Turn"
              onClick={() => {
                const next = (angle + 1) % 4;
                setAngle(next);
                stage.current?.face(next * 90);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden>
                <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
              </svg>
            </button>
          </div>
        )}
        {/* Ракурсы под вещью - снимки самой сцены; нажатие поворачивает вещь
            или листает фото. */}
        {scene && !ghost && thing.photos.length === 0 && views.shots.length > 1 && (
          <div className="scene-angles" role="group" aria-label="Angles">
            {views.shots.map((url, index) => (
              <button
                type="button"
                key={index}
                className={(look === "live" ? angle : photo) === index ? "scene-angle on" : "scene-angle"}
                aria-label={`Angle ${index + 1}`}
                onClick={() => {
                  setAngle(index);
                  setPhoto(index);
                  if (look === "live") stage.current?.face(index * 90);
                }}
              >
                <img src={url} alt="" />
              </button>
            ))}
          </div>
        )}
        {(scene || thing.photos.length > 0) && (!soon || admin) && (
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
            {(scene ? (["live", "shot"] as const) : (["shot"] as const)).map((which) => (
              <button
                key={which}
                type="button"
                className={!ghost && look === which ? "look-tab on" : "look-tab"}
                aria-pressed={!ghost && look === which}
                onClick={() => {
                  setPeek(true);
                  setLook(which);
                }}
              >
                {which === "live" ? "3D" : "Photo"}
              </button>
            ))}
          </div>
        )}
      </div>

      {look === "shot" && !ghost && thing.photos.length > 1 && (
        <div className="angles">
          {(thing.photos.length ? thing.photos : views.shots).map((url, index) => (
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

      </div>

      <div className={choosing ? "lot-right choosing" : "lot-right chosen"}>
      {lot && running && (
        <button type="button" className="spot-back" onClick={() => setChoosing(true)}>
          &larr; All spots
        </button>
      )}
      {lot && running && picked && (
        <>
          <div className="spot-card">
            <SpotThumb views={views} code={picked} width={64} height={48} />
            <span className="spot-card-text">
              <b>{spotLabel}</b>
              <span>{thing.title}</span>
            </span>
            <span className={top ? "spot-chip lead" : "spot-chip"}>
              {top ? `Leading ${formatUsd(top.amount_cents)}` : `Reserve ${formatUsd(lot.reserve_cents)}`}
            </span>
          </div>
          <SpotPreview views={views} code={picked} />
        </>
      )}
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
                  onClick={() => choose(spot.code)}
                >
                  <SpotThumb views={views} code={spot.code} width={48} height={38} />
                  <span className="pick-n">{spot.label}</span>
                  <span className="pick-price">
                    {/* Цена места - сколько поставить сейчас: старт, пока
                        ставок нет, и следующая ставка, когда есть лидер. Логотип
                        лидера у цены убран: его и так видно на самой вещи. */}
                    {one ? (
                      <>
                        <span className="pick-from">from</span>{" "}
                        {formatUsd(minBidCents(one.reserve_cents, holder?.amount_cents ?? null, one.min_step_cents))}
                      </>
                    ) : (
                      "-"
                    )}
                  </span>
                  <span className="pick-count">
                    {one ? holder?.brand || "No bids yet" : "not for sale"}
                  </span>
                  <span className="pick-go" aria-hidden>
                    ›
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

      {/* До открытия правая колонка - не пустая: когда открывается, какие
          места пойдут с торгов, как это работает и письмо на открытие. */}
      {!started && opensAt !== null && (
        <div className="pre-open">
          <div className="pre-open-head">
            <span className="pre-open-icon" aria-hidden>
              <svg viewBox="0 0 24 24">
                <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
                <path d="M3.5 10h17M8 3v4M16 3v4" />
              </svg>
            </span>
            <span>
              <span className="pre-open-cap">Bidding opens</span>
              <b suppressHydrationWarning>
                {new Date(opensAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </b>
              <span className="pre-open-utc" suppressHydrationWarning>
                {new Date(opensAt).toLocaleString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" })} UTC
              </span>
            </span>
          </div>

          <div className="pre-open-spots">
            <span className="pre-open-label">
              {thing.spots.length} {thing.spots.length === 1 ? "spot goes" : "spots go"} to auction
            </span>
            <div className="pre-open-chips">
              {thing.spots.map((spot) => (
                <span key={spot.code}>{spot.label}</span>
              ))}
            </div>
          </div>

          <ol className="pre-open-steps">
            <li>Pick a spot and bid in USDC on Solana.</li>
            <li>Outbid? Your USDC comes back in the same transaction.</li>
            <li>The highest bid at the close puts its logo on the thing.</li>
          </ol>

          <div className="pre-open-notify">
            <Notify note="One email when bidding opens. No newsletter." />
          </div>
        </div>
      )}

      {/* Стикеры - не торг: показываем, когда вещь открыта, а не голограмма. */}
      {thing.stickerSheet && !ghost && <Stickers thingId={thingId} sheetId={thing.stickerSheet} onPaid={setStuck} />}
      </div>

      {showBids && (
        <div className="lot-left lot-bids">
          <div className="feed-head" role="tablist" aria-label="Which bids">
            <button
              type="button"
              role="tab"
              aria-selected={feedOf === "all"}
              className={feedOf === "all" ? "feed-tab on" : "feed-tab"}
              onClick={() => setFeedOf("all")}
            >
              All bids
            </button>
            {picked && (
              <button
                type="button"
                role="tab"
                aria-selected={feedOf === "spot"}
                className={feedOf === "spot" ? "feed-tab on" : "feed-tab"}
                onClick={() => setFeedOf("spot")}
              >
                {spotLabel}
              </button>
            )}
            <span className="feed-count">
              {(feedOf === "all" ? feed : bids).length} {(feedOf === "all" ? feed : bids).length === 1 ? "bid" : "bids"}
            </span>
          </div>
          <div className="feed-list">
            {feedOf === "all" ? (
              <>
                {feed.length === 0 && <p className="muted small">No bids yet. The first one at the starting price leads.</p>}
                {feed.map((bid) => {
                  const where = lots.find((one) => one.id === bid.lot_id);
                  const spot = thing.spots.find((one) => one.code === where?.spot_code);
                  const leads = tops[bid.lot_id]?.id === bid.id;
                  return (
                    <button
                      type="button"
                      key={bid.id}
                      className="bid-row"
                      onClick={() => spot && choose(spot.code)}
                    >
                      <img className="bid-row-art" src={bid.media_url} alt="" />
                      <span className="bid-row-who">
                        <span>{bid.brand}</span>
                        <em>
                          {spot?.label ?? "Spot"}
                          {" · "}
                          {ago(bid.created_at, now)}
                        </em>
                      </span>
                      <span className={leads ? "tagchip red" : "tagchip"}>{leads ? "LEADING" : "OUTBID"}</span>
                      <span className="bid-row-amt">{formatUsd(bid.amount_cents)}</span>
                    </button>
                  );
                })}
              </>
            ) : (
              <>
                {bids.length === 0 && <p className="muted small">No bids yet. The first one at the starting price leads.</p>}
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
              </>
            )}
          </div>
        </div>
      )}
      {/* Кто носит вещь, где, когда и срок пруфа - до выбора места: деньги
          победителя держит программа до пруфа, и этот срок покупатель видит
          прежде, чем ставит. На широком экране - под всеми тремя колонками,
          на телефоне - сразу под вещью. */}
      <div className="lot-info">
        <WornInfo thingId={thingId} />
      </div>
      </div>
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

/** Снимок, где место видно крупнее всего, и его углы на нём (доли). */
function bestShot(views: Views, code: string) {
  let best: { shot: string; quad: Corners; box: [number, number, number, number]; area: number } | null = null;
  views.quads.forEach((quads, at) => {
    const quad: Corners | null | undefined = quads[code];
    const shot = views.shots[at];
    if (!quad || !shot) return;
    const xs = quad.map(([x]) => x);
    const ys = quad.map(([, y]) => y);
    const box: [number, number, number, number] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const area = (box[2] - box[0]) * (box[3] - box[1]);
    if (!best || area > best.area) best = { shot, quad, box, area };
  });
  return best as { shot: string; quad: Corners; box: [number, number, number, number]; area: number } | null;
}

/** Пропорции снимка: у длинной вещи он широкий, у остальных квадратный. */
function useShotRatio(shot: string | undefined) {
  const [ratio, setRatio] = useState<number | null>(null);
  useEffect(() => {
    if (!shot) return;
    let live = true;
    const image = new Image();
    image.onload = () => live && image.naturalHeight > 0 && setRatio(image.naturalWidth / image.naturalHeight);
    image.src = shot;
    return () => {
      live = false;
    };
  }, [shot]);
  return ratio;
}

/**
 * Миниатюра места - кусок снимка самой вещи, где это место видно крупнее
 * всего. Не отдельная картинка: снимки и углы мест на них уже сняла сцена, и
 * миниатюра совпадает с вещью по определению. Пока снимков нет - пустая
 * плашка того же размера, строка не прыгает.
 */
function SpotThumb({ views, code, width = 44, height = 34 }: { views: Views; code: string; width?: number; height?: number }) {
  const found = bestShot(views, code);
  const ratio = useShotRatio(found?.shot);
  if (!found || !ratio) return <span className="pick-thumb" style={{ width, height }} aria-hidden />;
  const { shot, box } = found;
  // Между «вписать» и «заполнить»: деталь крупно, но с краем вещи вокруг -
  // по нему и узнаётся, что это за деталь.
  const pad = 0.06;
  const w = (box[2] - box[0]) * (1 + pad * 2);
  const h = (box[3] - box[1]) * (1 + pad * 2);
  const scale = Math.sqrt((width / (w * ratio)) * (height / h));
  const imgW = ratio * scale;
  const imgH = scale;
  const cx = ((box[0] + box[2]) / 2) * imgW;
  const cy = ((box[1] + box[3]) / 2) * imgH;
  // Кусок снимка - в долях плашки, а не в точках: сетка мест на телефоне
  // растягивает плашку на ширину карточки, и кусок растёт вместе с ней.
  const pct = (part: number, whole: number) => `${(part / whole) * 100}%`;
  return (
    <span className="pick-thumb" style={{ width, height }} aria-hidden>
      <img
        src={shot}
        alt=""
        style={{ width: pct(imgW, width), height: pct(imgH, height), left: pct(width / 2 - cx, width), top: pct(height / 2 - cy, height) }}
      />
    </span>
  );
}

/** Снимок вещи с выбранным местом, обведённым цветом выбора. */
function SpotPreview({ views, code }: { views: Views; code: string }) {
  const found = bestShot(views, code);
  // Оклейку сцена сняла отдельным кадром, уже подсвеченной: обводка по углам
  // коробки огибающую панель не повторяет.
  const marked = views.marked?.[code];
  const ratio = useShotRatio(marked ?? found?.shot);
  if (!found || !ratio) return null;
  return (
    <div className="spot-preview" aria-hidden>
      <div className="spot-preview-frame" style={{ aspectRatio: String(ratio) }}>
        <img src={marked ?? found.shot} alt="" />
        {!marked && (
          <svg viewBox="0 0 1 1" preserveAspectRatio="none">
            <polygon points={found.quad.map(([x, y]) => `${x},${y}`).join(" ")} />
          </svg>
        )}
      </div>
    </div>
  );
}
