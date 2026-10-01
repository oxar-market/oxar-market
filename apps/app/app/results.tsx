"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import type { HeldRow } from "@/lib/auction";
import { loadAuctionReport, type SpotReport } from "@/lib/winners";
import { loadWorn, type Worn } from "./worn.tsx";
import { PhotoView } from "./auction/photo.tsx";
// TEMP_FRONT: тот же временный снимок и замер, что на торге и маркете.
import { TEMP_FRONT_QUADS, TEMP_SHOTS } from "./auction/temp-photo.ts";

/**
 * Закрытый торг. Тот же экран, что у живого, только вместо часов - «ENDED»,
 * вместо ставки - кто выиграл место и за сколько, а под вещью - что с ней
 * будет дальше: печать и выход в люди.
 *
 * Выбранное место одно, как и на торге: оно горит на вещи, его ставки стоят
 * карточкой, его строка в списке мест подсвечена. По умолчанию - место с
 * самой дорогой победившей ставкой. Ставки открыты всем, поэтому и итоги
 * видит любой с маркета.
 */
export function ResultsView({ held, onBack }: { held: HeldRow; onBack: () => void }) {
  const stage = useRef<Stage | null>(null);
  const [report, setReport] = useState<SpotReport[] | null>(null);
  const [worn, setWorn] = useState<Worn | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  // 3D или кадр: та же пара, что на живом торге.
  const [look, setLook] = useState<"live" | "shot">("live");

  useEffect(() => {
    window.scrollTo({ top: 0 });
    void loadAuctionReport(held.thingId, held.closesAt).then((rows) => {
      setReport(rows);
      const top = rows
        .filter((one) => one.status === "won" && one.bids[0])
        .sort((a, b) => b.bids[0]!.amountCents - a.bids[0]!.amountCents)[0];
      setPicked((was) => was ?? top?.code ?? rows[0]?.code ?? null);
    });
    void loadWorn(held.thingId).then(setWorn);
  }, [held]);

  // Логотипы победителей на вещи. Картинки с другого домена просят
  // crossOrigin, иначе сцена их не примет. Сцена и отчёт приходят в любом
  // порядке, поэтому одеваем вещь на каждую готовую сцену и каждый отчёт.
  const [ready, setReady] = useState(0);
  const art: Record<string, string> = {};
  for (const one of report ?? []) {
    if (one.status === "won" && one.bids[0]) art[one.code] = one.bids[0].mediaUrl;
  }
  useEffect(() => {
    for (const [code, url] of Object.entries(art)) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => stage.current?.show(code, image);
      image.src = url;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report, ready]);

  /** Выбрать место: только то, у которого был торг. */
  function pick(code: string) {
    if (report?.some((one) => one.code === code)) setPicked(code);
  }

  const won = (report ?? []).filter((one) => one.status === "won" && one.bids[0]);
  const bids = (report ?? []).reduce((sum, one) => sum + one.bids.length, 0);
  const totalCents = won.reduce((sum, one) => sum + one.bids[0]!.amountCents, 0);
  const current = report?.find((one) => one.code === picked) ?? null;
  const winner = current?.status === "won" ? (current.bids[0] ?? null) : null;

  return (
    <section className="lot">
      <div className="lot-brandbar">
        <span className="mk-title">
          OXAR <span>Auction</span>
        </span>
      </div>

      <div className="rs-col">
        <header className="lot-top">
          <div className="lot-title">
            <span className="live-badge ended">
              <i aria-hidden />
              ENDED
            </span>
            <h1>{held.title}</h1>
            {worn?.by && <p className="muted">Worn by {worn.by}</p>}
            <p className="muted">Ended {clock(held.closesAt)}</p>
          </div>
        </header>
      </div>

      {held.house ? (
        <>
          <div className="lot-scene">
            {/* Сцену не размонтируем в фото-режиме, а прячем: иначе вещь
                грузилась бы заново на каждое переключение. */}
            <div className={look === "shot" ? "look away" : "look"}>
              <ThingStage
                picked={picked}
                onPick={pick}
                stage={stage}
                onReady={() => setReady((was) => was + 1)}
              />
            </div>
            {look === "shot" && (
              <PhotoView
                shot={TEMP_SHOTS[0] as string}
                quads={TEMP_FRONT_QUADS}
                drawFrames
                picked={picked ?? ""}
                onPick={pick}
                art={art}
              />
            )}
            <div className="looks over-scene" role="group" aria-label="How to view">
              {([
                ["live", "3D"],
                ["shot", "Photo"],
              ] as const).map(([which, name]) => (
                <button
                  key={which}
                  type="button"
                  className={look === which ? "look-tab on" : "look-tab"}
                  aria-pressed={look === which}
                  onClick={() => setLook(which)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <p className="rs-caption muted">Print proof - every logo as it goes to print.</p>
        </>
      ) : (
        held.photo && <img className="results-photo" src={held.photo} alt={held.title} />
      )}

      <div className="rs-col">
        {report && (
          <dl className="rs-stats">
            <div>
              <dt>Spots sold</dt>
              <dd>
                {won.length} of {report.length}
              </dd>
            </div>
            <div>
              <dt>Bids</dt>
              <dd>{bids}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatUsd(totalCents)}</dd>
            </div>
          </dl>
        )}

        {current && (
          <div className="rs-card">
            <div className="rs-head">
              <h2>Spot {current.spot}</h2>
              <span className={winner ? "tagchip ink" : "tagchip"}>{winner ? "SOLD" : "UNSOLD"}</span>
            </div>
            {winner ? (
              <>
                <div className="rs-win">
                  <img src={winner.mediaUrl} alt="" />
                  <div>
                    <span className="rs-win-cap">Winning bid</span>
                    <span className="rs-win-sum">{formatUsd(winner.amountCents)}</span>
                    <span className="rs-win-who">
                      Won by <span className="mono">{shortWallet(winner.wallet)}</span>
                    </span>
                  </div>
                </div>
                <p className="muted small">
                  The winner&apos;s artwork, as printed. We sell the spot, not the wearer&apos;s creative work.
                </p>
                <div>
                  {current.bids.map((bid, index) => (
                    <div key={bid.at + bid.wallet} className="rs-bid">
                      <span>
                        <span className="mono">{shortWallet(bid.wallet)}</span>
                        <em>{clock(bid.at)}</em>
                      </span>
                      <span className={index === 0 ? "tagchip ink" : "tagchip"}>
                        {index === 0 ? "WON" : "REFUNDED"}
                      </span>
                      <span className="rs-bid-amt">{formatUsd(bid.amountCents)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="muted">No bids. This spot stays blank.</p>
            )}
          </div>
        )}

        {report && report.length > 0 && (
          <div>
            <div className="rs-head">
              <h2>All spots</h2>
              <span className="muted small">Tap a spot to see its bids</span>
            </div>
            {report.map((one) => {
              const top = one.status === "won" ? one.bids[0] : undefined;
              return (
                <button
                  key={one.lotId}
                  type="button"
                  className={one.code === picked ? "rs-row on" : "rs-row"}
                  aria-pressed={one.code === picked}
                  onClick={() => setPicked(one.code)}
                >
                  <b>Spot {one.spot}</b>
                  <span className="rs-row-who">
                    {top ? <span className="mono">{shortWallet(top.wallet)}</span> : "No bids, stays blank"}
                  </span>
                  <span className="rs-row-sum">{top ? formatUsd(top.amountCents) : "-"}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="rs-card">
          <div className="rs-head">
            <h2>What happens now</h2>
          </div>
          <ol className="rs-steps">
            <li className="done">
              <b>Auction ended</b>
              <span>{clock(held.closesAt)}. The highest bid on each spot won.</span>
            </li>
            <li className="done">
              <b>Escrow settled</b>
              <span>Winning bids paid out. Every other bid refunded automatically.</span>
            </li>
            <li className="now">
              <b>Printing</b>
              <span>Every artwork printed as uploaded.</span>
            </li>
            <li>
              <b>Worn</b>
              <span>
                {worn?.when ? `From ${worn.when}` : "Date to be announced"}. Photos of the worn shirt appear
                here.
              </span>
            </li>
          </ol>
          {/* Чем разобрали выбранное место: подпись и ссылка в обозреватель.
              Пусто у торгов, разобранных до того, как подпись стали хранить. */}
          {current?.settleSignature && (
            <div className="rs-foot">
              <span className="mono">Settlement {shortWallet(current.settleSignature)}</span>
              <a href={`https://solscan.io/tx/${current.settleSignature}`} target="_blank" rel="noreferrer">
                View on Solscan
              </a>
            </div>
          )}
        </div>

        <button type="button" className="primary wide" onClick={onBack}>
          Find another spot
        </button>
      </div>
    </section>
  );
}

/** Время по часам читателя: торг идёт неделю, поэтому и с днём. */
function clock(at: string): string {
  return new Date(at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Кошелёк или подпись по краям: свой узнают, чужой не притворяется именем. */
function shortWallet(at: string): string {
  return `${at.slice(0, 4)}..${at.slice(-4)}`;
}
