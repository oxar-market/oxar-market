"use client";

import { useEffect, useRef, useState } from "react";
import { APP_URL, FOLLOW, NEXT, TONES, day, load, usd, type Data } from "./data.ts";
import { Flow } from "./flow.tsx";
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

/** Кадрирующие уголки - наш знак вместо пунктира frontier. */
function Corners() {
  return (
    <>
      <i className="v2-c tl" />
      <i className="v2-c tr" />
      <i className="v2-c bl" />
      <i className="v2-c br" />
    </>
  );
}

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

  function card(one: Data["auctions"][number]) {
    const view = views[one.id];
    const total = view ? Object.keys(view.quads).length : null;
    const sold = Object.keys(one.won).length;
    return (
      <a key={one.id} className={`v2-card tone-${TONES[one.slug] ?? "light"}`} href={`${APP_URL}/?thing=${one.id}`}>
        <div className="v2-visual">
          {view ? (
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
          {cards.filter((one) => one.status === "live").map(card)}
          {NEXT && (
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
                <div className="v2-card-name">{NEXT.owner}</div>
                <p className="v2-card-sub">{NEXT.title}</p>
                <dl className="v2-facts">
                  <div>
                    <dt>Spots</dt>
                    <dd>{NEXT.spots}</dd>
                  </div>
                  <div>
                    <dt>Format</dt>
                    <dd>Live show</dd>
                  </div>
                  <div>
                    <dt>Opens</dt>
                    <dd>{NEXT.when}</dd>
                  </div>
                </dl>
              </div>
            </a>
          )}
          {cards.filter((one) => one.status !== "live").map(card)}
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
        <a className="v2-btn dark" href="/sell">
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
        <a href="/sell">Sell a spot</a>
      </nav>
      <div className="v2-side">
        <a className="v2-pill" href="/v2#auctions">
          <span className="v2-dot" />
          Next: Holiday edition
        </a>
        <a className="v2-btn dark" href="/sell">
          Sell a spot
        </a>
      </div>
    </header>
  );
}

export function Foot() {
  return (
    <footer className="v2-foot">
      <span className="v2-mark small">
        <span className="v2-mark-box">
          <Corners />
        </span>
        OXAR
      </span>
      <span>Ad space on physical things</span>
      <a href={FOLLOW}>X</a>
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
