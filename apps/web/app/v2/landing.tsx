"use client";

import { useEffect, useRef, useState } from "react";
import { SpotView, TreeView, useViews } from "./spots.tsx";

/**
 * Прототип лендинга в духе frontiertraders.com, на нашем материале: герой
 * выбирается по состоянию торгов, торги - карточками-кампаниями с логотипом
 * хозяина вещи и табличкой цифр, деньги объяснены тремя карточками, а не
 * схемой. Живёт на /v2 и в прод не ссылается.
 */

const APP_URL = "https://app.oxar.app";
/** Куда ведёт «следить за следующим»: формы подписки пока нет, анонсы - в X. */
const FOLLOW = "https://x.com/oxar_app";
/** Сколько последних проданных торгов показывать карточками на главной. */
const RECENT = 4;
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Чья вещь - крупной надписью на карточке, как логотип бренда у frontier. */
const OWNERS: Record<string, string> = {
  "the-van": "Superteam Georgia",
  "shirt-xx": "Ecosystem Call",
  "superteam-ua-tee": "Superteam Ukraine",
};

/** Тон карточки - под хозяина вещи. */
const TONES: Record<string, "dark" | "warm" | "light"> = {
  "the-van": "dark",
  "shirt-xx": "warm",
  "superteam-ua-tee": "light",
};

/** Ролик вещи для первого экрана. Без ролика герой остаётся на подложке. */
const VIDEOS: Record<string, { src: string; poster: string }> = {
  "the-van": { src: "/v2/van-loop.mp4", poster: "/v2/van-poster.jpg" },
};

type Auction = {
  id: string;
  slug: string;
  title: string;
  owner: string;
  where: string | null;
  status: "live" | "next" | "sold";
  raisedCents: number;
  spots: number;
  bidders: number;
  closedAt: number;
  logos: { url: string; brand: string }[];
  /** Модель вещи: с её сцены снимается кадр с местами. */
  model: string | null;
  /** Код места - кто его выиграл и за сколько. */
  won: Record<string, { url: string; brand: string; cents: number }>;
};

type Data = {
  auctions: Auction[];
  totalCents: number;
  bidders: number;
  averageCents: number;
  logos: { url: string; brand: string }[];
};

