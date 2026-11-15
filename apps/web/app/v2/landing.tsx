"use client";

import { useEffect, useRef, useState } from "react";
import { APP_URL, FOLLOW, NEXT, day, load, usd, type Data } from "./data.ts";
import { Flow } from "./flow.tsx";
import { AuctionCard, NextCard } from "./cards.tsx";
import { useViews } from "./spots.tsx";

/**
 * Прототип лендинга в духе frontiertraders.com, на нашем материале: герой
 * выбирается по состоянию торгов, торги - карточками-кампаниями с логотипом
 * хозяина вещи и табличкой цифр, деньги объяснены тремя карточками, а не
 * схемой. Живёт на /v2 и в прод не ссылается.
 */

/**
 * Охват: просмотры эфиров и постов с логотипами, сумма по всем торгам.
 * Цифру дал Даниил, посчитанной разбивки по источникам пока нет.
 */
const REACH = "98K+";

/** Ролик вещи для первого экрана. Без ролика герой остаётся на подложке. */
const VIDEOS: Record<string, { src: string; poster: string }> = {
  "the-van": { src: "/v2/van-loop.mp4", poster: "/v2/van-poster.jpg" },
};

/**
 * Самые громкие компании, что ставили на наших торгах. Логотипы с их сайтов,
 * а не картинки со ставок: на ставке бывает QR-код и подпись ивента. У Jupiter
 * на сайте значок плюс набранное слово - так и показываем. У Ecosystem Call
 * отдельного знака нет вовсе, их логотип - набор названия, поэтому только
 * слово. Высота в rem подобрана на глаз, чтобы никто не кричал громче соседей.
 */
const BRANDS: { name: string; src?: string; height?: number; word?: boolean }[] = [
  { name: "Jupiter", src: "/v2/brands/jupiter.svg", height: 1.5, word: true },
  { name: "Bitrefill", src: "/v2/brands/bitrefill.png", height: 1.375 },
  { name: "Frontier Traders", src: "/v2/brands/frontier-traders.svg", height: 1.75 },
  { name: "JPool", src: "/v2/brands/jpool.svg", height: 1.5 },
  { name: "Superteam", src: "/v2/brands/superteam.svg", height: 1.125 },
  { name: "Ecosystem Call", word: true },
];

