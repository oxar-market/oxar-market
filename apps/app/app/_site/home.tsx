"use client";

import { useEffect, useState } from "react";
import { Globe, SHIRT, houseShape, isShirt, type GlobeThing } from "@oxar/stage";
import "@oxar/stage/globe.css";
import "./home.css";
import { load, loadPilots, localCopy, usd, type Auction, type Pilot } from "./data.ts";
import { Header } from "./header.tsx";
import { mono } from "./mono.ts";

/** Знак - тот же файл, что в шапке: в него собираются точки загрузки. */
const MARK = "/site/oxar-mark.webp";

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
    // И идущий, и закрытый - на страницу торга: ставки теперь там же.
    href: `/auction?thing=${one.id}`,
    title: one.title,
    caption: [one.title, live ? "Live" : usd(one.raisedCents), one.owner].join(" · "),
    live,
    model: shape?.model ?? one.model ?? SHIRT.model,
    shape,
    logos,
  };
}

/** Пилот - вещь без торга: логотипы партнёров стоят на своих местах, пометка «Pilot». */
function pilotOf(one: Pilot): GlobeThing {
  const shape = houseShape(one.model) ?? (isShirt(one.model) ? SHIRT : undefined);
  return {
    id: one.id,
    href: `/auction?thing=${one.id}`,
    title: one.title,
    caption: [one.title, "Pilot", one.owner].join(" · "),
    live: false,
    tag: "Pilot",
    model: shape?.model ?? one.model ?? SHIRT.model,
    shape,
    logos: Object.fromEntries(Object.entries(one.placed).map(([code, placed]) => [code, [placed.url]])),
  };
}

/**
 * Главная: глобус с нашими вещами, по прокрутке - поле мест. Шапка
 * появляется, когда знак загрузки долетел до её логотипа.
 */
export function Home() {
  const [things, setThings] = useState<GlobeThing[] | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Сначала торги, пилоты - после: они не торг, а прогон идеи.
    void Promise.all([load(), loadPilots()]).then(([data, pilots]) =>
      setThings([...(data?.auctions ?? []).map(thingOf), ...pilots.map(pilotOf)]),
    );
  }, []);

  return (
    <div className={`home ${mono.className}${ready ? " home-ready" : ""}`}>
      <Header />
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
