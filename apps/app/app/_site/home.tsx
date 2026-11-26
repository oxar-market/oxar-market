"use client";

import { useEffect, useState } from "react";
import { Globe, SHIRT, houseShape, isShirt, type GlobeThing } from "@oxar/stage";
import "@oxar/stage/globe.css";
import "./home.css";
import { APP_URL, load, localCopy, usd, type Auction } from "./data.ts";
import { avatar, readMe, type Me } from "./me.ts";
import { mono } from "./mono.ts";

/** Знак - тот же файл, что в шапке: в него собираются точки загрузки. */
const MARK = "/site/oxar-mark.webp";
/** Вход - вкладка You в приложении: там Privy и предлагает войти. */
const LOGIN = `${APP_URL}?tab=you`;

/** Торг - вещь для витрины: модель, места и картинки победителей. */
function thingOf(one: Auction): GlobeThing {
  const shape = houseShape(one.model) ?? (isShirt(one.model) ? SHIRT : undefined);
  const logos: Record<string, string[]> = {};
  for (const [code, won] of Object.entries(one.won)) {
    // Закрытый торг - сначала своя копия, оригинал - если копии нет.
    const copy = one.status === "sold" ? localCopy(won.url) : null;
    logos[code] = copy ? [copy, won.url] : [won.url];
  }
  const live = one.status === "live";
  return {
    id: one.id,
    href: `${APP_URL}?thing=${one.id}`,
    title: one.title,
    caption: [one.title, live ? "Live" : usd(one.raisedCents), one.owner].join(" · "),
    live,
    model: shape?.model ?? one.model ?? SHIRT.model,
    shape,
    logos,
  };
}

/** Шапка витрины: знак, How it works, List a spot и вход. На главной её показывают, когда знак загрузки долетел. */
export function Top({ me }: { me: Me | null }) {
  return (
    <header className="home-top">
      <a className="home-mark" href="/">
        <img src={MARK} alt="" data-mark />
        OXAR
      </a>
      <nav>
        <a href="/how-it-works">How it works</a>
        <a href="/sell">List a spot</a>
        {me ? (
          <a className="home-me" href="/app" aria-label="Your profile" style={me.img ? undefined : avatar(me.seed)}>
            {me.img ? <img src={me.img} alt="" /> : me.letter}
          </a>
        ) : (
          <a href={LOGIN}>Log in</a>
        )}
      </nav>
    </header>
  );
}

/**
 * Главная: глобус с нашими вещами, по прокрутке - поле мест. Шапка
 * появляется, когда знак загрузки долетел до её логотипа.
 */
export function Home() {
  const [things, setThings] = useState<GlobeThing[] | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    setMe(readMe());
    void load().then((data) => setThings((data?.auctions ?? []).map(thingOf)));
  }, []);

  return (
    <div className={`home ${mono.className}${ready ? " home-ready" : ""}`}>
      <Top me={me} />
      {things && (
        <Globe
          things={things}
          mark={MARK}
          markTarget={() => document.querySelector("[data-mark]")}
          onLanded={() => setReady(true)}
          intro={
            <>
              <h1>Distribution for projects. Funding for communities.</h1>
              <p>Communities list spots on what their crowd sees. Projects bid. The money waits in escrow until the photo is up.</p>
            </>
          }
        />
      )}
    </div>
  );
}
