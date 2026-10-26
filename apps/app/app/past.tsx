"use client";

import { useEffect, useRef, useState } from "react";
import { closeDay } from "@oxar/core";
import { houseShape, isShirt, ThingStage, type Stage } from "@oxar/stage";
import type { HeldRow } from "@/lib/auction";
import { loadWinners } from "@/lib/winners";
import { PhotoView } from "./auction/photo.tsx";
import { WornLine } from "./worn-line.tsx";
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
  // Кроме нашей вещи не футболки: снимков у неё нет, только её модель.
  const own = held.house && !isShirt(held.model);
  const [chosen, setLook] = useState<"live" | "photo">("photo");
  const look = own ? "live" : chosen;
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
              shape={houseShape(held.model)}
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
          // Вещь продавца: его снимок, а нет снимка - пруф или кадр модели.
          (held.photo ?? held.cover) && (
            <button type="button" className="hero-shot" onClick={onOpen}>
              <img src={(held.photo ?? held.cover) as string} alt={held.title} />
            </button>
          )
        )}
        {held.house && !own && (
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
      </div>
      {/* Текст - как у живого торга; сколько собрали - в полосе цифр. */}
      <div className="hero-text">
        <span className="hero-pill done">
          <span className="dot" />
          Sold
        </span>
        <h2 className="hero-name">{held.title}</h2>
        {held.about && <p className="hero-about">{held.about}</p>}
        <WornLine worn={held.worn} />
        <p className="hero-who">
          {logos} {logos === 1 ? "logo" : "logos"} placed. Closed{" "}
          {new Date(held.closesAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
          .
        </p>
        {/* Кто попал на вещь - логотипами победителей. */}
        {logos > 0 && (
          <div className="hero-logos">
            {Object.entries(art)
              .slice(0, 8)
              .map(([code, url]) => (
                <img key={code} src={url} alt="" />
              ))}
          </div>
        )}
        <button type="button" className="primary hero-go" onClick={onOpen}>
          See results <span aria-hidden>&rarr;</span>
        </button>
      </div>
    </div>
  );
}
