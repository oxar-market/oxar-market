"use client";

import { useEffect, useMemo, useState } from "react";
import { houseShape, SHIRT } from "@oxar/stage";
import { TreeView } from "../v2/spots.tsx";

/**
 * Прототип «нового поколения»: одна страница в трёх режимах.
 *
 * 1. Дроп - текущая вещь на весь экран, как выпуск, а не клетка каталога.
 * 2. Биржа мест - единица продажи место, а не вещь: все места всех торгов
 *    одной таблицей с ценой, ставками и сроком, как стакан на бирже.
 * 3. Seen - стена настоящих фото с пруфов: доказательство, что это было.
 *
 * Живёт на /v3, в прод не ссылается.
 */

const APP_URL = "https://app.oxar.app";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Status = "upcoming" | "open" | "sold" | "unsold";

type Row = {
  key: string;
  thing: string;
  thingId: string | null;
  spot: string;
  where: string;
  status: Status;
  cents: number | null;
  bids: number;
  at: number | null;
  logo: string | null;
  brand: string | null;
};

type Seen = { src: string; title: string; caption: string };

type Drop = { date: string; title: string; note: string; state: "next" | "past"; href?: string; at: number };

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

function picture(path: string): string {
  return path.startsWith("/") ? `${APP_URL}${path}` : `${SUPABASE}/storage/v1/object/public/things/${path}`;
}

/** Места новогодней ёлки: торга ещё нет, поэтому строки без цены. */
const TREE_ROWS: Row[] = [
  { label: "Star on top", key: "star" },
  ...Array.from({ length: 10 }, (_, at) => ({ label: `Ornament ${at + 1}`, key: `o${at + 1}` })),
].map(({ label, key }): Row => ({
  key: `tree-${key}`,
  thing: "Holiday tree",
  thingId: null,
  spot: label,
  where: "Ecosystem Call, live on air",
  status: "upcoming",
  cents: null,
  bids: 0,
  at: null,
  logo: null,
  brand: null,
}));

