"use client";

import { useEffect, useState } from "react";

/**
 * Лендинг на oxar.app по дизайн-борду: один экран, слева манифест и одна
 * дверь «Find a spot», справа живая афиша идущего торга - фото вещи с
 * разметкой мест, где занятые залиты, а свободные стоят контуром.
 *
 * Позиционирование намеренно шире аукциона: продаём места на вещах, аукцион -
 * лишь то, как место уходит сегодня. Поэтому заголовок и текст - про вещи,
 * а торг живёт маленькой карточкой-доказательством, что рынок дышит.
 *
 * Живые числа приезжают клиентом прямо из базы обычным fetch: тянуть сюда
 * SDK ради двух запросов незачем. Без ключей или без сети карточка честно
 * остаётся статичной - фото и разметка без цифр.
 */

/** Само приложение живёт на своём домене и деплоится отдельным проектом. */
const APP_URL = "https://app.oxar.app";

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Места вещи в порядке сетки 3x3 - тот же порядок, что на самой футболке. */
const SPOTS = ["slot_01", "slot_02", "slot_03", "slot_04", "slot_05", "slot_06", "slot_07", "slot_08", "slot_09"];

type Live = {
  title: string;
  closesAt: number;
  /** Коды мест, на которых уже стоит чья-то ставка. */
  taken: Set<string>;
  spots: number;
};

async function rest(path: string): Promise<unknown[] | null> {
  if (!SUPABASE || !ANON) return null;
  try {
    const response = await fetch(`${SUPABASE}/rest/v1/${path}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown[];
  } catch {
    return null;
  }
}

async function loadLive(): Promise<Live | null> {
  const lots = (await rest(
    "lots?status=eq.open&select=id,closes_at,thing_spots(code),things:thing_id(title)",
  )) as
    | {
        id: string;
        closes_at: string;
        thing_spots: { code: string } | null;
        things: { title: string } | null;
      }[]
    | null;
  if (!lots || lots.length === 0) return null;

  const bids = (await rest("lot_bids?select=lot_id")) as { lot_id: string }[] | null;
  const withBids = new Set((bids ?? []).map((one) => one.lot_id));

  const taken = new Set<string>();
  for (const lot of lots) {
    if (withBids.has(lot.id) && lot.thing_spots?.code) taken.add(lot.thing_spots.code);
  }

  return {
    title: lots[0].things?.title ?? "Shirt No. 1",
    closesAt: Math.min(...lots.map((one) => Date.parse(one.closes_at))),
    taken,
    spots: lots.length,
  };
}

export default function Home() {
  const [live, setLive] = useState<Live | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void loadLive().then(setLive);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const running = live !== null && live.closesAt > now;

  return (
    <main className="land">
      <header className="land-top">
        <span className="wordmark">OXAR</span>
        <span className="tagline">Ad space on physical things</span>
      </header>

      <div className="land-grid">
        <div className="manifesto">
          <h1>If people look at it, it&apos;s ad space.</h1>
          <p className="sub">
            Rent a spot on real things people see every day: a shirt someone
            wears, a suitcase that travels, a laptop lid that opens at every
            meetup.
          </p>
          <div>
            <a className="find" href={APP_URL}>
              Find a spot
            </a>
          </div>
        </div>

        <a className="live-card" href={APP_URL}>
          <div className="live-photo">
            <div className="live-grid" aria-hidden>
              {SPOTS.map((code, at) => (
                <span
                  key={code}
                  className={live?.taken.has(code) ? "cell" : "cell free"}
                >
                  <i /><i /><i /><i />
                  <b>{at + 1}</b>
                </span>
              ))}
            </div>
            <i className="crop tl" /><i className="crop tr" />
            <i className="crop bl" /><i className="crop br" />
            {running && (
              <span className="now-pill">
                <span className="dot" />
                NOW SHOWING
              </span>
            )}
          </div>
          <div className="live-info">
            <span className="live-name">{live?.title ?? "Shirt No. 1"}</span>
            <span className="live-cd" suppressHydrationWarning>
              {running ? countdown(live.closesAt - now) : ""}
            </span>
            <span className="live-sub">
              {live ? `${live.taken.size} of ${live.spots} spots taken` : ""}
            </span>
            <span className="live-sub">{running ? "left in this auction" : ""}</span>
          </div>
        </a>
      </div>
    </main>
  );
}

/** Сколько осталось торгу: крупно дни, дальше часы-минуты-секунды. */
function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}
