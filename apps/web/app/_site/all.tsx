"use client";

import { useEffect, useState } from "react";
import { AuctionCard, NextCard } from "./cards.tsx";
import { FOLLOW, NEXT, load, type Data } from "./data.ts";
import { Foot, Top } from "./landing.tsx";
import { useViews } from "./spots.tsx";

/**
 * Все торги теми же карточками, что на главной, только без отбора. Объявленный
 * торг - в «Upcoming», не в «Live»: он ещё не идёт, и ставку на него сделать
 * нельзя.
 */

type Filter = "all" | "live" | "upcoming" | "past";

const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["live", "Live"],
  ["upcoming", "Upcoming"],
  ["past", "Past"],
];

export function All() {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  useEffect(() => {
    void load().then(setData);
  }, []);

  const all = data?.auctions ?? [];
  // Кадры снимаются для всех торгов сразу, чтобы фильтр не ждал сцену.
  const { views, shooter } = useViews(all);
  const shown = all.filter((one) =>
    filter === "all" ? true : filter === "live" ? one.status === "live" : filter === "past" ? one.status === "sold" : false,
  );
  const upcoming = filter === "all" || filter === "upcoming" ? NEXT : null;
  const live = shown.filter((one) => one.status === "live");
  const past = shown.filter((one) => one.status !== "live");
  const empty = data !== null && shown.length === 0 && !upcoming;

  return (
    <div className="v2">
      {shooter}
      <Top />
      <section className="v2-section v2-all">
        <p className="v2-label">Auctions</p>
        <div className="v2-head">
          <h2>
            Every auction,
            <span> live, next and past.</span>
          </h2>
          <div className="v2-filter" role="tablist">
            {FILTERS.map(([one, label]) => (
              <button key={one} type="button" className={filter === one ? "on" : ""} onClick={() => setFilter(one)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {empty ? (
          <div className="v2-empty">
            <span className="v2-empty-mark" aria-hidden>
              <i className="v2-c tl" />
              <i className="v2-c tr" />
              <i className="v2-c bl" />
              <i className="v2-c br" />
              <span className="v2-dot" />
            </span>
            <h3>{filter === "live" ? "Nothing is live right now." : filter === "upcoming" ? "Nothing announced yet." : "No finished auctions yet."}</h3>
            <p>
              {NEXT && filter !== "upcoming"
                ? `Next up: ${NEXT.owner}, ${NEXT.title.split(".")[0].toLowerCase()}, opening in ${NEXT.when}.`
                : "New auctions are announced on X first."}
            </p>
            <div className="v2-empty-go">
              {NEXT && filter !== "upcoming" && (
                <button type="button" className="v2-btn dark" onClick={() => setFilter("upcoming")}>
                  See what&apos;s next
                </button>
              )}
              <a className="v2-btn light line" href={FOLLOW}>
                Follow on X
              </a>
            </div>
          </div>
        ) : (
          <div className="v2-grid">
            {live.map((one) => (
              <AuctionCard key={one.id} one={one} view={views[one.id]} />
            ))}
            {upcoming && <NextCard next={upcoming} />}
            {past.map((one) => (
              <AuctionCard key={one.id} one={one} view={views[one.id]} />
            ))}
          </div>
        )}
      </section>
      <Foot />
    </div>
  );
}
