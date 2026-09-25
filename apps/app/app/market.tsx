"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import { db } from "@/lib/session";
import { loadMarket, type HeldRow, type MarketThing } from "@/lib/auction";
import { Game } from "./game/game";

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
  const [held, setHeld] = useState<HeldRow[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    void loadMarket().then((loaded) => {
      setThings(loaded.things);
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

  return (
    <section className="screen">
      <h1>Market</h1>

      {things.map((one) => {
        const opensLater =
          one.opensAt !== null && Date.parse(one.opensAt) > now;
        const soon = Date.parse(one.closesAt) - now < 86_400_000;
        return (
          <div className="hero" key={one.id}>
            <div className="hero-photo">
              <i className="crop tl" /><i className="crop tr" />
              <i className="crop bl" /><i className="crop br" />
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

      {held.length > 0 && (
        <>
          <h2 className="mk-head">Held earlier</h2>
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
