"use client";

import { useEffect, useRef, useState } from "react";
import { formatUsd } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import type { HeldRow } from "@/lib/auction";
import { loadWinners, type Winner } from "@/lib/winners";

/**
 * Итоги закрытого торга: кто что выиграл и за сколько.
 *
 * Тот же вид, что у пилота с Delora, только места здесь проданы с торгов:
 * логотипы победителей стоят на вещи, ниже - место, бренд и ставка. Ставки и
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

  // Логотипы встают на модель, когда собрались и сцена, и список. Картинки с
  // другого домена просят crossOrigin, иначе сцена их не примет.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ready || !list) return;
    for (const one of list) {
      if (!one.code) continue;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => stage.current?.show(one.code, image);
      image.src = one.mediaUrl;
    }
  }, [ready, list]);

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

function day(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
