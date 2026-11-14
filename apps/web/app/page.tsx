"use client";

import { useEffect, useRef, useState } from "react";
import { isOpen, nextClose } from "@oxar/core";
import { houseShape, SOON, ThingStage, type Stage } from "@oxar/stage";
import { loadSold, SoldCards, type Sold } from "./auctions.tsx";
import { MoneyFlow } from "./money-flow.tsx";
import { PixelField } from "./pixel-field.tsx";


/**
 * Кто, где, когда - три строки под полосой карточки, подпись над значением,
 * как в табличке на торге. Пусто - «Unknown»: у неназванной вещи строки
 * стоят те же, чтобы карточка не была пустой и обе читались одинаково.
 */
function WornRows({ worn }: { worn: { by: string | null; where: string | null; when: string | null } | null }) {
  const rows: [string, string | null][] = [
    ["Who has it", worn?.by ?? null],
    ["Where", worn?.where ?? null],
    ["When", worn?.when ?? null],
  ];
  return (
    <dl className="live-worn">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd className={value ? "" : "unknown"}>{value ?? "Unknown"}</dd>
        </div>
      ))}
    </dl>
  );
}

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

/**
 * Первый экран говорит о месте на том, на что смотрят люди, а не об ивентах
 * и не о крипте: продаём и на мероприятиях, и на кампаниях, и на вещах.
 */
const HEADLINE = "If people look at it, it's ad space.";

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
  id: string;
  title: string;
  tagline: string | null;
  /** Модель вещи: по ней сцена и разметка. Футболка - сцена по умолчанию. */
  model: string | null;
  /** Когда торг открывается; null - уже идёт. */
  opensAt: number | null;
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
    "lots?status=eq.open&select=id,opens_at,closes_at,thing_id,thing_spots(code),things:thing_id(title,tagline,model_url,house,prepared,active)",
  )) as
    | {
        id: string;
        opens_at: string | null;
        closes_at: string;
        thing_id: string;
        thing_spots: { code: string } | null;
        things: { title: string; tagline: string | null; model_url: string | null; house: boolean; prepared: boolean; active: boolean } | null;
      }[]
    | null;
  // Лендинг - витрина наших вещей: афиша рисует футболку по нашей модели
  // и снимку, и вещь продавца на ней легла бы чужими пятнами. Вещь, которую
  // мы подготовили и передали продавцу (ван Superteam), - тоже наша модель
  // и разметка: без неё идущий торг вана прятался за «Not announced yet».
  const ours = (lots ?? []).filter((one) => one.things && one.things.active && (one.things.house || one.things.prepared));
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

  // Открытие - по самому раннему лоту; лот без срока открытия уже идёт.
  const opens = featured.map((one) => (one.opens_at ? Date.parse(one.opens_at) : null));
  return {
    id: featured[0].thing_id,
    title: featured[0].things?.title ?? "Shirt No. 1",
    tagline: featured[0].things?.tagline ?? null,
    model: featured[0].things?.model_url || null,
    opensAt: opens.some((one) => one === null) ? null : Math.min(...(opens as number[])),
    closesAt: nextClose(featured.map((one) => Date.parse(one.closes_at)), Date.now()) ?? 0,
    art,
    spots: featured.length,
  };
}

/** Анонс: вещь, подготовленная нами под торг с объявленной датой. */
type Next = {
  id: string;
  title: string;
  model: string | null;
  opensAt: number;
  worn: { by: string | null; where: string | null; when: string | null };
};

/**
 * Ближайший анонс. Места подготовленной вещи до публикации - черновики,
 * публике их не видно, поэтому дата открытия берётся с самой вещи.
 */
async function loadNext(): Promise<Next | null> {
  const rows = (await rest(
    `things?prepared=eq.true&active=eq.true&opens_at=gt.${new Date().toISOString()}&select=id,title,model_url,hologram_url,opens_at,worn_by,worn_where,worn_when&order=opens_at.asc&limit=1`,
  )) as
    | { id: string; title: string; model_url: string | null; hologram_url: string | null; opens_at: string; worn_by: string | null; worn_where: string | null; worn_when: string | null }[]
    | null;
  const one = rows?.[0];
  if (!one) return null;
  return {
    id: one.id,
    title: one.title,
    // Голограмме хватает лёгкой копии: настоящая модель на первом экране тяжела.
    model: one.hologram_url || one.model_url || null,
    opensAt: Date.parse(one.opens_at),
    worn: { by: one.worn_by, where: one.worn_where, when: one.worn_when },
  };
}

