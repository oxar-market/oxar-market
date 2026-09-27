"use client";

import { useEffect, useRef, useState } from "react";
import { SUITCASE, SUITCASE_SPOTS, ThingStage, type Stage } from "@oxar/stage";
import type { PilotCase } from "@/lib/cases";

/**
 * Пилот: вещь, на которой места заняты без торгов.
 *
 * Выглядит как закрытый торг, но честно говорит, чем он не был: ставок и
 * оплаты не было, место отдали, чтобы проверить, что обе стороны этого хотят.
 * Доказательство - фото вещи в дороге; пока его нет, так и написано.
 */
export function CaseView({ pilot, onBack }: { pilot: PilotCase; onBack: () => void }) {
  const stage = useRef<Stage | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  // Наклейки встают на модель, как только она собралась. Картинки свои, из
  // public, crossOrigin им не нужен.
  function dress() {
    for (const spot of pilot.spots) {
      const image = new Image();
      image.onload = () => stage.current?.show(spot.code, image);
      image.src = spot.logo;
    }
  }

  const label = (code: string) =>
    SUITCASE_SPOTS.find((spot) => spot.code === code)?.label ?? code;

  return (
    <>
      <button type="button" className="case-back" onClick={onBack}>
        &larr; Market
      </button>

      <div className="case-head">
        <span className="case-pill">PILOT</span>
        <h2 className="hero-name">{pilot.title}</h2>
        <p className="hero-who">
          With{" "}
          <a className="case-partner" href={pilot.partnerUrl} target="_blank" rel="noreferrer">
            {pilot.partner}
          </a>{" "}
          · {day(pilot.date)}
        </p>
      </div>

      <div className="case-stage">
        <ThingStage
          shape={SUITCASE}
          picked={picked}
          onPick={(code) => setPicked((was) => (was === code ? null : code))}
          stage={stage}
          onReady={dress}
        />
      </div>

      <div className="case-proof">
        <span className="case-proof-head">Proof</span>
        <span className="muted">
          Photos of the suitcases on the road are coming soon.
        </span>
      </div>

      <h2 className="mk-head">On the suitcase</h2>
      <div className="held-list">
        {pilot.spots.map((spot) => (
          <button
            type="button"
            key={spot.code}
            className={spot.code === picked ? "case-row on" : "case-row"}
            onClick={() => setPicked((was) => (was === spot.code ? null : spot.code))}
          >
            <span className="held-date">{label(spot.code)}</span>
            <span>{spot.brand}</span>
          </button>
        ))}
      </div>

      <p className="case-note">
        Our first placement off a shirt. We printed the stickers, {pilot.partner}{" "}
        put them on their suitcases. No auction and no payment - a first test
        that both sides want this.
      </p>
    </>
  );
}

function day(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
