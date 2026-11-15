"use client";

import { useEffect, useState } from "react";
import { APP_URL, FOLLOW, NEXT, day, load, usd, type Data } from "../data.ts";
import { Foot, Top } from "../landing.tsx";

/**
 * Все торги строками: карточка с вещью хороша на главной, но сотню карточек
 * никто не пролистает. Объявленный торг - в «Upcoming», не в «Live»: он ещё
 * не идёт, и ставку на него сделать нельзя.
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

  const rows = (data?.auctions ?? []).filter((one) =>
    filter === "all" ? true : filter === "live" ? one.status === "live" : filter === "past" ? one.status === "sold" : false,
  );
  const upcoming = filter === "all" || filter === "upcoming" ? NEXT : null;
  const live = rows.filter((one) => one.status === "live");
  const past = rows.filter((one) => one.status !== "live");

  return (
    <div className="v2">
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

        <div className="v2-rows">
          {live.map((one) => (
            <a key={one.id} className="v2-row" href={`${APP_URL}/?thing=${one.id}`}>
              <span className="v2-tag live">
                <span className="v2-dot" />
                Live
              </span>
              <span className="v2-row-name">
                <b>{one.owner}</b>
                {one.title}
              </span>
              <span className="v2-row-num">{usd(one.raisedCents)} bid</span>
              <span className="v2-row-num">{one.bidders} bidders</span>
              <span className="v2-row-num">Closes {day(one.closedAt)}</span>
              <span className="v2-row-go" aria-hidden>&rarr;</span>
            </a>
          ))}
          {upcoming && (
            <a className="v2-row" href={FOLLOW}>
              <span className="v2-tag soft">
                <span className="v2-dot" />
                Coming soon
              </span>
              <span className="v2-row-name">
                <b>{upcoming.owner}</b>
                {upcoming.title}
              </span>
              <span className="v2-row-num">{upcoming.spots} spots</span>
              <span className="v2-row-num" />
              <span className="v2-row-num">{upcoming.when}</span>
              <span className="v2-row-go" aria-hidden>&rarr;</span>
            </a>
          )}
          {past.map((one) => (
            <a key={one.id} className="v2-row" href={`${APP_URL}/?thing=${one.id}`}>
              <span className="v2-tag soft ended">
                <span className="v2-dot" />
                Ended
              </span>
              <span className="v2-row-name">
                <b>{one.owner}</b>
                {one.title}
              </span>
              <span className="v2-row-num">{usd(one.raisedCents)} raised</span>
              <span className="v2-row-num">{one.bidders} bidders</span>
              <span className="v2-row-num">{day(one.closedAt)}</span>
              <span className="v2-row-go" aria-hidden>&rarr;</span>
            </a>
          ))}
          {data && live.length + past.length === 0 && !upcoming && <p className="v2-row-none">Nothing here yet.</p>}
        </div>
      </section>
      <Foot />
    </div>
  );
}
