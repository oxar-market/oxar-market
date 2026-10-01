"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import type { HeldRow } from "@/lib/auction";
import { loadWorn, WornInfo, type Worn } from "./worn.tsx";
import { loadBidTimeline, loadProof, loadWinners, type BidEvent, type Winner } from "@/lib/winners";

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

  useEffect(() => {
    window.scrollTo({ top: 0 });
    void loadWorn(held.thingId).then(setWorn);
    void loadProof(held.thingId).then(setProof);
    void loadWinners(held.thingId).then((all) => {
      // Строка на маркете - один день закрытия; торги вещи в другие дни сюда
      // не подмешиваем.
      const sameDay = all.filter((one) => one.closesAt.slice(0, 10) === held.closesAt.slice(0, 10));
      setList(sameDay.filter((one) => one.status === "won"));
      setSettled(sameDay.every((one) => one.status === "won"));
    });
  }, [held]);

  // История торга: все ставки по времени. Ползунок стоит на числе уже
  // случившихся ставок; по умолчанию - на конце, то есть на победителях.
  const [events, setEvents] = useState<BidEvent[]>([]);
  const [step, setStep] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    void loadBidTimeline(held.thingId, held.closesAt).then(setEvents);
  }, [held]);
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
  }, [ready, events, at]);
  const current = at > 0 ? events[at - 1] : null;
  const signature = list?.find((one) => one.code === picked)?.settleSignature ?? null;
  const proven = proof.length > 0;

  return (
    <>
      <button type="button" className="case-back" onClick={onBack}>
        &larr; Market
      </button>

      <div className="case-head">
        <span className="case-pill">ENDED</span>
        <h2 className="hero-name">{held.title}</h2>
        <p className="hero-who">
          Closed {day(held.closesAt)} · {formatUsd(held.raisedCents)} raised
        </p>
      </div>

      {/* Покупатель места должен знать, на ком, где и когда будет вещь. */}
      <WornInfo thingId={held.thingId} />

      {held.house ? (
        <div className="case-stage">
          <ThingStage
            picked={picked}
            onPick={(code) => setPicked((was) => (was === code ? null : code))}
            stage={stage}
            onReady={() => setReady(true)}
          />
        </div>
      ) : (
        held.photo && <img className="results-photo" src={held.photo} alt={held.title} />
      )}

      {events.length > 0 && (
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
            <span className="results-time-now">
              {current
                ? `${clock(current.at)} · ${current.spot} · ${current.brand} ${formatUsd(current.amountCents)}`
                : "Before the first bid"}
            </span>
          </div>
          {/* Свой ползунок: засечка на каждую ставку, пройденное - красным. */}
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
          <span className="muted">
            {at} of {events.length} bids
          </span>
        </div>
      )}

      <div className="case-proof">
        <span className="case-proof-head">Proof</span>
        {proven ? (
          <div className="proof-shots">
            {proof.map((url) => (
              <img key={url} src={url} alt="" />
            ))}
          </div>
        ) : (
          <span className="muted">Photos of the thing in use will appear here.</span>
        )}
      </div>

      <h2 className="mk-head">Winners</h2>
      {list !== null && list.length === 0 && <p className="muted">No spot on this thing found a winner.</p>}
      <div className="held-list">
        {(list ?? []).map((one) => (
          <button
            type="button"
            key={one.lotId}
            className={one.code === picked ? "case-row results-row on" : "case-row results-row"}
            onClick={() => setPicked((was) => (was === one.code ? null : one.code))}
          >
            <img className="results-logo" src={one.mediaUrl} alt="" />
            <span className="results-spot">{one.spot}</span>
            <span className="results-brand">{one.brand}</span>
            <span className="results-sum">{formatUsd(one.amountCents)}</span>
          </button>
        ))}
      </div>

      <h2 className="mk-head">What happens now</h2>
      <ol className="rs-steps">
        <li className="done">
          <b>Auction ended</b>
          <span>{clock(held.closesAt)}. The highest bid on each spot won.</span>
        </li>
        <li className={settled ? "done" : settled === false ? "now" : ""}>
          <b>Escrow settled</b>
          <span>Winning bids paid out. Every other bid refunded automatically.</span>
        </li>
        <li className={proven ? "done" : settled ? "now" : ""}>
          <b>Preparing</b>
          <span>Winning artwork goes on the thing as uploaded.</span>
        </li>
        <li className={proven ? "done" : ""}>
          <b>Proof</b>
          <span>
            {worn?.when ? `From ${worn.when}` : "Date to be announced"}. Photos of the thing in use
            appear here.
          </span>
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
    </>
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

function day(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
