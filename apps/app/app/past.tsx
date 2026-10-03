"use client";

import { useEffect, useRef, useState } from "react";
import { closeDay, formatUsd } from "@oxar/core";
import { ThingStage, type Stage } from "@oxar/stage";
import type { HeldRow } from "@/lib/auction";
import { loadWinners } from "@/lib/winners";
import { PhotoView } from "./auction/photo.tsx";
// TEMP_FRONT: тот же временный снимок и замер, что на торге и маркете.
import { TEMP_FRONT_QUADS, TEMP_SHOTS } from "./auction/temp-photo.ts";

/**
 * Прошедший торг слайдом карусели - той же карточкой, что живой.
 *
 * Прежде он висел плашкой внизу экрана: заголовок, строка цифр и ряд
 * логотипов рядком. Логотипы в ней были сами по себе, а не на вещи, и вся
 * плашка читалась сноской под экраном. Здесь он показан на самой вещи - тем
 * же кадром, тем же 3D и теми же местами, - и отличается от живого только
 * пилюлей SOLD и тем, что считает собранное, а не часы.
 */
export function PastHero({ held, onOpen }: { held: HeldRow; onOpen: () => void }) {
  // Что напечатали: верхние ставки того торга, местами вещи. Берём только
  // победителей именно этого закрытия - у вещи могло быть и несколько.
  const [art, setArt] = useState<Record<string, string>>({});
  useEffect(() => {
    void loadWinners(held.thingId).then((all) => {
      const won: Record<string, string> = {};
      for (const one of all) {
        if (one.status !== "won") continue;
        if (closeDay(one.closesAt) !== closeDay(held.closesAt)) continue;
        won[one.code] = one.mediaUrl;
      }
      setArt(won);
    });
  }, [held]);

  // 3D включается рукой: мегабайт модели не грузим раньше, чем попросили.
  const [look, setLook] = useState<"live" | "photo">("photo");
  const stage = useRef<Stage | null>(null);
  // Сцена и победители приходят в любом порядке, а выключенное 3D сцену
  // разбирает - поэтому одеваем вещь на каждую готовую сцену и на каждый
  // прочитанный список.
  const [ready, setReady] = useState(0);
  useEffect(() => {
    for (const [code, url] of Object.entries(art)) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => stage.current?.show(code, image);
      image.src = url;
    }
  }, [art, ready]);

  const logos = Object.keys(art).length;
  return (
    <div className="hero">
      <div className={look === "live" ? "hero-photo in3d" : "hero-photo"}>
        {look === "live" ? (
          <div className="hero-stage">
            <ThingStage
              picked={null}
              onPick={() => {}}
              stage={stage}
              onReady={() => setReady((was) => was + 1)}
            />
          </div>
        ) : held.house ? (
          // Наша вещь: места на кадре несут логотипы победителей.
          <PhotoView
            shot={TEMP_SHOTS[0] as string}
            quads={TEMP_FRONT_QUADS}
            drawFrames
            picked=""
            onPick={onOpen}
            art={art}
          />
        ) : (
          // Вещь продавца: его снимок, модели к ней у нас нет.
          held.photo && (
            <button type="button" className="hero-shot" onClick={onOpen}>
              <img src={held.photo} alt={held.title} />
            </button>
          )
        )}
        {held.house && (
          <span className="look-flip">
            {(["live", "photo"] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={look === view ? "look-pick on" : "look-pick"}
                onClick={() => setLook(view)}
              >
                {view === "live" ? "3D" : "Photo"}
              </button>
            ))}
          </span>
        )}
        <span className="now-pill done">SOLD</span>
      </div>
      <div className="hero-card">
        <div>
          <h2 className="hero-name">{held.title}</h2>
          <p className="hero-who">
            Closed{" "}
            {new Date(held.closesAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="hero-stat">
          <span className="muted">
            {logos} {logos === 1 ? "logo" : "logos"} placed
          </span>
          <span className="hero-top">
            {formatUsd(held.raisedCents)} <span className="hero-top-cap">raised</span>
          </span>
        </div>
        <button type="button" className="primary wide" onClick={onOpen}>
          See results
        </button>
      </div>
    </div>
  );
}