async function rest<T>(path: string): Promise<T | null> {
  if (!SUPABASE || !ANON) return null;
  try {
    const response = await fetch(`${SUPABASE}/rest/v1/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

async function load(): Promise<Data | null> {
  const [things, lots, bids] = await Promise.all([
    rest<
      { id: string; slug: string; title: string; house: boolean; prepared: boolean; worn_where: string | null; model_url: string | null }[]
    >("things?active=eq.true&hidden=eq.false&select=id,slug,title,house,prepared,worn_where,model_url"),
    rest<{ id: string; thing_id: string; status: string; closes_at: string; rehearsal: boolean; thing_spots: { code: string } | null }[]>(
      "lots?select=id,thing_id,status,closes_at,rehearsal,thing_spots:spot_id(code)",
    ),
    rest<{ lot_id: string; amount_cents: number; media_url: string; bidder_wallet: string; brand: string | null }[]>(
      "lot_bids?select=lot_id,amount_cents,media_url,bidder_wallet,brand&order=amount_cents.desc",
    ),
  ]);
  if (!things || !lots || !bids) return null;

  const real = new Set(lots.filter((lot) => !lot.rehearsal).map((lot) => lot.id));
  const counted = bids.filter((bid) => real.has(bid.lot_id));
  const top = new Map<string, (typeof bids)[number]>();
  const people = new Map<string, Set<string>>();
  for (const bid of counted) {
    if (!top.has(bid.lot_id)) top.set(bid.lot_id, bid);
    const set = people.get(bid.lot_id) ?? new Set<string>();
    set.add(bid.bidder_wallet);
    people.set(bid.lot_id, set);
  }

  const auctions: Auction[] = [];
  for (const thing of things) {
    if (!thing.house && !thing.prepared) continue;
    const mine = lots.filter((lot) => lot.thing_id === thing.id && real.has(lot.id));
    const open = mine.filter((lot) => lot.status === "open" && Date.parse(lot.closes_at) > Date.now());
    const won = mine.filter((lot) => lot.status === "won" && top.has(lot.id));
    const shown = open.length ? open : won;
    if (shown.length === 0) continue;
    const wallets = new Set<string>();
    for (const lot of shown) for (const one of people.get(lot.id) ?? []) wallets.add(one);
    const winners: Auction["won"] = {};
    for (const lot of shown) {
      const lead = top.get(lot.id);
      if (lead && lot.thing_spots?.code) {
        winners[lot.thing_spots.code] = { url: lead.media_url, brand: lead.brand ?? "", cents: lead.amount_cents };
      }
    }
    auctions.push({
      id: thing.id,
      slug: thing.slug,
      title: thing.title,
      owner: OWNERS[thing.slug] ?? thing.title,
      where: thing.worn_where,
      status: open.length ? "live" : "sold",
      raisedCents: shown.reduce((sum, lot) => sum + (top.get(lot.id)?.amount_cents ?? 0), 0),
      spots: shown.length,
      bidders: wallets.size,
      closedAt: Math.max(...shown.map((lot) => Date.parse(lot.closes_at))),
      logos: shown.filter((lot) => top.has(lot.id)).map((lot) => ({ url: top.get(lot.id)!.media_url, brand: top.get(lot.id)!.brand ?? "" })),
      model: thing.model_url,
      won: winners,
    });
  }
  auctions.sort((a, b) => (a.status === "live" ? -1 : 0) - (b.status === "live" ? -1 : 0) || b.closedAt - a.closedAt);

  const totalCents = counted.reduce((sum, bid) => sum + bid.amount_cents, 0);
  const seen = new Set<string>();
  const logos = auctions
    .flatMap((one) => one.logos)
    .filter((one) => (seen.has(one.url) ? false : (seen.add(one.url), true)));
  return {
    auctions,
    totalCents,
    bidders: new Set(counted.map((bid) => bid.bidder_wallet)).size,
    averageCents: counted.length ? Math.round(totalCents / counted.length) : 0,
    logos,
  };
}

function usd(cents: number, compact = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(cents / 100);
}

function day(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
  const [filter, setFilter] = useState<"all" | "live" | "past">("all");
  useEffect(() => {
    void load().then(setData);
  }, []);

  const live = data?.auctions.find((one) => one.status === "live") ?? null;
  const last = data?.auctions.find((one) => one.status === "sold") ?? null;
  const hero = live ?? last;
  // На главной - все идущие и только несколько последних проданных: при
  // сотне торгов сотня карточек здесь не читалась бы. Весь архив - строками
  // на отдельной странице.
  const all = data?.auctions ?? [];
  const running = all.filter((one) => one.status === "live");
  const recent = all.filter((one) => one.status === "sold").slice(0, RECENT);
  const cards = filter === "live" ? running : filter === "past" ? recent : [...running, ...recent];
  const more = all.length > 0;
  // Кадры вещей с местами: снимаются в браузере по одной сцене за раз.
  const { views, shooter } = useViews(cards);

  return (
    <div className="v2">
      {shooter}
      <header className="v2-top">
        <a className="v2-mark" href="/v2">
          <span className="v2-mark-box">
            <Corners />
          </span>
          OXAR
        </a>
        <nav className="v2-nav">
          <a href="#auctions">Auctions</a>
          <a href="#how">How it works</a>
          <a href="/sell">Sell a spot</a>
        </nav>
        <div className="v2-side">
          <a className="v2-pill" href="#auctions">
            <span className="v2-dot" />
            Next: Holiday edition
          </a>
          <a className="v2-btn dark" href="/sell">
            Sell a spot
          </a>
        </div>
      </header>

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

        {data && data.logos.length > 0 && (
          <div className="v2-strip" aria-label="Brands that bid with us">
            <div className="v2-strip-track">
              {[...data.logos, ...data.logos].map((one, at) => (
                <img key={at} src={one.url} alt={one.brand} loading="lazy" />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="v2-section" id="auctions">
        <p className="v2-label">Auctions</p>
        <div className="v2-head">
          <h2>
            Real things,
            <span> real brands on them.</span>
          </h2>
          <div className="v2-filter" role="tablist">
            {(["all", "live", "past"] as const).map((one) => (
              <button
                key={one}
                type="button"
                className={filter === one ? "on" : ""}
                onClick={() => setFilter(one)}
              >
                {one === "all" ? "All" : one === "live" ? "Live" : "Past"}
              </button>
            ))}
          </div>
        </div>

        <div className="v2-grid">
          {filter !== "past" && (
            <a className="v2-card tone-red" href={FOLLOW}>
              <div className="v2-card-top">
                <span className="v2-tag soft">
                  <span className="v2-dot" />
                  Coming soon
                </span>
                <span className="v2-chip">11 spots</span>
              </div>
              <div className="v2-visual">
                <TreeView />
              </div>
              <div className="v2-card-name">Ecosystem Call</div>
              <p className="v2-card-sub">Holiday edition. Spots on the tree behind the host, live on air.</p>
              <p className="v2-stats">Opens in December</p>
              <span className="v2-btn light wide">Follow for the date</span>
            </a>
          )}

          {cards.map((one) => {
            const view = views[one.id];
            const total = view ? Object.keys(view.quads).length : null;
            const sold = Object.keys(one.won).length;
            return (
              <a key={one.id} className={`v2-card tone-${TONES[one.slug] ?? "light"}`} href={`${APP_URL}/?thing=${one.id}`}>
                <div className="v2-card-top">
                  <span className={one.status === "live" ? "v2-tag live" : "v2-tag soft ended"}>
                    <span className="v2-dot" />
                    {one.status === "live" ? "Live" : "Ended"}
                  </span>
                  <span className="v2-chip">{total ? `${sold} of ${total} ${total === 1 ? "spot" : "spots"} sold` : `${sold} ${sold === 1 ? "spot" : "spots"} sold`}</span>
                </div>
                <div className="v2-visual">{view ? <SpotView view={view} won={one.won} /> : <span className="v2-wait" />}</div>
                <div className="v2-card-name">{one.owner}</div>
                <p className="v2-card-sub">{one.title}</p>
                <p className="v2-stats">
                  {usd(one.raisedCents)} raised · {one.bidders} bidders · {day(one.closedAt)}
                </p>
              </a>
            );
          })}
        </div>
        {more && (
          <a className="v2-more" href={APP_URL}>
            All auctions
            <span aria-hidden>&rarr;</span>
          </a>
        )}
      </section>

      <section className="v2-dark" id="how">
        <div className="v2-dark-in">
          <p className="v2-label">How it works</p>
          <h2>
            Your money waits
            <span> until the photo is up.</span>
          </h2>
          <div className="v2-steps">
            <Step
              tag="You bid"
              title="Pay upfront, into escrow"
              text="Pick a spot and place a bid. The money goes into escrow, not to us. If someone outbids you, it comes straight back."
              icon="bid"
            />
            <Step
              tag="No photo, no pay"
              title="Refund if it never goes up"
              text="The owner has a deadline to post a photo of your logo in place. No photo by then, and you get your money back automatically."
              icon="refund"
            />
            <Step
              tag="Photo is up"
              title="72 hours, then the owner is paid"
              text="Once the photo is up you have 72 hours to dispute it. Then the owner gets paid and OXAR takes its fee."
              icon="paid"
            />
          </div>
        </div>
      </section>

      {data && (
        <section className="v2-section v2-numbers">
          <p className="v2-label">So far</p>
          <dl>
            <div>
              <dd>{usd(data.totalCents, true)}</dd>
              <dt>bid in total, outbid bids included</dt>
            </div>
            <div>
              <dd>{data.bidders}</dd>
              <dt>brands and people who bid</dt>
            </div>
            <div>
              <dd>{usd(data.averageCents)}</dd>
              <dt>average bid</dt>
            </div>
          </dl>
        </section>
      )}

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
    </div>
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

function Step({ tag, title, text, icon }: { tag: string; title: string; text: string; icon: "bid" | "refund" | "paid" }) {
  return (
    <div className="v2-step">
      <span className="v2-tag soft dark">{tag}</span>
      <span className="v2-icon">
        <Corners />
        <svg viewBox="0 0 24 24" aria-hidden>
          {icon === "bid" && <path d="M5 15h6m-6-4h10m-10-4h14" />}
          {icon === "refund" && <path d="M9 7 5 11l4 4M5 11h10a4 4 0 0 1 0 8h-2" />}
          {icon === "paid" && <path d="M5 12.5 10 17l9-10" />}
        </svg>
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
