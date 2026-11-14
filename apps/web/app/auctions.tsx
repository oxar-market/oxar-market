"use client";

import { formatUsdFull } from "@oxar/core";

/**
 * Прошедшие торги наших вещей - списком под карточкой следующего. Прежде на
 * лендинге был виден только последний; теперь видна вся история: что, где,
 * сколько собрали и чьи логотипы победили.
 */

const APP_URL = "https://app.oxar.app";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Sold = {
  id: string;
  title: string;
  where: string | null;
  when: string | null;
  /** Фото с пруфа, иначе снимок вещи; нет ни того, ни другого - null. */
  image: string | null;
  logos: string[];
  raisedCents: number;
  spots: number;
  bidders: number;
  closedAt: number;
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

/** Снимок из хранилища или из приложения: путь от корня - файл приложения. */
function picture(path: string): string {
  return path.startsWith("/") ? `${APP_URL}${path}` : `${SUPABASE}/storage/v1/object/public/things/${path}`;
}

export async function loadSold(): Promise<Sold[]> {
  const [things, lots, bids] = await Promise.all([
    rest<
      {
        id: string;
        title: string;
        house: boolean;
        prepared: boolean;
        photos: string[] | null;
        proof_photos: string[] | null;
        worn_where: string | null;
        worn_when: string | null;
      }[]
    >("things?active=eq.true&hidden=eq.false&select=id,title,house,prepared,photos,proof_photos,worn_where,worn_when"),
    rest<{ id: string; thing_id: string; status: string; closes_at: string }[]>(
      "lots?rehearsal=eq.false&status=eq.won&select=id,thing_id,status,closes_at",
    ),
    rest<{ lot_id: string; amount_cents: number; media_url: string; bidder_wallet: string }[]>(
      "lot_bids?select=lot_id,amount_cents,media_url,bidder_wallet&order=amount_cents.desc",
    ),
  ]);
  if (!things || !lots || !bids) return [];

  const top = new Map<string, { amount: number; art: string }>();
  const wallets = new Map<string, Set<string>>();
  for (const bid of bids) {
    if (!top.has(bid.lot_id)) top.set(bid.lot_id, { amount: bid.amount_cents, art: bid.media_url });
    const set = wallets.get(bid.lot_id) ?? new Set<string>();
    set.add(bid.bidder_wallet);
    wallets.set(bid.lot_id, set);
  }

  const sold: Sold[] = [];
  for (const thing of things) {
    if (!thing.house && !thing.prepared) continue;
    const won = lots.filter((lot) => lot.thing_id === thing.id && top.has(lot.id));
    if (won.length === 0) continue;
    const people = new Set<string>();
    for (const lot of won) for (const wallet of wallets.get(lot.id) ?? []) people.add(wallet);
    const shot = thing.proof_photos?.[0] ?? thing.photos?.[0] ?? null;
    sold.push({
      id: thing.id,
      title: thing.title,
      where: thing.worn_where,
      when: thing.worn_when,
      image: shot ? picture(shot) : null,
      logos: won.map((lot) => top.get(lot.id)!.art),
      raisedCents: won.reduce((sum, lot) => sum + top.get(lot.id)!.amount, 0),
      spots: won.length,
      bidders: people.size,
      closedAt: Math.max(...won.map((lot) => Date.parse(lot.closes_at))),
    });
  }
  return sold.sort((a, b) => b.closedAt - a.closedAt);
}

/** Картинка торга: фото, а без него - мозаика логотипов победителей. */
function Cover({ one, className }: { one: Sold; className: string }) {
  if (one.image) return <img className={className} src={one.image} alt="" loading="lazy" />;
  return (
    <span className={`${className} mosaic`}>
      {one.logos.slice(0, 9).map((logo, at) => (
        <img key={at} src={logo} alt="" loading="lazy" />
      ))}
    </span>
  );
}

function closed(at: number): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Вариант «строками», как у backable список закрытых раундов. */
export function SoldRows({ sold }: { sold: Sold[] }) {
  return (
    <div className="sold-rows">
      {sold.map((one) => (
        <a key={one.id} className="sold-row" href={`${APP_URL}/?thing=${one.id}`}>
          <Cover one={one} className="sold-thumb" />
          <span className="sold-name">
            <b>{one.title}</b>
            <span>{[one.where, one.when].filter(Boolean).join(" · ") || `Closed ${closed(one.closedAt)}`}</span>
          </span>
          <span className="sold-logos">
            {one.logos.slice(0, 6).map((logo, at) => (
              <img key={at} src={logo} alt="" loading="lazy" />
            ))}
          </span>
          <span className="sold-num">
            <span>Raised</span>
            <b>{formatUsdFull(one.raisedCents)}</b>
          </span>
          <span className="sold-num">
            <span>Spots</span>
            <b>{one.spots}</b>
          </span>
          <span className="sold-num">
            <span>Bidders</span>
            <b>{one.bidders}</b>
          </span>
          <span className="sold-go">View</span>
        </a>
      ))}
    </div>
  );
}

/** Вариант «карточками»: сетка, у каждой торга своё фото. */
export function SoldCards({ sold }: { sold: Sold[] }) {
  return (
    <div className="sold-cards">
      {sold.map((one) => (
        <a key={one.id} className="sold-card" href={`${APP_URL}/?thing=${one.id}`}>
          <span className="sold-pic">
            <Cover one={one} className="sold-img" />
            <span className="now-pill done">SOLD</span>
          </span>
          <span className="sold-body">
            <b>{one.title}</b>
            <span className="sold-meta">{[one.where, one.when].filter(Boolean).join(" · ")}</span>
            <span className="sold-line">
              <span>{formatUsdFull(one.raisedCents)} raised</span>
              <span>
                {one.spots} spots · {one.bidders} bidders
              </span>
            </span>
          </span>
        </a>
      ))}
    </div>
  );
}
