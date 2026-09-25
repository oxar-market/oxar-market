"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import { db } from "@/lib/session";
import {
  loadMarket,
  type HeldRow,
  type MarketThing,
  type UpcomingThing,
} from "@/lib/auction";
import { Game } from "./game/game";
import { PhotoView } from "./auction/photo.tsx";
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

export function Market({ onOpenAuction }: { onOpenAuction: () => void }) {
  const [things, setThings] = useState<MarketThing[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingThing[]>([]);
  const [held, setHeld] = useState<HeldRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void loadMarket().then((loaded) => {
      setThings(loaded.things);
      setUpcoming(loaded.upcoming);
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
  const heroStage = useRef<Stage | null>(null);
  function dressHero() {
    const art: Record<string, string> = things[0]?.art ?? {};
    for (const [code, url] of Object.entries(art)) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => heroStage.current?.show(code, image);
      image.src = url;
    }
  }

  // Карусель героев: идущие торги, за ними анонсы. Какой слайд на экране,
  // знают и точки под ней, и строки списка - строка текущего подсвечена.
  const rail = useRef<HTMLDivElement | null>(null);
  const [slide, setSlide] = useState(0);
  const slides = things.length + upcoming.length;
  // Листание по кругу: с последнего слайда вперёд - на первый. Страница
  // едет к карусели только с тапа по строке внизу; стрелки и точки стоят
  // рядом с ней, и лишний сдвиг читался бы прыжком.
  function go(to: number, reveal = false) {
    const el = rail.current;
    if (!el || slides === 0) return;
    const at = (to + slides) % slides;
    el.scrollTo({ left: at * el.clientWidth, behavior: "smooth" });
    if (reveal) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
    const later = opens !== null && opens > now;
    const anchor = later ? (opens as number) : closes;
    const key = dayKey(anchor);
    const group = byDay.get(key) ?? { at: anchor, title: dayTitle(anchor, now), rows: [] };
    group.rows.push({
      id: one.id,
      slide: at,
      name: one.title,
      price: one.topCents > 0 ? formatUsd(one.topCents) : "-",
      time: later
        ? `opens in ${left(one.opensAt as string, now)}`
        : `closes in ${left(one.closesAt, now)}`,
    });
    byDay.set(key, group);
  });
  const groups = [...byDay.entries()].sort((a, b) => a[1].at - b[1].at);
  if (upcoming.length > 0) {
    groups.push([
      "tba",
      {
        at: Infinity,
        title: "Date to be announced",
        rows: upcoming.map((one, at) => ({
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

  return (
    <section className="screen">
      <h1 className="mk-title">
        OXAR <span>Market</span>
      </h1>

      <div className="hero-wrap">
      <div
        className="hero-rail"
        ref={rail}
        onScroll={(event) => {
          const el = event.currentTarget;
          setSlide(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
      {things.map((one) => {
        const opensLater =
          one.opensAt !== null && Date.parse(one.opensAt) > now;
        const soon = Date.parse(one.closesAt) - now < 86_400_000;
        return (
          <div className="hero" key={one.id}>
            <div className={heroLook === "live" ? "hero-photo in3d" : "hero-photo"}>
              {heroLook === "live" ? (
                <div className="hero-stage">
                  <ThingStage
                    picked={null}
                    onPick={() => {}}
                    stage={heroStage}
                    onReady={dressHero}
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
              <span className="now-pill">
                <span className="dot" />
                {opensLater ? "OPENS SOON" : soon ? "CLOSING SOON" : "LIVE NOW"}
              </span>
              {!opensLater && (
                <span className="hero-time" suppressHydrationWarning>
                  <span className="hero-time-cap">closes in</span>
                  {left(one.closesAt, now)}
                </span>
              )}
            </div>
            <div className="hero-card">
              <div>
                <h2 className="hero-name">{one.title}</h2>
                {one.tagline && <p className="hero-who">{one.tagline}</p>}
              </div>
              <div className="hero-stat">
                <span className="muted">
                  {one.taken} of {one.spots} spots taken
                </span>
                {one.topCents > 0 && (
                  <span className="hero-top">
                    {formatUsd(one.topCents)}{" "}
                    <span className="hero-top-cap">top bid</span>
                  </span>
                )}
              </div>
              <button type="button" className="primary wide" onClick={onOpenAuction}>
                Open
              </button>
            </div>
          </div>
        );
      })}

      {upcoming.map((one) => (
        <Upcoming key={one.id} thing={one} />
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

      {groups.length > 0 && (
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
                  const target = byDay.has(key)
                    ? document.getElementById(`mk-day-${key}`)
                    : rail.current;
                  target?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      )}

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
      {held.length > 0 && (
        <>
          <div className="held-list">
            {held.map((one) => (
              <div className="held-row" key={one.closesAt + one.title}>
                <span className="held-date">{day(one.closesAt)}</span>
                <span className="held-name">{one.title}</span>
                <span className="held-sum">{formatUsd(one.raisedCents)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mail-card">
        <span className="mail-head">Get an email when a new thing opens</span>
        {mail === "done" ? (
          <p className="lead">You are on the list. We will write when a new thing opens.</p>
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
                {mail === "sending" ? "Joining…" : "Notify me"}
              </button>
            </form>
            <span className="muted small">One email per new thing. No newsletter.</span>
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
function Upcoming({ thing }: { thing: UpcomingThing }) {
  const stage = useRef<Stage | null>(null);
  return (
    <div className="hero">
      <div className="hero-photo in3d">
        <div className="hero-stage">
          <ThingStage
            picked={null}
            onPick={() => {}}
            stage={stage}
            onReady={() => stage.current?.look("ghost")}
          />
        </div>
        <span className="now-pill">
          <span className="dot" />
          COMING SOON
        </span>
      </div>
      <div className="hero-card">
        <div>
          <h2 className="hero-name">{thing.title}</h2>
          {thing.tagline && <p className="hero-who">{thing.tagline}</p>}
        </div>
        <span className="muted">Opening date to be announced.</span>
      </div>
    </div>
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

/** День для строк истории: коротко, в часах читателя. */
function day(at: string): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Сколько осталось торгу: крупно дни, дальше часы-минуты-секунды. */
function left(closesAt: string, now: number): string {
  const s = Math.max(0, Math.floor((Date.parse(closesAt) - now) / 1000));
  const d = Math.floor(s / 86_400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${clock}` : clock;
}