/**
 * Цифры первого экрана - по всем торгам, кроме репетиций. Ставки считаются
 * все, вместе с перебитыми: это сколько люди готовы были поставить, а не
 * сколько ушло продавцам.
 */
type Stats = { totalCents: number; bidders: number; averageCents: number };

async function loadStats(): Promise<Stats | null> {
  const lots = (await rest("lots?rehearsal=eq.true&select=id")) as { id: string }[] | null;
  const bids = (await rest("lot_bids?select=lot_id,amount_cents,bidder_wallet")) as
    | { lot_id: string; amount_cents: number; bidder_wallet: string }[]
    | null;
  if (!lots || !bids) return null;
  const rehearsal = new Set(lots.map((one) => one.id));
  const real = bids.filter((bid) => !rehearsal.has(bid.lot_id));
  if (real.length === 0) return null;
  const totalCents = real.reduce((sum, bid) => sum + bid.amount_cents, 0);
  return {
    totalCents,
    bidders: new Set(real.map((bid) => bid.bidder_wallet)).size,
    averageCents: Math.round(totalCents / real.length),
  };
}

/** $13.7K, $233: круглые цифры читаются с первого взгляда. */
function money(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: cents >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: cents >= 1_000_000 ? 1 : 0,
  }).format(cents / 100);
}

type Theme = "light" | "dark";

