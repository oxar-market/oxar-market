"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import type { HeldRow } from "@/lib/auction";
import { loadBidTimeline, loadWinners, type BidEvent, type Winner } from "@/lib/winners";

/**
 * Итоги закрытого торга: кто что выиграл и за сколько.
 *
 * Тот же вид, что у пилота с Delora, только места здесь проданы с торгов:
 * логотипы победителей стоят на вещи, ниже - место, бренд и ставка. Ползунок
 * проматывает торг назад: как сменялись лидеры каждого места. Ставки и
 * так открыты всем, поэтому и итоги видит любой с маркета.
 */
export function ResultsView({ held, onBack }: { held: HeldRow; onBack: () => void }) {
  const stage = useRef<Stage | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [list, setList] = useState<Winner[] | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    void loadWinners(held.thingId).then((all) =>
      // Строка на маркете - один день закрытия; торги вещи в другие дни сюда
      // не подмешиваем.
      setList(all.filter((one) => one.status === "won" && one.closesAt.slice(0, 10) === held.closesAt.slice(0, 10))),
    );
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
          <span className="muted">
            {at} of {events.length} bids
          </span>
        </div>
      )}

      <div className="case-proof">
        <span className="case-proof-head">Proof</span>
        <span className="muted">Photos of the printed thing will appear here after printing.</span>
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
    </>
  );
}

/** Время ставки по часам читателя: торг идёт неделю, поэтому и с днём. */
function clock(at: string): string {
  return new Date(at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function day(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
