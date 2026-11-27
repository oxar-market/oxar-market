"use client";

import { useEffect, useMemo, useState } from "react";
import { perThousandCents, rankBidders, shortWallet, topBids } from "@oxar/core";
import { SHIRT, ThingView, houseShape, isShirt } from "@oxar/stage";
import "./auction.css";
import { APP_URL, day, loadAuction, localCopy, usd, type AuctionPage, type Bid } from "./data.ts";
import { Header } from "./header.tsx";
import { mono } from "./mono.ts";

/**
 * Страница закрытого торга и пилота: вещь крупно живой моделью с логотипами
 * победителей, справа таблица итогов и переключатель [ Spots ] [ Who bid ].
 * Идущий торг здесь не показываем - ставки делаются в приложении, туда и
 * отправляем.
 */
export function AuctionView() {
  const [page, setPage] = useState<AuctionPage | null | "missing">(null);
  const [tab, setTab] = useState<"spots" | "who">("spots");
  const [shots, setShots] = useState<Record<string, string>>({});
  const [focus, setFocus] = useState<{ code: string; at: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("thing");
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return setPage("missing");
    void loadAuction(id).then((one) => {
      if (one?.status === "live") return window.location.replace(`${APP_URL}?thing=${one.id}`);
      setPage(one ?? "missing");
    });
  }, []);

  const view = useMemo(() => (page && page !== "missing" ? build(page) : null), [page]);

  return (
    <div className={`auc ${mono.className}`}>
      <Header />
      {page === "missing" && (
        <p className="auc-empty">
          This auction is not here. <a href="/">[ Back to all ]</a>
        </p>
      )}
      {page === null && <p className="auc-empty auc-mute">Loading the auction</p>}
      {page && page !== "missing" && view && (
        <main className="auc-main">
          <div className="auc-view">
            <ThingView model={view.model} shape={view.shape} logos={view.logos} focus={focus} onShots={setShots} />
            <span className="auc-hint">Drag to turn</span>
          </div>
          <div className="auc-info">
            <a className="auc-back" href="/?grid">
              [ All auctions ]
            </a>
            <h1>{page.title}</h1>
            <p className="auc-mute">{page.owner}</p>
            <dl className="auc-meta">
              {view.rows.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>

            {view.people.length > 0 ? (
              <div className="auc-tabs" role="tablist">
                <button type="button" role="tab" aria-selected={tab === "spots"} onClick={() => setTab("spots")}>
                  [ <span>Spots</span> ]
                </button>
                <button type="button" role="tab" aria-selected={tab === "who"} onClick={() => setTab("who")}>
                  [ <span>Who bid</span> ]
                </button>
              </div>
            ) : (
              <p className="auc-label">Spots</p>
            )}

            {tab === "spots" ? (
              <div className="auc-spots">
                {view.spots.map((spot) => (
                  <div key={spot.code}>
                    <button
                      type="button"
                      className={spot.brand ? "auc-spot" : "auc-spot auc-unsold"}
                      onClick={() => {
                        setFocus({ code: spot.code, at: Date.now() });
                        setOpen(open === spot.code ? null : spot.code);
                      }}
                    >
                      {shots[spot.code] ? <img src={shots[spot.code]} alt="" /> : <span className="auc-blank" />}
                      <span>
                        <b>{spot.brand ?? "Not sold"}</b>
                        <span className="auc-mute">
                          {spot.label}
                          {spot.bids.length > 1 && ` · ${spot.bids.length} bids`}
                        </span>
                      </span>
                      <span className="auc-mute">{spot.price}</span>
                    </button>
                    {open === spot.code && spot.bids.length > 0 && (
                      <div className="auc-hist">
                        {spot.bids.map((bid, at) => (
                          <div key={at} className={at === 0 ? undefined : "auc-out"}>
                            <span>
                              {bid.brand || shortWallet(bid.wallet)}
                              {at > 0 && ", outbid"}
                            </span>
                            <span>{when(bid.at)}</span>
                            <span>{usd(bid.cents)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="auc-who">
                {view.people.map((one, at) => (
                  <div key={one.wallet}>
                    <span className="auc-mute">{String(at + 1).padStart(2, "0")}</span>
                    <span>
                      {one.brands.join(", ") || shortWallet(one.wallet)}
                      <small>{shortWallet(one.wallet)}</small>
                    </span>
                    <span className="auc-mute">{one.bids === 1 ? "1 bid" : `${one.bids} bids`}</span>
                    <span className={one.spots ? undefined : "auc-mute"}>
                      {one.spots ? `won ${one.spots} · paid ${usd(one.paidCents)}` : `outbid · best ${usd(one.bestCents)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}

type SpotRow = { code: string; label: string; brand: string | null; price: string; bids: Bid[] };

/** Из данных торга - то, что рисует страница: модель, логотипы, строки таблицы, места и участники. */
function build(page: AuctionPage) {
  const shape = houseShape(page.model) ?? (isShirt(page.model) ? SHIRT : undefined);
  const model = shape?.model ?? page.model ?? SHIRT.model;
  const pilot = page.status === "pilot";

  // Победитель места - старшая ставка; у пилота - бренд из placements.
  const top = new Map([...topBids(page.bids.map((bid) => ({ ...bid, lot_id: bid.code, amount_cents: bid.cents })))].map(([code, bid]) => [code, bid]));
  const logos: Record<string, string[]> = {};
  for (const [code, bid] of top) {
    const copy = localCopy(bid.url);
    logos[code] = copy ? [copy, bid.url] : [bid.url];
  }
  for (const [code, one] of Object.entries(page.placed)) logos[code] = [one.url];

  const codes = shape?.spots.map((spot) => spot.code) ?? Object.keys(page.labels);
  const label = (code: string) => shape?.spots.find((spot) => spot.code === code)?.label ?? page.labels[code] ?? code;
  const spots: SpotRow[] = codes.map((code) => {
    const lead = top.get(code);
    return {
      code,
      label: label(code),
      brand: pilot ? (page.placed[code]?.brand ?? null) : lead ? lead.brand || shortWallet(lead.wallet) : null,
      price: pilot ? "" : lead ? usd(lead.cents) : "",
      bids: page.bids.filter((bid) => bid.code === code).sort((a, b) => b.cents - a.cents),
    };
  });

  const raised = [...top.values()].reduce((sum, bid) => sum + bid.cents, 0);
  const people = rankBidders(page.board.lots, page.board.bids);
  const sold = spots.filter((spot) => spot.brand).length;
  const cpm = page.reach ? perThousandCents(raised, page.reach.people) : null;
  const rows: [string, string][] = [
    ["Community", page.owner],
    ...(page.where ? ([["Where", page.where]] as [string, string][]) : []),
    ...(pilot
      ? ([
          ["Format", "Pilot, partner logos, no auction"],
          ["Spots", String(spots.length)],
        ] as [string, string][])
      : ([
          ["Closed", page.closedAt ? day(page.closedAt) : "-"],
          ["Raised", usd(raised)],
          ["Spots", `${sold} of ${spots.length} sold`],
          ["Bids", `${page.bids.length} from ${people.length} bidders`],
        ] as [string, string][])),
    ...(page.reach
      ? ([
          ["Seen by", `~${page.reach.people.toLocaleString("en-US")}${page.reach.estimated ? ", estimated" : ""}`],
          ...(cpm !== null && !pilot ? ([["Per 1,000 views", usd(cpm)]] as [string, string][]) : []),
        ] as [string, string][])
      : []),
  ];
  return { shape, model, logos, spots, people, rows };
}

function when(at: number): string {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