export function Landing() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    void load().then(setData);
  }, []);

  const live = data?.auctions.find((one) => one.status === "live") ?? null;
  const last = data?.auctions.find((one) => one.status === "sold") ?? null;
  const hero = live ?? last;
  // На главной две карточки: объявленный торг и самый свежий, а без
  // объявления - два свежих. Идущий торг всегда впереди. Остальное - на
  // странице всех торгов, иначе при сотне торгов здесь была бы сотня карточек.
  const all = data?.auctions ?? [];
  const cards = all.slice(0, NEXT ? 1 : 2);
  const { views, shooter } = useViews(cards);

  return (
    <div className="v2">
      {shooter}
      <Top />

      <section className="v2-hero">
        <div className="v2-hero-text">
          <h1>
            If people look at it,
            <span> it&apos;s ad space.</span>
          </h1>
          <div className="v2-hero-foot">
            <p>
              Brands bid on logo spots on real things: a van on a road trip, a tie on a live show, a shirt at a run
              club. The money waits in escrow until the photo is up.
            </p>
            <a className="v2-btn dark wide" href={live ? APP_URL : FOLLOW}>
              {live ? "Bid on a spot" : "Follow for the next one"}
              <Grip />
            </a>
          </div>
        </div>

        <a className="v2-feature" href={hero ? `${APP_URL}/?thing=${hero.id}` : APP_URL}>
          <div className="v2-feature-media">{hero && VIDEOS[hero.slug] && <Loop {...VIDEOS[hero.slug]} />}</div>
          <div className="v2-feature-top">
            <span className="v2-meta">
              {hero ? [hero.owner, live ? null : `Sold ${day(hero.closedAt)}`].filter(Boolean).join(" · ") : ""}
            </span>
            <span className={live ? "v2-tag live" : "v2-tag"}>
              <span className="v2-dot" />
              {live ? "LIVE" : "SOLD"}
            </span>
          </div>
          <div className="v2-feature-title">
            <h2>{hero?.title ?? " "}</h2>
            <p>{hero ? `${hero.spots} brands paid ${usd(hero.raisedCents)} to ride along.` : " "}</p>
          </div>
          <div className="v2-feature-foot">
            <span>{hero ? `${hero.bidders} bidders` : ""}</span>
            <span className="v2-btn light">
              {live ? "See the spots" : "See how it went"}
              <Grip />
            </span>
          </div>
        </a>

        <div className="v2-strip" aria-label="Brands that bid with us">
          {/* Четыре круга: пяти логотипов не хватает на ширину строки, и петля рвалась бы. */}
          <div className="v2-strip-track">
            {[...BRANDS, ...BRANDS, ...BRANDS, ...BRANDS].map((one, at) => (
              <span key={at} className="v2-brand" aria-hidden={at >= BRANDS.length}>
                {one.src && <img src={one.src} alt={one.word ? "" : one.name} style={{ height: `${one.height}rem` }} />}
                {one.word && one.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {data && (
        <section className="v2-numbers" aria-label="So far">
          <dl>
            <div>
              <dd>{usd(data.totalCents)}+</dd>
              <dt>bid on spots so far</dt>
            </div>
            <div>
              <dd>{data.bids}+</dd>
              <dt>bids placed</dt>
            </div>
            <div>
              <dd>{data.bidders}+</dd>
              <dt>brands and people bid</dt>
            </div>
            <div>
              <dd>{REACH}</dd>
              <dt>views on streams and posts with the logos</dt>
            </div>
          </dl>
        </section>
      )}

      <section className="v2-section" id="auctions">
        <p className="v2-label">Auctions</p>
        <div className="v2-head">
          <h2>
            Real things,
            <span> real brands on them.</span>
          </h2>
        </div>

        <div className="v2-grid">
          {cards.filter((one) => one.status === "live").map((one) => <AuctionCard key={one.id} one={one} view={views[one.id]} />)}
          {NEXT && <NextCard next={NEXT} />}
          {cards.filter((one) => one.status !== "live").map((one) => <AuctionCard key={one.id} one={one} view={views[one.id]} />)}
        </div>
        <a className="v2-more" href="/v2/auctions">
          All auctions
          <span aria-hidden>&rarr;</span>
        </a>
      </section>

      <section className="v2-section v2-how" id="how">
        <p className="v2-label">How it works</p>
        <div className="v2-head">
          <h2>
            Your money waits
            <span> until the photo is up.</span>
          </h2>
          <p className="v2-head-sub">Six steps from picking a spot to the owner getting paid.</p>
        </div>
        <Flow />
      </section>

      <section className="v2-band">
        <div>
          <h2>Got something people look at?</h2>
          <p>A shirt, a van, a stage, a campaign. Mark the spots, set starting prices, get paid once the logos are up.</p>
        </div>
        <a className="v2-btn dark" href="/v2/sell">
          Sell a spot
          <Grip />
        </a>
      </section>

      <Foot />
    </div>
  );
}

/** Шапка - общая для главной и страницы всех торгов. */
export function Top() {
  return (
    <header className="v2-top">
      <a className="v2-mark" href="/v2">
        <img className="v2-mark-logo" src="/v2/oxar-mark.webp" alt="" />
        OXAR
      </a>
      <nav className="v2-nav">
        <a href="/v2/auctions">Auctions</a>
        <a href="/v2#how">How it works</a>
        <a href="/v2/sell">Sell a spot</a>
      </nav>
      <div className="v2-side">
        <a className="v2-pill" href="/v2#auctions">
          <span className="v2-dot" />
          Next: Holiday edition
        </a>
        <a className="v2-btn dark" href="/v2/sell">
          Sell a spot
        </a>
      </div>
    </header>
  );
}

export function Foot() {
  return (
    <footer className="v2-foot">
      <a className="v2-mark small" href="/v2">
        <img className="v2-mark-logo" src="/v2/oxar-mark.webp" alt="" />
        OXAR
      </a>
      <span>Ad space on physical things</span>
      <a className="v2-x" href={FOLLOW} aria-label="OXAR on X">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </a>
    </footer>
  );
}

/** Ролик без звука по кругу. Кто просил меньше движения, видит постер. */
function Loop({ src, poster }: { src: string; poster: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) video.current?.pause();
  }, []);
  return <video ref={video} src={src} poster={poster} autoPlay muted loop playsInline preload="auto" aria-hidden />;
}

/** Значок на кнопке: девять точек-мест, как сетка на вещи. */
function Grip() {
  return (
    <svg className="v2-grip" viewBox="0 0 12 12" aria-hidden>
      {[2, 6, 10].flatMap((y) => [2, 6, 10].map((x) => <rect key={`${x}-${y}`} x={x - 0.75} y={y - 0.75} width="1.5" height="1.5" />))}
    </svg>
  );
}
