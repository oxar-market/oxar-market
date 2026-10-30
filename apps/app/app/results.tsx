"use client";

import { useEffect, useRef, useState } from "react";
import { closeDay, formatUsd, formatUsdFull } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import { houseShape } from "@/lib/shape";
import type { HeldRow } from "@/lib/auction";
import { Media } from "./gallery.tsx";
import { loadWorn, type Worn } from "./worn.tsx";
import { Usdc } from "./usdc.tsx";
import { loadBidTimeline, loadPlacements, loadProof, loadWinners, type BidEvent, type Winner } from "@/lib/winners";

/**
 * Итоги закрытого торга: кто что выиграл и за сколько.
 *
 * Тот же вид, что у пилота с Delora, только места здесь проданы с торгов:
 * логотипы победителей стоят на вещи, ниже - место, бренд и ставка. Ползунок
 * проматывает торг назад: как сменялись лидеры каждого места. Внизу - что
 * с вещью дальше: разбор, печать, выход в люди. Ставки и так открыты всем,
 * поэтому и итоги видит любой с маркета.
 */
export function ResultsView({ held, onBack }: { held: HeldRow; onBack: () => void }) {
  const stage = useRef<Stage | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [list, setList] = useState<Winner[] | null>(null);
  const [worn, setWorn] = useState<Worn | null>(null);
  // Шаги «что дальше» - из данных. Разобран ли эскроу: статус лота ставит
  // скрипт расчёта уже после выплаты в цепочке, так что лот не «open» -
  // значит разобран. Пруф - фото вещи в деле, их кладёт админ.
  const [settled, setSettled] = useState<boolean | null>(null);
  const [proof, setProof] = useState<string[]>([]);

  const pilot = held.pilot ?? null;

  useEffect(() => {
    window.scrollTo({ top: 0 });
    // «Кто, где, когда» и пруф - из базы у всех, пилот там тоже есть.
    void loadWorn(held.thingId).then(setWorn);
    void loadProof(held.thingId).then(setProof);
    if (pilot) {
      // Пилот: размещения вместо ставок - и разбирать нечего.
      setSettled(true);
      void loadPlacements(held.thingId).then(setList);
      return;
    }
    void loadWinners(held.thingId).then((all) => {
      // Строка на маркете - один день закрытия; торги вещи в другие дни сюда
      // не подмешиваем.
      const sameDay = all.filter((one) => closeDay(one.closesAt) === closeDay(held.closesAt));
      setList(sameDay.filter((one) => one.status === "won"));
      setSettled(sameDay.every((one) => one.status === "won"));
    });
  }, [held, pilot]);

  // История торга: все ставки по времени. Ползунок стоит на числе уже
  // случившихся ставок; по умолчанию - на конце, то есть на победителях.
  const [events, setEvents] = useState<BidEvent[]>([]);
  const [spots, setSpots] = useState(0);
  const [startCents, setStartCents] = useState(0);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (pilot) return;
    void loadBidTimeline(held.thingId, held.closesAt).then((line) => {
      setEvents(line.events);
      setSpots(line.spots);
      setStartCents(line.startCents);
    });
  }, [held, pilot]);
  const at = step ?? events.length;

  // Проигрывание: шаг за шагом от первой ставки до последней.
  useEffect(() => {
    if (!playing) return;
    if (at >= events.length) {
      setPlaying(false);
      return;
    }
    const next = setTimeout(() => setStep(at + 1), 450);
    return () => clearTimeout(next);
  }, [playing, at, events.length]);

  // На вещь ставим лидера каждого места на этот шаг. Картинки грузятся один
  // раз и живут в кэше: проматывать взад-вперёд должно быть мгновенно.
  // Картинки с другого домена просят crossOrigin, иначе сцена их не примет.
  const [ready, setReady] = useState(false);
  const images = useRef(new Map<string, HTMLImageElement>());
  useEffect(() => {
    if (!ready) return;
    // У пилота истории нет: вещь одевается сразу в то, что на ней стоит.
    if (pilot) {
      for (const one of list ?? []) {
        const image = new Image();
        image.onload = () => stage.current?.show(one.code, image);
        image.src = one.mediaUrl;
      }
      return;
    }
    const lead = new Map<string, BidEvent>();
    for (const one of events.slice(0, at)) {
      const was = lead.get(one.code);
      if (!was || one.amountCents > was.amountCents) lead.set(one.code, one);
    }
    const codes = new Set(events.map((one) => one.code));
    for (const code of codes) {
      if (!code) continue;
      const top = lead.get(code);
      if (!top) {
        stage.current?.show(code, null);
        continue;
      }
      const cached = images.current.get(top.mediaUrl);
      if (cached?.complete) {
        stage.current?.show(code, cached);
        continue;
      }
      const image = cached ?? new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => stage.current?.show(code, image);
      if (!cached) {
        images.current.set(top.mediaUrl, image);
        image.src = top.mediaUrl;
      }
    }
  }, [ready, events, at, pilot, list]);
  const current = at > 0 ? events[at - 1] : null;
  const signature = list?.find((one) => one.code === picked)?.settleSignature ?? null;
  const proven = proof.length > 0;

  // Цифры полосы: сколько брендов ставило, сколько мест ушло, на сколько
  // торг поднял стартовую цену.
  const brands = new Set(events.map((one) => one.brand)).size;
  const sold = (list ?? []).length;
  const growth = startCents > 0 && held.raisedCents > startCents
    ? Math.round(((held.raisedCents - startCents) / startCents) * 100)
    : null;
  // Выигравшая ставка места - самая крупная на нём: она и WON в истории.
  const winning = new Set((list ?? []).map((one) => `${one.code}:${one.amountCents}`));
  const history = [...events].reverse();

  const scrub = events.length > 0 && (
    <div className="results-timeline">
      <div className="results-time-head">
        <button
          type="button"
          className="sl-pill"
          onClick={() => {
            if (playing) return setPlaying(false);
            if (at >= events.length) setStep(0);
            setPlaying(true);
          }}
        >
          {playing ? "Pause" : at >= events.length ? "Replay" : "Play"}
        </button>
        <b className="results-time-step">
          Bid {at} of {events.length}
        </b>
        <span className="results-time-now">
          {current
            ? `${clock(current.at)} · ${current.brand} · ${formatUsdFull(current.amountCents)}`
            : "Before the first bid"}
        </span>
      </div>
      {/* Свой ползунок: засечка на каждую ставку, пройденное - тёмным. */}
      <div
        className="results-scrub"
        style={{ "--fill": `${events.length ? (at / events.length) * 100 : 0}%` } as React.CSSProperties}
      >
        <div className="results-ticks" aria-hidden>
          {events.map((one, i) => (
            <i
              key={i}
              className={i < at ? "on" : ""}
              style={{ left: `${((i + 1) / events.length) * 100}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={events.length}
          value={at}
          aria-label="Auction timeline"
          onChange={(event) => {
            setPlaying(false);
            setStep(Number(event.target.value));
          }}
        />
      </div>
    </div>
  );

  return (
    <div className="rs">
      <header className="lot-top rs-top">
        <div className="lot-title">
          <button type="button" className="case-back" onClick={onBack}>
            &larr; Market
          </button>
          <span className="hero-pill done">
            <span className="dot" />
            {pilot ? "Pilot placed" : "Auction ended"}
          </span>
          <h1>{held.title}</h1>
          {(held.about ?? worn?.about) && <p className="rs-sub">{held.about ?? worn?.about}</p>}
          {pilot && (
            <p className="rs-sub">
              With{" "}
              {pilot.partnerUrl ? (
                <a className="case-partner" href={pilot.partnerUrl} target="_blank" rel="noreferrer">
                  {pilot.partner}
                </a>
              ) : (
                pilot.partner
              )}
            </p>
          )}
        </div>
        <div className="lot-side">
          <div className="lot-cd">
            <span className="lot-cd-cap">{pilot ? "Placed" : "Closed"}</span>
            <span className="lot-cd-num">{clock(held.closesAt)}</span>
          </div>
        </div>
      </header>

      {!pilot && (
        <div className="hero-stats rs-stats">
          <div className="hero-stat-cell">
            <span className="hero-stat-cap">Raised</span>
            <span className="hero-stat-num">
              {formatUsdFull(held.raisedCents)} <Usdc />
            </span>
          </div>
          <div className="hero-stat-cell">
            <span className="hero-stat-cap">Total bids</span>
            <span className="hero-stat-num">
              {events.length}{" "}
              {brands > 0 && (
                <span className="hero-stat-of">
                  from {brands} {brands === 1 ? "brand" : "brands"}
                </span>
              )}
            </span>
          </div>
          <div className="hero-stat-cell">
            <span className="hero-stat-cap">Spots sold</span>
            <span className="hero-stat-num">
              {sold} {spots > 0 && <span className="hero-stat-of">of {spots}</span>}
            </span>
          </div>
          {growth !== null && (
            <div className="hero-stat-cell">
              <span className="hero-stat-cap">Over the start price</span>
              <span className="hero-stat-num">
                <span className="rs-up">+{growth}%</span>
                <span className="hero-stat-of">
                  {formatUsdFull(startCents)} to {formatUsdFull(held.raisedCents)}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      <div className={events.length > 0 ? "rs-body" : "rs-body two"}>
        {events.length > 0 && (
          <aside className="rs-card rs-history">
            <div className="rs-card-head">
              <b>Bid history</b>
              <span>
                {events.length} {events.length === 1 ? "bid" : "bids"}
              </span>
            </div>
            <div className="rs-list">
              {history.map((one, i) => {
                const won = winning.has(`${one.code}:${one.amountCents}`);
                const first = i === history.length - 1;
                return (
                  <div className="rs-bid" key={`${one.at}${one.brand}${one.amountCents}`}>
                    <img src={one.mediaUrl} alt="" />
                    <span className="rs-bid-who">
                      <span>{one.brand}</span>
                      <em>
                        {one.spot} · {stamp(one.at)}
                      </em>
                    </span>
                    <span className="rs-bid-amt">
                      <b>{formatUsdFull(one.amountCents)}</b>
                      <span className={won ? "rs-tag won" : "rs-tag"}>
                        {won ? "WON" : first ? "FIRST BID" : "REFUNDED"}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="rs-note">Every bid is public. Replay them on the scene.</p>
          </aside>
        )}

        <section className="rs-scene">
          {/* Вещь продавца без снимка, но с моделью (ван) - тоже сценой, как
              на маркете: иначе посередине пусто. */}
          {held.house || (!held.photo && houseShape(held.model)) ? (
            <div className="case-stage">
              <ThingStage
                shape={houseShape(held.model)}
                picked={picked}
                onPick={(code) => setPicked((was) => (was === code ? null : code))}
                stage={stage}
                onReady={() => setReady(true)}
              />
            </div>
          ) : (
            held.photo && <img className="results-photo" src={held.photo} alt={held.title} />
          )}
          {list && list.length > 0 && (
            <span className="rs-sold">
              {pilot ? "Placed with" : "Sold to"} {list.length === 1 ? list[0]!.brand : `${list.length} brands`}
            </span>
          )}
          {scrub}
        </section>

        <aside className="rs-card rs-winners">
          <div className="rs-card-head">
            <b>Winners</b>
            <span>
              {sold} {sold === 1 ? "spot" : "spots"}
            </span>
          </div>
          {list !== null && list.length === 0 && <p className="muted">No spot on this thing found a winner.</p>}
          <div className="rs-win-list">
            {(list ?? []).map((one) => (
              <button
                type="button"
                key={one.lotId}
                className={one.code === picked ? "rs-win on" : "rs-win"}
                onClick={() => setPicked((was) => (was === one.code ? null : one.code))}
              >
                <img src={one.mediaUrl} alt="" />
                <span className="rs-win-text">
                  <span className="rs-win-spot">{one.spot}</span>
                  <b>{one.brand}</b>
                  {!pilot && (
                    <span className="rs-win-sum">
                      {formatUsdFull(one.amountCents)} <Usdc />
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          <span className="rs-sect">What happens now</span>
          <ol className="rs-steps">
            <li className="done">
              <b>{pilot ? "Placed" : "Auction ended"}</b>
              <span>
                {clock(held.closesAt)}.{" "}
                {pilot ? "Spots given to the partner without bidding." : "The highest bid on each spot won."}
              </span>
            </li>
            <li className={settled ? "done" : settled === false ? "now" : ""}>
              <b>Escrow settled</b>
              <span>
                {pilot
                  ? "Nothing to settle: no bids, no payment."
                  : "Winning bids paid out. Every other bid refunded automatically."}
              </span>
            </li>
            <li className={proven ? "done" : settled ? "now" : ""}>
              <b>Preparing</b>
              <span>Winning artwork goes on the thing as uploaded.</span>
            </li>
            <li className={proven ? "done" : ""}>
              <b>{worn?.when ? `In use: ${worn.when}` : "In use"}</b>
              <span>{worn?.where ?? "Place to be announced."}</span>
            </li>
            <li className={proven ? "done" : ""}>
              <b>{worn?.proofBy ? `Proof by ${day(worn.proofBy)}` : "Proof"}</b>
              <span>Photos of the thing in use appear here.</span>
            </li>
          </ol>
          {/* Чем разобрали выбранное место: подпись и ссылка в обозреватель.
              Пусто без выбранного места и у торгов, разобранных до того, как
              подпись стали хранить. */}
          {signature && (
            <div className="rs-foot">
              <span className="mono">Settlement {short(signature)}</span>
              <a href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer">
                View on Solscan
              </a>
            </div>
          )}
        </aside>
      </div>

      {/* Покупатель места должен знать, на ком, где и когда будет вещь. */}
      {worn && (worn.by || worn.where || worn.when || worn.proofBy) && (
        <dl className="worn rs-worn">
          <div>
            <dt>Who has it</dt>
            <dd className={worn.by ? "" : "tba"}>{worn.by ?? "To be announced"}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd className={worn.where ? "" : "tba"}>{worn.where ?? "To be announced"}</dd>
          </div>
          <div>
            <dt>When</dt>
            <dd className={worn.when ? "" : "tba"}>{worn.when ?? "To be announced"}</dd>
          </div>
          {worn.proofBy && (
            <div>
              <dt>Proof by</dt>
              <dd>{new Date(worn.proofBy).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</dd>
            </div>
          )}
        </dl>
      )}

      <div className={proven ? "case-proof rs-proof" : "case-proof rs-proof empty"}>
        <span className="case-proof-head">Proof</span>
        {proven ? (
          <div className="proof-shots">
            {proof.map((url) => (
              <Media key={url} src={url} play />
            ))}
          </div>
        ) : (
          <span className="muted">
            Photos of the thing in use will appear here{worn?.when ? ` after ${worn.when}` : ""}.
          </span>
        )}
      </div>
    </div>
  );
}

/** Подпись по краям: длинная целиком не читается, а по краям узнаётся. */
function short(at: string): string {
  return `${at.slice(0, 4)}..${at.slice(-4)}`;
}

/** Время ставки по часам читателя: торг идёт неделю, поэтому и с днём. */
function clock(at: string): string {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Время ставки в истории - коротко, сутками: «Oct 17, 10:05». */
function stamp(at: string): string {
  const when = new Date(at);
  return `${when.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

function day(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
