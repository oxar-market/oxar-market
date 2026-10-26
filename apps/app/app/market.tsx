"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd, formatUsdFull, hasOpened } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import { houseShape, isShirt } from "@/lib/shape";
import { db } from "@/lib/session";
import {
  loadMarket,
  type HeldRow,
  type MarketThing,
  type UpcomingThing,
} from "@/lib/auction";
import { heroClock, left } from "@/lib/clock";
import { restingSlide } from "@/lib/slides";
import { Game } from "./game/game";
import { ResultsView } from "./results.tsx";
import { PastHero } from "./past.tsx";
import { PhotoView } from "./auction/photo.tsx";
import { SellerLine } from "./reviews.tsx";
import { SoonHologram } from "./soon.tsx";
import { Usdc } from "./usdc.tsx";
import { WornLine } from "./worn-line.tsx";
// TEMP_FRONT: тот же временный снимок и замер, что на торге.
import { TEMP_FRONT_QUADS, TEMP_SHOTS } from "./auction/temp-photo.ts";

/**
 * Маркет по дизайн-борду: «сцена и программа», как афиша театра с одним
 * залом. Наверху герой - самая горячая вещь во весь экран, под ним программа
 * списком (включается, когда вещей станет больше одной), прошедшие торги
 * строками, почта на новую вещь и игра тихой ссылкой.
 *
 * Вещей мало, и экран это не скрывает: каталог с фильтрами не наступит ещё
 * долго, а событие во времени - формат, который держит и одну вещь, и сто.
 */

type Mail = "idle" | "sending" | "done" | "failed";

