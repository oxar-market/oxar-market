"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsdFull } from "@oxar/core";
import { houseShape, ThingStage, type Stage } from "@oxar/stage";

/**
 * Прошедшие торги наших вещей - листом плиток под карточкой следующего:
 * ровный тон, по центру сама вещь с логотипами победителей, под ней строки
 * цифр. Фото с пруфов были крупными и пёстрыми и ломали палитру страницы.
 */

const APP_URL = "https://app.oxar.app";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type Sold = {
  id: string;
  title: string;
  model: string | null;
  where: string | null;
  when: string | null;
  /** Код места - логотип победителя: им вещь одевается на снимке. */
  art: Record<string, string>;
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

export async function loadSold(): Promise<Sold[]> {
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
      }[]
    >("things?active=eq.true&hidden=eq.false&select=id,title,house,prepared,model_url,worn_where,worn_when"),
    rest<{ id: string; thing_id: string; closes_at: string; thing_spots: { code: string } | null }[]>(
      "lots?rehearsal=eq.false&status=eq.won&select=id,thing_id,closes_at,thing_spots:spot_id(code)",
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
    const art: Record<string, string> = {};
    for (const lot of won) {
      for (const wallet of wallets.get(lot.id) ?? []) people.add(wallet);
      if (lot.thing_spots?.code) art[lot.thing_spots.code] = top.get(lot.id)!.art;
    }
    sold.push({
      id: thing.id,
      title: thing.title,
      model: thing.model_url,
      where: thing.worn_where,
      when: thing.worn_when,
      art,
      raisedCents: won.reduce((sum, lot) => sum + top.get(lot.id)!.amount, 0),
      spots: won.length,
      bidders: people.size,
      closedAt: Math.max(...won.map((lot) => Date.parse(lot.closes_at))),
    });
  }
  return sold.sort((a, b) => b.closedAt - a.closedAt);
}

/**
 * Снимок вещи с логотипами победителей. Сцена собирается невидимой, одевается,
 * отдаёт кадр на прозрачном фоне и сразу разбирается: три живые 3D-сцены на
 * одной странице - три холста WebGL и три модели в памяти ради картинок,
 * которые не крутят.
 */
function Shot({ one, onDone }: { one: Sold; onDone: (src: string | null) => void }) {
  const stage = useRef<Stage | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  async function dress() {
    await Promise.all(
      Object.entries(one.art).map(
        ([code, url]) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
              stage.current?.show(code, image);
              resolve();
            };
            image.onerror = () => resolve();
            image.src = url;
          }),
      ),
    );
    const canvas = stage.current?.snapshot(0);
    done.current(canvas ? canvas.toDataURL("image/png") : null);
  }

  // Модель не приехала - плитка остаётся без вещи, а не висит в загрузке.
  useEffect(() => {
    const giveUp = setTimeout(() => done.current(null), 20000);
    return () => clearTimeout(giveUp);
  }, []);

  return (
    <div className="sold-stage" aria-hidden>
      <ThingStage shape={houseShape(one.model)} picked={null} onPick={() => {}} stage={stage} onReady={() => void dress()} />
    </div>
  );
}

/** Лист прошедших торгов. */
export function SoldCards({ sold }: { sold: Sold[] }) {
  // Снимки снимаем по одному: следующая сцена собирается, когда прошлая
  // отдала кадр и разобралась.
  const [shots, setShots] = useState<Record<string, string | null>>({});
  const next = sold.find((one) => !(one.id in shots));

  return (
    <div className="sold-cards">
      {next && (
        <Shot key={next.id} one={next} onDone={(src) => setShots((all) => ({ ...all, [next.id]: src }))} />
      )}
      {sold.map((one) => (
        <a key={one.id} className="sold-card" href={`${APP_URL}/?thing=${one.id}`}>
          <span className="sold-pic">
            {shots[one.id] ? <img className="sold-img" src={shots[one.id]!} alt={one.title} /> : null}
          </span>
          <span className="sold-body">
            <b>{one.title}</b>
            <dl className="sold-spec">
              <div>
                <dt>raised</dt>
                <dd>{formatUsdFull(one.raisedCents)}</dd>
              </div>
              <div>
                <dt>spots</dt>
                <dd>{one.spots}</dd>
              </div>
              <div>
                <dt>bidders</dt>
                <dd>{one.bidders}</dd>
              </div>
            </dl>
            {(one.where || one.when) && (
              <span className="sold-meta">{[one.where, one.when].filter(Boolean).join(" · ")}</span>
            )}
          </span>
        </a>
      ))}
    </div>
  );
}