export default function Home() {
  const [live, setLive] = useState<Live | null>(null);
  const [next, setNext] = useState<Next | null>(null);
  // Торги доехали: до этого «торга нет» - не факт, а ожидание.
  const [loaded, setLoaded] = useState(false);
  const [sold, setSold] = useState<Sold[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
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
    void loadSold().then(setSold);
    void loadNext().then(setNext);
    void loadStats().then(setStats);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Назначенный торг ещё не идёт: до открытия - отсчёт до старта, а не до конца.
  const scheduled = live !== null && live.opensAt !== null && live.opensAt > now;
  const running = live !== null && isOpen(live.closesAt, now) && !scheduled;
  // Наша вещь не футболка: снимка с сеткой у неё нет, только сцена её модели.
  const liveShape = houseShape(live?.model);
  // Между торгами афиша не показывает прошлую вещь как будто живую: вместо
  // неё знак вопроса и прямые слова, что следующая вещь ещё не объявлена.
  const between = loaded && live === null;
  const taken = live ? Object.keys(live.art).length : 0;

  // Чем показывать вещь: той же сценой, что на торге, или фото. Сначала 3D:
  // так сказали на показе 1 октября 2026 - вещь должна встречать объёмом, а
  // фото остаётся на переключателе. Цена - мегабайт модели на первом экране.
  const [look, setLook] = useState<"photo" | "live">("live");
  const liveLook = liveShape ? "live" : look;
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
    void stick(live.id);
  }

  // Купленные стикеры - туда же, где их клеит приложение: только
  // оплаченные (отметку ставит бот выплат по цепочке), в порядке покупок, по
  // наклейке на каждый купленный стикер. Не загрузившийся логотип оставляет
  // свою ячейку пустой, а не сдвигает остальных.
  async function stick(thingId: string) {
    const rows = (await rest(
      `stickers?thing_id=eq.${thingId}&paid_first=not.is.null&select=logo_url,size,paid_count&order=paid_first.asc`,
    )) as { logo_url: string; size: string; paid_count: number }[] | null;
    if (!rows?.length) return;
    const units = rows.flatMap((row) => Array.from({ length: row.paid_count }, () => row));
    const loaded = await Promise.all(
      units.map(
        (row) =>
          new Promise<{ image: HTMLImageElement; size: [number, number] } | null>((done) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => done({ image, size: row.size === "12x6" ? [12, 6] : [10, 10] });
            image.onerror = () => done(null);
            image.src = row.logo_url;
          }),
      ),
    );
    stage.current?.stickers(loaded);
  }

  return (
    <>
    <main className="land">
      <PixelField />
      <header className="land-top">
        <span className="wordmark">OXAR</span>
        <span className="land-side">
          <span className="tagline">Ad space on physical things</span>
          <a className="top-link" href="/sell">
            Sell a spot
          </a>
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

      <div className="hero">
        <h1>{HEADLINE}</h1>
        <div className="hero-go">
          <a className="find" href={APP_URL}>
            Find a spot
          </a>
          <a className="how" href="#how">
            See how it works
          </a>
        </div>
        <dl className={stats ? "hero-stats" : "hero-stats wait"}>
          <div>
            <dt>bid so far</dt>
            <dd>{stats ? money(stats.totalCents) : "$0"}</dd>
          </div>
          <div>
            <dt>bidders</dt>
            <dd>{stats ? stats.bidders.toLocaleString("en-US") : "0"}</dd>
          </div>
          <div>
            <dt>average bid</dt>
            <dd>{stats ? money(stats.averageCents) : "$0"}</dd>
          </div>
        </dl>
      </div>
    </main>

    <section className="live-section" aria-labelledby="live-title">
      <h2 id="live-title">Auctions</h2>
        {/* Карточка перестала быть одной ссылкой: в 3D вещь крутят, и жест
            вращения не должен уводить на другой сайт. Дверь - нижняя полоса
            и кнопка Find a spot. */}
        {/* Карточка стала каруселью: следующая вещь (или идущий торг) первым
            слайдом, прошлый торг вторым. Прежде прошлый висел отдельной
            плашкой внизу страницы - списком логотипов под заголовком, - и
            читался как сноска. Здесь он показан на самой вещи и той же
            карточкой, что живой: тем же кадром, тем же 3D, теми же местами. */}
        <div className="live-wrap">
        <div className="live-rail">
        {/* Ключи разные: обе карточки стоят в одной позиции дерева, и без
            ключа React оставлял сцену от первой, с футболкой, а знак вопроса
            так и не появлялся - сцена не меняет модель на лету. */}
        {between && next ? (
          // Между торгами, но следующий уже объявлен: голограмма его модели
          // и отсчёт до открытия.
          <div className="live-card" key={`next-${next.id}`}>
            <div className="live-photo in3d">
              <div className="live-stage">
                <ThingStage
                  shape={next.model ? { ...SOON, model: next.model, noun: "thing" } : SOON}
                  picked={null}
                  onPick={() => {}}
                  stage={stage}
                  onReady={() => stage.current?.look("ghost")}
                />
              </div>
              <span className="now-pill">
                <span className="dot" />
                NEXT UP
              </span>
            </div>
            <a className="live-info" href={`${APP_URL}/?thing=${next.id}`}>
              <span className="live-name">{next.title}</span>
              <span className="live-cd" suppressHydrationWarning>
                {countdown(Math.max(0, next.opensAt - now))}
              </span>
              <span className="live-sub">Bidding opens</span>
              <span className="live-sub" />
              <WornRows worn={next.worn} />
            </a>
          </div>
        ) : between ? (
          <div className="live-card" key="soon">
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
              {/* Та же сетка, что у прошлого торга: имя и слово справа, строка
                  под ними, три строки таблички. Так обе карточки одной высоты,
                  и под последней строкой нет пустоты. */}
              <span className="live-cd">Soon</span>
              <span className="live-sub">Bidding opens</span>
              <span className="live-sub" />
              <WornRows worn={null} />
            </a>
          </div>
        ) : (
        <div className="live-card" key="live">
          <div className={liveLook === "live" ? "live-photo in3d" : "live-photo"}>
            {liveLook === "live" ? (
              <div className="live-stage">
                {/* Сцену собираем, когда данные пришли: до них она собиралась
                    футболкой по умолчанию, писала «Loading the shirt» и
                    пересобиралась вещью торга - вторая загрузка подряд. */}
                {loaded && (
                  <ThingStage
                    // Сцена читает вещь один раз: модель приезжает с данными, и
                    // тогда сцена собирается заново уже её.
                    key={live?.model ?? "shirt"}
                    shape={liveShape}
                    picked={null}
                    onPick={() => {}}
                    stage={stage}
                    onReady={dress}
                  />
                )}
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
            {scheduled && (
              <span className="now-pill">
                <span className="dot" />
                NEXT UP
              </span>
            )}
            {!liveShape && (
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
            )}
          </div>
          <a className="live-info" href={APP_URL}>
            <span className="live-name">{live?.title ?? "Shirt No. 1"}</span>
            <span className="live-cd" suppressHydrationWarning>
              {running ? countdown(live.closesAt - now) : scheduled ? countdown((live.opensAt ?? now) - now) : ""}
            </span>
            <span className="live-sub">
              {live
                ? liveShape && live.tagline
                  ? live.tagline
                  : `${taken} of ${live.spots} spots taken - bid inside`
                : ""}
            </span>
            <span className="live-sub">
              {running ? "left in this auction" : scheduled ? "until bidding opens" : ""}
            </span>
          </a>
        </div>
        )}

        </div>

        </div>
        {sold.length > 0 && (
          <div className="sold">
            <h3>Past auctions</h3>
            <SoldCards sold={sold} />
          </div>
        )}
    </section>
    <MoneyFlow />
    </>
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