export function Market({ onOpenAuction }: { onOpenAuction: (thingId?: string) => void }) {
  const [things, setThings] = useState<MarketThing[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingThing[]>([]);
  // Пилоты - строками «Past», в карусель не идут: у них нет ни ставок, ни суммы.
  const [pilots, setPilots] = useState<HeldRow[]>([]);
  const [held, setHeld] = useState<HeldRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void loadMarket().then((loaded) => {
      setThings(loaded.things);
      setUpcoming(loaded.upcoming);
      setPilots(loaded.pilots);
      setHeld(loaded.held);
    });
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const [email, setEmail] = useState("");
  const [mail, setMail] = useState<Mail>("idle");
  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (mail === "sending") return;
    if (!email.includes("@") || email.length < 5) return setMail("failed");
    setMail("sending");
    if (!db) return setMail("failed");
    const { error } = await db
      .from("waitlist")
      .insert({ contact: email.trim(), side: "buyer" });
    setMail(!error || error.code === "23505" ? "done" : "failed");
  }

  // Игра спрятана за тихой ссылкой: она пасхалка, а не витрина.
  const [gameOn, setGameOn] = useState(false);

  // Герой по умолчанию живой: та же модель, что на торге, с реальными
  // логотипами лидеров. Фото остаётся вторым видом.
  const [heroLook, setHeroLook] = useState<"live" | "photo">("live");
  // У каждой вещи в карусели своя сцена: общая на всех держала бы последнюю
  // собранную, и логотипы ложились бы не на ту вещь.
  const heroStages = useRef(new Map<string, { current: Stage | null }>());
  function stageOf(id: string): { current: Stage | null } {
    const known = heroStages.current.get(id);
    if (known) return known;
    const made = { current: null as Stage | null };
    heroStages.current.set(id, made);
    return made;
  }
  // Логотипы лидеров - на саму вещь: и нашу, и вещь продавца с моделью (ван).
  function dressHero(thing: MarketThing) {
    for (const [code, url] of Object.entries(thing.art)) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => stageOf(thing.id).current?.show(code, image);
      image.src = url;
    }
  }

  // Карусель героев: идущие торги, за ними анонсы. Какой слайд на экране,
  // знают и точки под ней, и строки списка - строка текущего подсвечена.
  const rail = useRef<HTMLDivElement | null>(null);
  const [slide, setSlide] = useState(0);
  // Прошедшие торги - последними слайдами, три свежих: карусель показывает,
  // что здесь уже печатали, и листается, даже когда живого торга нет.
  const recent = held.slice(0, 3);
  const slides = things.length + upcoming.length + recent.length;
  // Высота карусели - по текущему слайду, а не по самому высокому: иначе
  // под короткой карточкой «Unknown item» лежала пустота в рост карточки
  // прошлого торга, и полоса недели уезжала вниз.
  useEffect(() => {
    const el = rail.current;
    const current = el?.children[slide] as HTMLElement | undefined;
    if (!el || !current) return;
    const fit = () => {
      el.style.height = `${current.offsetHeight}px`;
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(current);
    return () => watch.disconnect();
  }, [slide, slides]);
  // Листание по кругу: с последнего слайда вперёд - на первый. Страница
  // едет к карусели только с тапа по строке внизу; стрелки и точки стоят
  // рядом с ней, и лишний сдвиг читался бы прыжком.
  function go(to: number, reveal = false) {
    const el = rail.current;
    if (!el || slides === 0) return;
    const at = (to + slides) % slides;
    el.scrollTo({ left: at * el.clientWidth, behavior: "smooth" });
    if (reveal) revealRail();
  }
  // Страницу к карусели двигаем окном, а не scrollIntoView самой ленты:
  // Safari на iPhone этим вызовом обрывал её плавную прокрутку, и лента
  // вставала посреди двух слайдов - полкарточки соседа слева, текст обрезан
  // справа.
  function revealRail() {
    const el = rail.current;
    if (!el) return;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: "smooth" });
  }
  // Страховка на тот же случай: прокрутка ленты затихла, пальца на ней нет,
  // а слайд стоит не на месте - доводим до ближайшего. Привязка Safari к
  // слайду после оборванной прокрутки сама не срабатывает.
  const touching = useRef(false);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function settleSoon() {
    clearTimeout(idle.current);
    idle.current = setTimeout(() => {
      const el = rail.current;
      if (!el || touching.current) return;
      const rest = restingSlide(el.scrollLeft, el.clientWidth, slides);
      if (rest.off) el.scrollTo({ left: rest.left, behavior: "smooth" });
    }, 150);
  }
  useEffect(() => () => clearTimeout(idle.current), []);

  // Программа по дням. Идущий торг стоит в дне закрытия, назначенный - в
  // дне открытия, вещь без даты - отдельной группой в конце. Полоса из семи
  // дней от сегодня метит точкой дни, где торг открывается или закрывается.
  const [dayOn, setDayOn] = useState<string | null>(null);
  const marks = new Map<string, Set<"open" | "close">>();
  const mark = (at: number, kind: "open" | "close") => {
    const key = dayKey(at);
    marks.set(key, (marks.get(key) ?? new Set()).add(kind));
  };
  const byDay = new Map<string, Group>();
  things.forEach((one, at) => {
    const closes = Date.parse(one.closesAt);
    const opens = one.opensAt === null ? null : Date.parse(one.opensAt);
    mark(closes, "close");
    if (opens !== null) mark(opens, "open");
    const later = !hasOpened(opens, now);
    const anchor = later ? (opens as number) : closes;
    const key = dayKey(anchor);
    const group = byDay.get(key) ?? { at: anchor, title: dayTitle(anchor, now), rows: [] };
    group.rows.push({
      id: one.id,
      slide: at,
      name: one.title,
      price: one.topCents > 0 ? formatUsd(one.topCents) : "-",
      time: later
        ? `opens in ${left(opens as number, now)}`
        : `closes in ${left(closes, now)}`,
    });
    byDay.set(key, group);
  });
  // Анонс с объявленной датой стоит в дне открытия, как назначенный торг.
  upcoming.forEach((one, at) => {
    const opens = one.opensAt === null ? null : Date.parse(one.opensAt);
    if (opens === null || hasOpened(opens, now)) return;
    mark(opens, "open");
    const key = dayKey(opens);
    const group = byDay.get(key) ?? { at: opens, title: dayTitle(opens, now), rows: [] };
    group.rows.push({ id: one.id, slide: things.length + at, name: one.title, price: "-", time: `opens in ${left(opens, now)}` });
    byDay.set(key, group);
  });
  const groups = [...byDay.entries()].sort((a, b) => a[1].at - b[1].at);
  const undated = upcoming.flatMap((one, at) => (one.opensAt === null ? [{ one, at }] : []));
  if (undated.length > 0) {
    groups.push([
      "tba",
      {
        at: Infinity,
        title: "Date to be announced",
        rows: undated.map(({ one, at }) => ({
          id: one.id,
          slide: things.length + at,
          name: one.title,
          price: "-",
          time: "Coming soon",
        })),
      },
    ]);
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const week = Array.from({ length: 7 }, (_, at) => {
    const one = new Date(start);
    one.setDate(start.getDate() + at);
    return one;
  });

  // Итоги прошедшего торга открываются поверх маркета, одной кнопкой назад:
  // торги под ними не пересобираются. Пилот Delora - такая же строка.
  const [result, setResult] = useState<HeldRow | null>(null);
  if (result) {
    return (
      <section className="screen">
        <h1 className="mk-title">
          OXAR <span>Market</span>
        </h1>
        <ResultsView held={result} onBack={() => setResult(null)} />
      </section>
    );
  }

  return (
    <section className="screen market">
      <h1 className="mk-title">
        OXAR <span>Market</span>
      </h1>

      <div className="hero-wrap">
      <div
        className="hero-rail"
        ref={rail}
        onScroll={(event) => {
          const el = event.currentTarget;
          setSlide(restingSlide(el.scrollLeft, el.clientWidth, slides).index);
          settleSoon();
        }}
        onTouchStart={() => {
          touching.current = true;
        }}
        onTouchEnd={() => {
          touching.current = false;
          settleSoon();
        }}
        onTouchCancel={() => {
          touching.current = false;
          settleSoon();
        }}
      >
      {things.map((one) => {
        const opensAt = one.opensAt === null ? null : Date.parse(one.opensAt);
        const opensLater = !hasOpened(opensAt, now);
        // Наша вещь не футболка: снимков для фото-режима у неё нет, только сцена.
        const ownModel = !one.seller && !isShirt(one.model);
        // Вещь продавца без снимков, но с моделью (ван): показываем модель,
        // а не пустую рамку.
        const sellerScene = Boolean(one.seller && !one.photo && houseShape(one.model));
        return (
          <div className="hero" key={one.id}>
            <div
              className={
                ((heroLook === "live" || ownModel) && !one.seller) || (one.seller && (opensLater || sellerScene))
                  ? "hero-photo in3d"
                  : "hero-photo"
              }
            >
              {one.seller && opensLater ? (
                // Торг продавца назначен, но не открыт - знак вопроса. Вещь,
                // подготовленную нами, - голограммой её модели.
                <div className="hero-stage">
                  <SoonHologram model={one.hologram} />
                </div>
              ) : sellerScene ? (
                <div className="hero-stage">
                  <ThingStage
                    shape={houseShape(one.model)}
                    picked={null}
                    onPick={() => {}}
                    stage={stageOf(one.id)}
                    onReady={() => dressHero(one)}
                  />
                </div>
              ) : one.seller ? (
                // Вещь продавца: снимок, который он прислал. Модель к ней
                // прикладываем мы, и видна она на странице торга.
                one.photo && (
                  <button
                    type="button"
                    className="hero-shot"
                    onClick={() => onOpenAuction(one.id)}
                  >
                    <img src={one.photo} alt={one.title} />
                  </button>
                )
              ) : heroLook === "live" || ownModel ? (
                <div className="hero-stage">
                  <ThingStage
                    shape={houseShape(one.model)}
                    picked={null}
                    onPick={() => {}}
                    stage={stageOf(one.id)}
                    onReady={() => dressHero(one)}
                  />
                </div>
              ) : (
                // Места на снимке несут логотипы лидеров, как на торге. Тап
                // по месту ведёт на торг прямо к нему.
                <PhotoView
                  shot={TEMP_SHOTS[0] as string}
                  quads={TEMP_FRONT_QUADS}
                  drawFrames
                  picked=""
                  onPick={(code) => {
                    window.sessionStorage.setItem("oxar.jump", code);
                    onOpenAuction();
                  }}
                  art={one.art}
                />
              )}
              {!one.seller && !ownModel && (
              <span className="look-flip">
                {(["live", "photo"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    className={heroLook === view ? "look-pick on" : "look-pick"}
                    onClick={() => setHeroLook(view)}
                  >
                    {view === "live" ? "3D" : "Photo"}
                  </button>
                ))}
              </span>
              )}
            </div>
            {/* Текст - колонкой слева от вещи на широком экране и под ней на
                телефоне. Часы и суммы - в полосе цифр под каруселью. */}
            <div className="hero-text">
              <span className="hero-pill">
                <span className={opensLater ? "dot soon" : "dot"} />
                {opensLater ? "Opens soon" : "Live auction"}
              </span>
              <h2 className="hero-name">{one.title}</h2>
              {one.tagline && <p className="hero-who">{one.tagline}</p>}
              {one.about && <p className="hero-about">{one.about}</p>}
              <WornLine worn={one.worn} />
              {one.owner && <SellerLine seller={one.owner} house={one.house} />}
              <div className="hero-facts">
                <span>
                  <b>{one.spots}</b> {one.spots === 1 ? "spot" : "spots"}
                </span>
                <span>
                  <b>{one.bids}</b> {one.bids === 1 ? "bid" : "bids"}
                </span>
                {one.topCents > 0 && (
                  <span>
                    Top bid <b>{formatUsdFull(one.topCents)}</b>
                  </span>
                )}
              </div>
              <button
                type="button"
                className="primary hero-go"
                onClick={() => onOpenAuction(one.seller ? one.id : undefined)}
              >
                View auction <span aria-hidden>&rarr;</span>
              </button>
            </div>
          </div>
        );
      })}

      {upcoming.map((one) => (
        <Upcoming key={one.id} thing={one} onOpen={() => onOpenAuction(one.id)} />
      ))}

      {/* Последний закрытый торг - последним слайдом, и когда живые идут
          тоже: он показывает, что здесь уже печатали, а это и есть довод
          ставить. Прежде он стоял плашкой под каруселью, и только в паузу. */}
      {recent.map((one) => (
        <PastHero key={one.thingId + one.closesAt} held={one} onOpen={() => setResult(one)} />
      ))}
      </div>
      {/* Стрелки по бокам вещи: точки под каруселью легко не заметить. */}
      {slides > 1 && (
        <>
          <button
            type="button"
            className="hero-arrow prev"
            aria-label="Previous thing"
            onClick={() => go(slide - 1)}
          >
            &larr;
          </button>
          <button
            type="button"
            className="hero-arrow next"
            aria-label="Next thing"
            onClick={() => go(slide + 1)}
          >
            &rarr;
          </button>
        </>
      )}
      </div>

      {slides > 1 && (
        <div className="hero-pager">
          {Array.from({ length: slides }, (_, at) => (
            <button
              key={at}
              type="button"
              className={at === slide ? "on" : ""}
              aria-label={`Show thing ${at + 1}`}
              onClick={() => go(at)}
            />
          ))}
        </div>
      )}

      <HeroStats
        live={slide < things.length ? things[slide] : undefined}
        soon={slide >= things.length ? upcoming[slide - things.length] : undefined}
        past={slide >= things.length + upcoming.length ? recent[slide - things.length - upcoming.length] : undefined}
        now={now}
      />

      <div className="mk-strip">
        {week.map((one) => {
          const key = dayKey(one.getTime());
          const kinds = marks.get(key);
          const dot = kinds?.has("close") ? " close" : kinds?.has("open") ? " open" : "";
          return (
            <button
              key={key}
              type="button"
              className={key === (dayOn ?? dayKey(now)) ? "mk-day on" : "mk-day"}
              disabled={!byDay.has(key) && key !== dayKey(now)}
              onClick={() => {
                setDayOn(key);
                // Сегодня без событий - точка возврата: к карусели наверху.
                if (!byDay.has(key)) return revealRail();
                document
                  .getElementById(`mk-day-${key}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <span className="mk-day-dow">
                {one.toLocaleDateString("en-US", { weekday: "short" })}
              </span>
              <span className="mk-day-date">{one.getDate()}</span>
              <span className={`mk-day-dot${dot}`} />
            </button>
          );
        })}
      </div>

      {groups.map(([key, group]) => (
        <div key={key} className="mk-group">
          <h2 className="mk-head" id={`mk-day-${key}`}>
            {group.title}
          </h2>
          {group.rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className="mk-row"
              onClick={() => go(row.slide, true)}
            >
              <span className="mk-row-name">{row.name}</span>
              <span className="mk-row-price">{row.price}</span>
              <span className="mk-row-time" suppressHydrationWarning>
                {row.time}
              </span>
            </button>
          ))}
        </div>
      ))}

      <h2 className="mk-head">Past auctions</h2>
      {/* Карточками, свежие первыми: пилот - такая же карточка истории, как
          торги, и стоит по своей дате. Картинка - снимок, а не сцена: четыре
          живые модели рядом грузили бы телефон. */}
      <div className="past-grid">
        {[...held, ...pilots]
          .sort((a, b) => Date.parse(b.closesAt) - Date.parse(a.closesAt))
          .map((one) => (
            <button
              type="button"
              className="past-card"
              key={one.closesAt + one.title}
              onClick={() => setResult(one)}
            >
              <span className="past-cover">
                {one.cover && (
                  <img
                    className={one.cover.startsWith("/models/") ? "still" : undefined}
                    src={one.cover}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </span>
              <span className="past-body">
                <span className="past-name">{one.title}</span>
                <span className="past-kind">
                  {one.pilot ? "Pilot" : "Auction"} · {one.pilot ? "Placed" : "Ended"}
                </span>
                <span className="past-sum">
                  {one.pilot ? (
                    <span className="past-partner">with {one.pilot.partner || "a partner"}</span>
                  ) : (
                    <>
                      <span>{formatUsdFull(one.raisedCents)}</span>
                      <Usdc />
                    </>
                  )}
                </span>
                <span className="past-foot">
                  <span>{one.pilot ? "No bidding" : `${one.bids} ${one.bids === 1 ? "bid" : "bids"}`}</span>
                  <span>{stamp(one.closesAt)}</span>
                </span>
              </span>
            </button>
          ))}
      </div>
      {held.length === 0 && things[0] && (
        <p className="held-empty">
          No auction has closed yet. {things[0].title} will be the first here
          after it closes on{" "}
          {new Date(things[0].closesAt).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
          .
        </p>
      )}

      <div className="mail-card">
        <span className="mail-head">Join the waitlist</span>
        {mail === "done" ? (
          <p className="lead">You are on the waitlist. We will write when a new auction opens.</p>
        ) : (
          <>
            <form className="join" onSubmit={join}>
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (mail === "failed") setMail("idle");
                }}
                placeholder="you@example.com"
                aria-label="Your email"
                autoComplete="email"
              />
              <button type="submit" className="primary" disabled={mail === "sending"}>
                {mail === "sending" ? "Joining…" : "Join"}
              </button>
            </form>
            <span className="muted small">One email when a new auction opens. No newsletter.</span>
            {mail === "failed" && (
              <p className="bad">That did not go through. Check the address and try again.</p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        className="game-link"
        onClick={() => setGameOn((was) => !was)}
      >
        {gameOn ? "Hide the game" : "Play Flappy Josip"}
      </button>
      {gameOn && <Game />}
    </section>
  );
}

/**
 * Анонс вещи, торг на которую ещё не заведён: голограмма вместо фото, как на
 * торге до открытия. Кнопки нет - открывать нечего, а дату скажет письмо.
 */
function Upcoming({ thing, onOpen }: { thing: UpcomingThing; onOpen: () => void }) {
  return (
    <div className="hero">
      <div className={thing.seller ? "hero-photo" : "hero-photo in3d"}>
        {thing.seller ? (
          thing.photo && (
            <button type="button" className="hero-shot" onClick={onOpen}>
              <img src={thing.photo} alt={thing.title} />
            </button>
          )
        ) : (
          // Наша вещь до торга - голограммой: что за вещь, видно, а чья и
          // когда - скажет анонс.
          <div className="hero-stage">
            <SoonHologram model={thing.model} />
          </div>
        )}
      </div>
      <div className="hero-text">
        <span className="hero-pill">
          <span className="dot soon" />
          Coming soon
        </span>
        <h2 className="hero-name">{thing.title}</h2>
        {thing.house ? (
          // Наша неназванная вещь: что это и когда - скажет анонс.
          <p className="hero-who">
            Our next thing. What it is and when bidding opens will be announced here and by email.
          </p>
        ) : (
          <>
            {thing.tagline && <p className="hero-who">{thing.tagline}</p>}
            {thing.owner && <SellerLine seller={thing.owner} house={thing.house} />}
          </>
        )}
        {(thing.seller || thing.prepared) && (
          <button type="button" className="primary hero-go" onClick={onOpen}>
            View auction <span aria-hidden>&rarr;</span>
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Полоса цифр под каруселью - про вещь на экране: у идущего торга сколько
 * поставлено, сколько мест занято и сколько осталось; у анонса - когда
 * откроется; у прошедшего - сколько собрали.
 */
function HeroStats({
  live,
  soon,
  past,
  now,
}: {
  live?: MarketThing;
  soon?: UpcomingThing;
  past?: HeldRow;
  now: number;
}) {
  if (live) {
    const opensAt = live.opensAt === null ? null : Date.parse(live.opensAt);
    const clock = heroClock(opensAt, Date.parse(live.closesAt), now);
    const later = !hasOpened(opensAt, now);
    return (
      <div className="hero-stats">
        <div className="hero-stat-cell">
          <span className="hero-stat-cap">Bid so far</span>
          <span className="hero-stat-num">
            {formatUsdFull(live.raisedCents)} <Usdc />
          </span>
        </div>
        <div className="hero-stat-cell">
          <span className="hero-stat-cap">Total bids</span>
          <span className="hero-stat-num">
            {live.bids} <span className="hero-stat-of">on {live.taken} of {live.spots} spots</span>
          </span>
        </div>
        <div className="hero-stat-cell">
          <span className="hero-stat-cap">{later ? "Opens in" : "Ends in"}</span>
          <span className="hero-stat-num hero-stat-clock" suppressHydrationWarning>
            <ClockIcon urgent={clock.urgent} />
            {left(later ? (opensAt as number) : Date.parse(live.closesAt), now)}
          </span>
        </div>
      </div>
    );
  }
  if (soon) {
    return (
      <div className="hero-stats">
        <div className="hero-stat-cell">
          <span className="hero-stat-cap">Bidding opens</span>
          <span className="hero-stat-num" suppressHydrationWarning>
            {soon.opensAt
              ? new Date(soon.opensAt).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "To be announced"}
          </span>
        </div>
      </div>
    );
  }
  if (past) {
    return (
      <div className="hero-stats">
        <div className="hero-stat-cell">
          <span className="hero-stat-cap">Raised</span>
          <span className="hero-stat-num">
            {formatUsdFull(past.raisedCents)} <Usdc />
          </span>
        </div>
        <div className="hero-stat-cell">
          <span className="hero-stat-cap">Total bids</span>
          <span className="hero-stat-num">{past.bids}</span>
        </div>
        <div className="hero-stat-cell">
          <span className="hero-stat-cap">Closed</span>
          <span className="hero-stat-num hero-stat-clock">
            <ClockIcon urgent={false} />
            {new Date(past.closesAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>
    );
  }
  return null;
}

/** Часы у времени: циферблат, красный в последние сутки торга. */
function ClockIcon({ urgent }: { urgent: boolean }) {
  return (
    <svg className={urgent ? "clock-icon urgent" : "clock-icon"} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M10 3h4" />
    </svg>
  );
}

type Group = {
  at: number;
  title: string;
  rows: { id: string; slide: number; name: string; price: string; time: string }[];
};

/** Календарный день в часах читателя: ключ полосы и групп. */
function dayKey(at: number): string {
  const one = new Date(at);
  return `${one.getFullYear()}-${one.getMonth() + 1}-${one.getDate()}`;
}

/** Заголовок группы: сегодня и завтра словами, дальше день недели и дата. */
function dayTitle(at: number, now: number): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const ahead = Math.floor((at - start.getTime()) / 86_400_000);
  if (ahead === 0) return "Today";
  if (ahead === 1) return "Tomorrow";
  return new Date(at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Дата и время закрытия на карточке: «Oct 17, 18:00», в часах читателя. */
function stamp(at: string): string {
  const when = new Date(at);
  return `${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