async function load(): Promise<{ rows: Row[]; seen: Seen[]; drops: Drop[] }> {
  const [things, lots, bids] = await Promise.all([
    rest<
      {
        id: string;
        title: string;
        house: boolean;
        prepared: boolean;
        model_url: string | null;
        worn_where: string | null;
        worn_when: string | null;
        proof_photos: string[] | null;
      }[]
    >("things?active=eq.true&hidden=eq.false&select=id,title,house,prepared,model_url,worn_where,worn_when,proof_photos"),
    rest<{ id: string; thing_id: string; status: string; closes_at: string; rehearsal: boolean; reserve_cents: number; thing_spots: { code: string } | null }[]>(
      "lots?rehearsal=eq.false&select=id,thing_id,status,closes_at,rehearsal,reserve_cents,thing_spots:spot_id(code)",
    ),
    rest<{ lot_id: string; amount_cents: number; media_url: string; brand: string | null }[]>(
      "lot_bids?select=lot_id,amount_cents,media_url,brand&order=amount_cents.desc",
    ),
  ]);
  if (!things || !lots || !bids) return { rows: TREE_ROWS, seen: [], drops: [] };

  const top = new Map<string, (typeof bids)[number]>();
  const count = new Map<string, number>();
  for (const bid of bids) {
    if (!top.has(bid.lot_id)) top.set(bid.lot_id, bid);
    count.set(bid.lot_id, (count.get(bid.lot_id) ?? 0) + 1);
  }

  const rows: Row[] = [...TREE_ROWS];
  const seen: Seen[] = [];
  const drops: Drop[] = [{ date: "Dec", title: "Holiday tree", note: "Ecosystem Call · 11 spots", state: "next", at: Infinity }];

  for (const thing of things) {
    if (!thing.house && !thing.prepared) continue;
    const shape = houseShape(thing.model_url) ?? SHIRT;
    const labels = new Map(shape.spots.map((spot) => [spot.code, spot.label]));
    // Seen - только фото с пруфов: снимок вещи из каталога - это не «в мире».
    for (const path of thing.proof_photos ?? []) {
      seen.push({ src: picture(path), title: thing.title, caption: [thing.worn_where, thing.worn_when].filter(Boolean).join(" · ") });
    }
    const mine = lots.filter((lot) => lot.thing_id === thing.id && (lot.status === "won" || lot.status === "open" || lot.status === "unsold"));
    if (mine.length === 0) continue;
    for (const lot of mine) {
      const lead = top.get(lot.id);
      const open = lot.status === "open" && Date.parse(lot.closes_at) > Date.now();
      rows.push({
        key: lot.id,
        thing: thing.title,
        thingId: thing.id,
        spot: labels.get(lot.thing_spots?.code ?? "") ?? lot.thing_spots?.code ?? "Spot",
        where: [thing.worn_where, thing.worn_when].filter(Boolean).join(" · "),
        status: open ? "open" : lead ? "sold" : "unsold",
        cents: lead?.amount_cents ?? lot.reserve_cents,
        bids: count.get(lot.id) ?? 0,
        at: Date.parse(lot.closes_at),
        logo: lead?.media_url ?? null,
        brand: lead?.brand ?? null,
      });
    }
    const closed = Math.max(...mine.map((lot) => Date.parse(lot.closes_at)));
    drops.push({
      date: new Date(closed).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      title: thing.title,
      note: (() => {
        const sold = mine.filter((lot) => top.has(lot.id)).length;
        return `${sold} ${sold === 1 ? "spot" : "spots"} sold`;
      })(),
      state: "past",
      href: `${APP_URL}/?thing=${thing.id}`,
      at: closed,
    });
  }
  return { rows, seen, drops: drops.sort((a, b) => b.at - a.at) };
}

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function day(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const STATUS: Record<Status, string> = { upcoming: "Upcoming", open: "Open", sold: "Sold", unsold: "Unsold" };

export function Drops() {
  const [data, setData] = useState<{ rows: Row[]; seen: Seen[]; drops: Drop[] }>({ rows: TREE_ROWS, seen: [], drops: [] });
  const [show, setShow] = useState<"all" | Status>("all");
  const [sort, setSort] = useState<"price" | "date">("price");
  const [more, setMore] = useState(false);

  useEffect(() => {
    void load().then(setData);
  }, []);

  const rows = useMemo(() => {
    const list = data.rows.filter((row) => show === "all" || row.status === show);
    return [...list].sort((a, b) =>
      sort === "price" ? (b.cents ?? -1) - (a.cents ?? -1) : (b.at ?? Number.MAX_SAFE_INTEGER) - (a.at ?? Number.MAX_SAFE_INTEGER),
    );
  }, [data.rows, show, sort]);
  const shown = more ? rows : rows.slice(0, 10);
  const counts = (status: Status) => data.rows.filter((row) => row.status === status).length;

  return (
    <div className="v2 v3">
      <header className="v2-top">
        <a className="v2-mark" href="/v3">
          <span className="v2-mark-box">
            <i className="v2-c tl" />
            <i className="v2-c tr" />
            <i className="v2-c bl" />
            <i className="v2-c br" />
          </span>
          OXAR
        </a>
        <nav className="v2-nav">
          <a href="#drop">Drop</a>
          <a href="#board">Spots</a>
          <a href="#seen">Seen</a>
        </nav>
        <div className="v2-side">
          <a className="v2-btn dark" href="/sell">
            Sell a spot
          </a>
        </div>
      </header>

      {/* 1. Дроп */}
      <section className="v3-drop" id="drop">
        <div className="v3-drop-text">
          <span className="v2-tag soft dark">Next drop · December</span>
          <h1>
            The holiday tree
            <span> on Ecosystem Call.</span>
          </h1>
          <p>
            A tree behind the host, live on air for the whole show. Every ornament is a spot. The star on top is the
            big one. Bid in December, see your logo on the tree on the call.
          </p>
          <dl className="v3-drop-facts">
            <div>
              <dt>Spots</dt>
              <dd>11</dd>
            </div>
            <div>
              <dt>Where</dt>
              <dd>Live on air</dd>
            </div>
            <div>
              <dt>Bidding opens</dt>
              <dd>December</dd>
            </div>
          </dl>
          <a className="v2-btn light" href="#board">
            Get notified when it opens
          </a>
        </div>
        <div className="v3-drop-stage">
          <TreeView />
        </div>
        <div className="v3-calendar">
          {data.drops.map((drop) =>
            drop.href ? (
              <a key={drop.title} className={`v3-cal ${drop.state}`} href={drop.href}>
                <b>{drop.date}</b>
                <span>{drop.title}</span>
                <i>{drop.note}</i>
              </a>
            ) : (
              <span key={drop.title} className={`v3-cal ${drop.state}`}>
                <b>{drop.date}</b>
                <span>{drop.title}</span>
                <i>{drop.note}</i>
              </span>
            ),
          )}
        </div>
      </section>

      {/* 2. Биржа мест */}
      <section className="v2-section" id="board">
        <p className="v2-label">Spots</p>
        <div className="v2-head">
          <h2>
            Every spot,
            <span> one board.</span>
          </h2>
          <div className="v3-controls">
            <div className="v2-filter" role="tablist">
              {(["all", "open", "upcoming", "sold"] as const).map((one) => (
                <button key={one} type="button" className={show === one ? "on" : ""} onClick={() => setShow(one)}>
                  {one === "all" ? `All ${data.rows.length}` : `${STATUS[one]} ${counts(one)}`}
                </button>
              ))}
            </div>
            <div className="v2-filter">
              <button type="button" className={sort === "price" ? "on" : ""} onClick={() => setSort("price")}>
                Price
              </button>
              <button type="button" className={sort === "date" ? "on" : ""} onClick={() => setSort("date")}>
                Date
              </button>
            </div>
          </div>
        </div>

        <div className="v3-board">
          <div className="v3-row v3-row-head">
            <span>Spot</span>
            <span>On</span>
            <span>Where people see it</span>
            <span>Status</span>
            <span>Price</span>
            <span>Bids</span>
            <span>Closes</span>
          </div>
          {shown.map((row) => {
            const Tag = row.thingId ? "a" : "div";
            return (
              <Tag key={row.key} className="v3-row" {...(row.thingId ? { href: `${APP_URL}/?thing=${row.thingId}` } : {})}>
                <span className="v3-spot">
                  <span className="v3-thumb">
                    {row.logo ? <img src={row.logo} alt={row.brand ?? ""} loading="lazy" /> : <i />}
                  </span>
                  <span>
                    <b>{row.spot}</b>
                    <em>{row.brand ?? (row.status === "upcoming" ? "Open in December" : "No bids")}</em>
                  </span>
                </span>
                <span>{row.thing}</span>
                <span className="v3-mut">{row.where}</span>
                <span>
                  <span className={`v3-status ${row.status}`}>{STATUS[row.status]}</span>
                </span>
                <span className={row.status === "unsold" ? "v3-num v3-mut" : "v3-num"}>
                  {row.cents === null ? "TBA" : row.status === "unsold" ? `from ${usd(row.cents)}` : usd(row.cents)}
                </span>
                <span className="v3-num">{row.bids || "-"}</span>
                <span className="v3-num v3-mut">{row.at ? day(row.at) : "Dec"}</span>
              </Tag>
            );
          })}
          {rows.length > 10 && (
            <button type="button" className="v2-more" onClick={() => setMore(!more)}>
              {more ? "Show less" : `Show all ${rows.length} spots`}
            </button>
          )}
        </div>
      </section>

      {/* 3. Seen */}
      {data.seen.length > 0 && (
        <section className="v2-section" id="seen">
          <p className="v2-label">Seen</p>
          <div className="v2-head">
            <h2>
              Not mockups.
              <span> Logos out in the world.</span>
            </h2>
          </div>
          <div className="v3-seen">
            {data.seen.map((one, at) => (
              <figure key={at} className={at === 0 ? "big" : ""}>
                <img
                  src={one.src}
                  alt={one.title}
                  loading="lazy"
                  // Битый файл в хранилище - плитка уходит, а не висит пустой.
                  onError={(event) => {
                    const tile = event.currentTarget.closest("figure");
                    if (tile) tile.style.display = "none";
                  }}
                />
                <figcaption>
                  <b>{one.title}</b>
                  <span>{one.caption}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="v2-band">
        <div>
          <h2>Got something people look at?</h2>
          <p>A shirt, a van, a stage, a campaign. It could be the next drop.</p>
        </div>
        <a className="v2-btn dark" href="/sell">
          Sell a spot
        </a>
      </section>

      <footer className="v2-foot">
        <span>OXAR</span>
        <span>Ad space on physical things</span>
        <a href="https://x.com/oxar_app">X</a>
      </footer>
    </div>
  );
}
