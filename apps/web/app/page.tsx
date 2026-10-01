"use client";

import { useEffect, useRef, useState } from "react";
import { SOON, ThingStage, type Stage } from "@oxar/stage";

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

/**
 * Где места лежат на снимке: левый край, верх, ширина, высота - процентами
 * стороны кадра, в порядке SPOTS. Те же координаты, что у фото-режима в
 * приложении (TEMP_FRONT_QUADS), - они перенесены с 3D-модели, поэтому сетка
 * на лендинге, в приложении и на модели стоит одинаково.
 */
const CELLS: [number, number, number, number][] = [
  [38.46, 29.61, 6.35, 7.02],
  [46.80, 29.55, 6.62, 6.97],
  [55.24, 29.75, 6.53, 6.93],
  [38.57, 37.36, 5.98, 7.01],
  [46.74, 37.33, 6.74, 7.04],
  [55.65, 37.50, 6.52, 6.94],
  [38.63, 45.23, 5.83, 7.01],
  [46.76, 45.22, 6.68, 6.99],
  [55.89, 45.29, 6.53, 6.97],
];

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
    "lots?status=eq.open&select=id,closes_at,thing_id,thing_spots(code),things:thing_id(title,house,active)",
  )) as
    | {
        id: string;
        closes_at: string;
        thing_id: string;
        thing_spots: { code: string } | null;
        things: { title: string; house: boolean; active: boolean } | null;
      }[]
    | null;
  // Лендинг - витрина наших вещей: афиша рисует футболку по нашей модели
  // и снимку, и вещь продавца на ней легла бы чужими пятнами.
  const ours = (lots ?? []).filter((one) => one.things && one.things.active && one.things.house);
  if (ours.length === 0) return null;

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
  for (const lot of ours) {
    score.set(lot.thing_id, (score.get(lot.thing_id) ?? 0) + (top.get(lot.id)?.amount ?? 0));
  }
  const hottest = [...score.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const featured = ours.filter((one) => one.thing_id === hottest);

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

/** Последний закрытый торг нашей вещи: что продали, кому и на ком она будет. */
type Past = {
  title: string;
  closedAt: number;
  raisedCents: number;
  logos: { url: string; brand: string }[];
  /** Логотипы победителей по местам: ими одевается сама вещь, как у живого торга. */
  art: Record<string, string>;
  worn: { by: string | null; where: string | null; when: string | null };
};

async function loadPast(): Promise<Past | null> {
  const lots = (await rest(
    "lots?status=eq.won&rehearsal=eq.false&select=id,closes_at,thing_id,thing_spots:spot_id(code),things:thing_id(title,house,active)&order=closes_at.desc&limit=100",
  )) as
    | {
        id: string;
        closes_at: string;
        thing_id: string;
        thing_spots: { code: string } | null;
        things: { title: string; house: boolean; active: boolean } | null;
      }[]
    | null;
  const ours = (lots ?? []).filter((one) => one.things?.house && one.things.active);
  const last = ours[0];
  if (!last) return null;
  // Торг - это вещь и день закрытия: у вещи их бывает несколько.
  const day = last.closes_at.slice(0, 10);
  const same = ours.filter((one) => one.thing_id === last.thing_id && one.closes_at.slice(0, 10) === day);

  const bids = (await rest(
    `lot_bids?lot_id=in.(${same.map((one) => one.id).join(",")})&select=lot_id,amount_cents,media_url,brand,created_at&order=amount_cents.desc,created_at.asc`,
  )) as { lot_id: string; amount_cents: number; media_url: string; brand: string }[] | null;
  const top = new Map<string, { amount_cents: number; media_url: string; brand: string }>();
  for (const bid of bids ?? []) if (!top.has(bid.lot_id)) top.set(bid.lot_id, bid);

  // Поля о носке отдельным запросом: их может ещё не быть в базе, и тогда
  // карточка просто пишет «To be announced».
  const worn = ((await rest(
    `things?id=eq.${last.thing_id}&select=worn_by,worn_where,worn_when`,
  )) as { worn_by: string | null; worn_where: string | null; worn_when: string | null }[] | null)?.[0];

  // Победитель каждого места - тем же ключом, что у живого торга: так вещь
  // одевается одним и тем же кодом, и прошлый торг видно на футболке, а не
  // строчкой логотипов под ней.
  const art: Record<string, string> = {};
  for (const lot of same) {
    const lead = top.get(lot.id);
    if (lead && lot.thing_spots?.code) art[lot.thing_spots.code] = lead.media_url;
  }

  return {
    title: last.things?.title ?? "",
    closedAt: Date.parse(last.closes_at),
    raisedCents: [...top.values()].reduce((sum, one) => sum + one.amount_cents, 0),
    logos: [...top.values()].map((one) => ({ url: one.media_url, brand: one.brand })),
    art,
    worn: { by: worn?.worn_by ?? null, where: worn?.worn_where ?? null, when: worn?.worn_when ?? null },
  };
}

type Theme = "light" | "dark";

export default function Home() {
  const [live, setLive] = useState<Live | null>(null);
  // Торги доехали: до этого «торга нет» - не факт, а ожидание.
  const [loaded, setLoaded] = useState(false);
  const [past, setPast] = useState<Past | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Тема: запомненная, иначе светлая. Ставится атрибутом на html, чтобы
  // фон страницы переключался целиком, а не только внутри main.
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    if (window.localStorage.getItem("oxar.theme") === "dark") setTheme("dark");
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
    void loadLive().then((found) => {
      setLive(found);
      setLoaded(true);
    });
    void loadPast().then(setPast);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const running = live !== null && live.closesAt > now;
  // Между торгами афиша не показывает прошлую вещь как будто живую: вместо
  // неё знак вопроса и прямые слова, что следующая вещь ещё не объявлена.
  const between = loaded && live === null;
  const taken = live ? Object.keys(live.art).length : 0;

  // Чем показывать вещь: фото или той же сценой, что на торге. 3D включается
  // рукой: мегабайт модели не должен грузиться раньше, чем его попросили.
  const [look, setLook] = useState<"photo" | "live">("photo");
  const stage = useRef<Stage | null>(null);

  // У прошлого торга свой переключатель и своя сцена. Общие были бы хуже:
  // включив 3D на одном слайде, человек получил бы вторую сцену на соседнем,
  // которую не просил, - а это второй мегабайт и второй холст WebGL.
  const [pastLook, setPastLook] = useState<"photo" | "live">("photo");
  const pastStage = useRef<Stage | null>(null);

  // Какой слайд открыт и чем его листают. Полоса прокрутки своя у каждого
  // браузера, поэтому сами слайды двигаем скроллом, а стрелки и точки только
  // просят его переехать.
  const rail = useRef<HTMLDivElement | null>(null);
  const [slide, setSlide] = useState(0);
  function go(to: number) {
    const el = rail.current;
    if (!el) return;
    el.scrollTo({ left: to * el.clientWidth, behavior: "smooth" });
  }

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

  /** То же для прошлого торга: на вещи стоят логотипы, которые победили. */
  function dressPast() {
    if (!past) return;
    for (const [code, art] of Object.entries(past.art)) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => pastStage.current?.show(code, image);
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
        {/* Карточка стала каруселью: следующая вещь (или идущий торг) первым
            слайдом, прошлый торг вторым. Прежде прошлый висел отдельной
            плашкой внизу страницы - списком логотипов под заголовком, - и
            читался как сноска. Здесь он показан на самой вещи и той же
            карточкой, что живой: тем же кадром, тем же 3D, теми же местами. */}
        <div className="live-wrap">
        <div
          className="live-rail"
          ref={rail}
          onScroll={(event) => {
            const el = event.currentTarget;
            setSlide(Math.round(el.scrollLeft / el.clientWidth));
          }}
        >
        {between ? (
          <div className="live-card">
            <div className="live-photo in3d">
              <div className="live-stage">
                <ThingStage
                  shape={SOON}
                  picked={null}
                  onPick={() => {}}
                  stage={stage}
                  onReady={() => stage.current?.look("ghost")}
                />
              </div>
              <span className="now-pill">
                <span className="dot" />
                NEXT THING
              </span>
            </div>
            <a className="live-info" href={APP_URL}>
              <span className="live-name">Not announced yet</span>
              <span className="live-cd" />
              <span className="live-sub">
                What it is, who has it, where and when - we say all of it before bidding opens.
              </span>
            </a>
          </div>
        ) : (
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
                {/* Снимок и сетка в одном квадратном кадре: клетки стоят
                    процентами этого кадра и едут вместе со снимком при
                    любом размере карточки. */}
                <div className="live-frame">
                <img className="live-shot" src="/TEMP-photo-front.webp" alt="" />
                <div className="live-grid" aria-hidden>
                  {SPOTS.map((code, at) => {
                    const art = live?.art[code];
                    const [left, top, width, height] = CELLS[at];
                    return (
                      <span
                        key={code}
                        className={art ? "cell" : "cell free"}
                        style={{
                          left: `${left}%`,
                          top: `${top}%`,
                          width: `${width}%`,
                          height: `${height}%`,
                        }}
                      >
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
        )}

        {/* Прошлый торг - второй слайд: та же вещь с логотипами победителей на
            ней, той же карточкой, что живая. */}
        {past && (
          <div className="live-card">
            <div className={pastLook === "live" ? "live-photo in3d" : "live-photo"}>
              {pastLook === "live" ? (
                <div className="live-stage">
                  <ThingStage
                    picked={null}
                    onPick={() => {}}
                    stage={pastStage}
                    onReady={dressPast}
                  />
                </div>
              ) : (
                <div className="live-frame">
                  <img className="live-shot" src="/TEMP-photo-front.webp" alt="" />
                  <div className="live-grid" aria-hidden>
                    {SPOTS.map((code, at) => {
                      const art = past.art[code];
                      const [left, top, width, height] = CELLS[at];
                      return (
                        <span
                          key={code}
                          className={art ? "cell" : "cell free"}
                          style={{
                            left: `${left}%`,
                            top: `${top}%`,
                            width: `${width}%`,
                            height: `${height}%`,
                          }}
                        >
                          <i /><i /><i /><i />
                          {art ? <img src={art} alt="" loading="lazy" /> : <b>{at + 1}</b>}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <span className="now-pill done">SOLD</span>
              <span className="look-flip">
                {(["photo", "live"] as const).map((one) => (
                  <button
                    key={one}
                    type="button"
                    className={pastLook === one ? "look-pick on" : "look-pick"}
                    onClick={() => setPastLook(one)}
                  >
                    {one === "photo" ? "Photo" : "3D"}
                  </button>
                ))}
              </span>
            </div>
            <a className="live-info" href={APP_URL}>
              <span className="live-name">{past.title}</span>
              <span className="live-cd">{usd(past.raisedCents)}</span>
              <span className="live-sub">
                {past.logos.length} {past.logos.length === 1 ? "logo" : "logos"} placed
                {past.worn.by ? ` \u00b7 ${past.worn.by}` : ""}
                {past.worn.where ? ` \u00b7 ${past.worn.where}` : ""}
                {past.worn.when ? ` \u00b7 ${past.worn.when}` : ""}
              </span>
              <span className="live-sub">
                raised, closed{" "}
                {new Date(past.closedAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </a>
          </div>
        )}
        </div>

        {/* Стрелки и точки стоят, только когда листать есть что. Одни без
            других читались бы хуже: стрелка говорит «можно вперёд», точки -
            «сколько всего и где ты сейчас». */}
        {past && (
          <>
            <button
              type="button"
              className="live-arrow back"
              aria-label="Previous"
              disabled={slide === 0}
              onClick={() => go(slide - 1)}
            >
              &larr;
            </button>
            <button
              type="button"
              className="live-arrow next"
              aria-label="Next"
              disabled={slide === 1}
              onClick={() => go(slide + 1)}
            >
              &rarr;
            </button>
            <div className="live-pager">
              {[0, 1].map((at) => (
                <button
                  key={at}
                  type="button"
                  className={at === slide ? "on" : ""}
                  aria-label={at === 0 ? "Show this auction" : "Show the last auction"}
                  onClick={() => go(at)}
                />
              ))}
            </div>
          </>
        )}
        </div>
      </div>
    </main>
  );
}


/** Доллары из центов: «$172.80». */
function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Сколько осталось торгу: крупно дни, дальше часы-минуты-секунды. */
function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}
