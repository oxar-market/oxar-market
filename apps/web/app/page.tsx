"use client";

import { useEffect, useRef, useState } from "react";
import { ThingStage, type Stage } from "@oxar/stage";

/**
 * Лендинг на oxar.app по дизайн-борду: один экран, слева манифест и одна
 * дверь «Find a spot», справа живая афиша самого горячего торга - фото вещи,
 * в занятых местах настоящие логотипы лидеров, свободные стоят контуром.
 *
 * Какую вещь показывать, решают деньги: берётся вещь с наибольшей суммой
 * лидирующих ставок - у неё и есть хайп. Ставить с лендинга нельзя намеренно:
 * афиша зовёт внутрь, торг живёт в приложении.
 *
 * Тема двухцветная и переключается здесь же: лендинг - первое место, где
 * палитра живёт переменными, тёмные значения взяты из дизайн-борда.
 *
 * Живые данные приезжают клиентом обычным fetch: SDK ради двух запросов не
 * нужен. Без ключей или без сети карточка честно статична.
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
  /** Код места - логотип лидера. Занято то, у чего есть запись. */
  art: Record<string, string>;
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
    "lots?status=eq.open&select=id,closes_at,thing_id,thing_spots(code),things:thing_id(title)",
  )) as
    | {
        id: string;
        closes_at: string;
        thing_id: string;
        thing_spots: { code: string } | null;
        things: { title: string } | null;
      }[]
    | null;
  if (!lots || lots.length === 0) return null;

  // Верхняя ставка каждого лота: строки уже от высокой к низкой.
  const bids = (await rest(
    "lot_bids?select=lot_id,amount_cents,media_url&order=amount_cents.desc",
  )) as { lot_id: string; amount_cents: number; media_url: string }[] | null;
  const top = new Map<string, { amount: number; art: string }>();
  for (const bid of bids ?? []) {
    if (!top.has(bid.lot_id)) top.set(bid.lot_id, { amount: bid.amount_cents, art: bid.media_url });
  }

  // Вещь выбирают деньги: наибольшая сумма лидирующих ставок - самый хайп.
  const score = new Map<string, number>();
  for (const lot of lots) {
    score.set(lot.thing_id, (score.get(lot.thing_id) ?? 0) + (top.get(lot.id)?.amount ?? 0));
  }
  const hottest = [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const featured = lots.filter((one) => one.thing_id === hottest);

  const art: Record<string, string> = {};
  for (const lot of featured) {
    const lead = top.get(lot.id);
    if (lead && lot.thing_spots?.code) art[lot.thing_spots.code] = lead.art;
  }

  return {
    title: featured[0].things?.title ?? "Shirt No. 1",
    closesAt: Math.min(...featured.map((one) => Date.parse(one.closes_at))),
    art,
    spots: featured.length,
  };
}

type Theme = "light" | "dark";

export default function Home() {
  const [live, setLive] = useState<Live | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Тема: запомненная, иначе системная. Ставится атрибутом на html, чтобы
  // фон страницы переключался целиком, а не только внутри main.
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    const saved = window.localStorage.getItem("oxar.theme");
    const system = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(saved === "dark" || saved === "light" ? saved : system);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  function flipTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("oxar.theme", next);
  }

  useEffect(() => {
    void loadLive().then(setLive);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const running = live !== null && live.closesAt > now;
  const taken = live ? Object.keys(live.art).length : 0;

  // Чем показывать вещь: фото или той же сценой, что на торге. 3D включается
  // рукой: мегабайт модели не должен грузиться раньше, чем его попросили.
  const [look, setLook] = useState<"photo" | "live">("photo");
  const stage = useRef<Stage | null>(null);

  // Логотипы лидеров встают на модель теми же местами, что и в приложении.
  // Картинки из чужого домена просят crossOrigin, иначе канвас их не примет.
  function dress() {
    if (!live) return;
    for (const [code, art] of Object.entries(live.art)) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => stage.current?.show(code, image);
      image.src = art;
    }
  }

  return (
    <main className="land">
      <header className="land-top">
        <span className="wordmark">OXAR</span>
        <span className="land-side">
          <span className="tagline">Ad space on physical things</span>
          <button
            type="button"
            className="theme-flip"
            onClick={flipTheme}
            aria-label="Switch theme"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </span>
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

        {/* Карточка перестала быть одной ссылкой: в 3D вещь крутят, и жест
            вращения не должен уводить на другой сайт. Дверь - нижняя полоса
            и кнопка Find a spot. */}
        <div className="live-card">
          <div className={look === "live" ? "live-photo in3d" : "live-photo"}>
            {look === "live" ? (
              <div className="live-stage">
                <ThingStage
                  picked={null}
                  onPick={() => {}}
                  stage={stage}
                  onReady={dress}
                />
              </div>
            ) : (
              <>
                <div className="live-grid" aria-hidden>
                  {SPOTS.map((code, at) => {
                    const art = live?.art[code];
                    return (
                      <span key={code} className={art ? "cell" : "cell free"}>
                        <i /><i /><i /><i />
                        {art ? (
                          // Настоящий логотип лидера: то, что напечатают,
                          // если никто не перебьёт. Ставить - внутри.
                          <img src={art} alt="" loading="lazy" />
                        ) : (
                          <b>{at + 1}</b>
                        )}
                      </span>
                    );
                  })}
                </div>
                <i className="crop tl" /><i className="crop tr" />
                <i className="crop bl" /><i className="crop br" />
              </>
            )}
            {running && (
              <span className="now-pill">
                <span className="dot" />
                NOW SHOWING
              </span>
            )}
            <span className="look-flip">
              {(["photo", "live"] as const).map((one) => (
                <button
                  key={one}
                  type="button"
                  className={look === one ? "look-pick on" : "look-pick"}
                  onClick={() => setLook(one)}
                >
                  {one === "photo" ? "Photo" : "3D"}
                </button>
              ))}
            </span>
          </div>
          <a className="live-info" href={APP_URL}>
            <span className="live-name">{live?.title ?? "Shirt No. 1"}</span>
            <span className="live-cd" suppressHydrationWarning>
              {running ? countdown(live.closesAt - now) : ""}
            </span>
            <span className="live-sub">
              {live ? `${taken} of ${live.spots} spots taken - bid inside` : ""}
            </span>
            <span className="live-sub">{running ? "left in this auction" : ""}</span>
          </a>
        </div>
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
