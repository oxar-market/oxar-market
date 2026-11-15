"use client";

import { useRef, useState, useEffect } from "react";
import { houseShape, ThingStage, type Corners, type Stage, type Views } from "@oxar/stage";

/**
 * Кадр вещи для карточки торга: снимается с той же 3D-сцены, что в
 * приложении, вместе с логотипами победителей. Сцена заодно отдаёт, где на
 * кадре лежит каждое место, - по ним выбирается ракурс и считаются места.
 */

export type Spot = { url: string; brand: string; cents: number };

export type View = { src: string; quads: Record<string, Corners | null> };

/** Снимок вещи с местами. Сцена собирается невидимой и сразу разбирается. */
export function Shooter({
  model,
  won,
  onDone,
}: {
  model: string | null;
  won: Record<string, Spot>;
  onDone: (view: View | null) => void;
}) {
  const stage = useRef<Stage | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  async function ready(views: Views) {
    await Promise.all(
      Object.entries(won).map(
        ([code, spot]) =>
          new Promise<void>((resolve) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
              stage.current?.show(code, image);
              resolve();
            };
            image.onerror = () => resolve();
            image.src = spot.url;
          }),
      ),
    );
    const shots = stage.current?.shots() ?? views.shots;
    // Ракурс, где видно больше всего мест: у вана места по обоим бортам, и
    // кадр в лоб показал бы одну решётку.
    let best = 0;
    let most = -1;
    views.quads.forEach((seen, at) => {
      const count = Object.values(seen).filter(Boolean).length;
      if (count > most) {
        most = count;
        best = at;
      }
    });
    done.current(shots[best] ? { src: shots[best], quads: views.quads[best] } : null);
  }

  useEffect(() => {
    const giveUp = setTimeout(() => done.current(null), 20000);
    return () => clearTimeout(giveUp);
  }, []);

  return (
    <div className="v2-shooter" aria-hidden>
      <ThingStage shape={houseShape(model)} picked={null} onPick={() => {}} stage={stage} onReady={(views) => void ready(views)} />
    </div>
  );
}

/**
 * Ёлка новогоднего торга, пока модели нет: места игрушками, звезда сверху.
 * Те же уголки и номера, что на настоящих вещах.
 */
const TREE: [number, number][] = [
  [50, 30], [42, 44], [58, 44], [34, 58], [50, 58], [66, 58], [26, 72], [42, 72], [58, 72], [74, 72],
];

export function TreeView() {
  return (
    <div className="v2-tree" aria-hidden>
      <span className="v2-tree-star" data-tip="Star · top spot">
        <b>★</b>
      </span>
      {TREE.map(([x, y], at) => (
        <span key={at} className="v2-spot open" style={{ left: `${x - 4}%`, top: `${y - 5}%`, width: "8%", height: "10%" }} data-tip={`Spot ${at + 1} · opens in December`}>
          <i className="v2-c tl" />
          <i className="v2-c tr" />
          <i className="v2-c bl" />
          <i className="v2-c br" />
          <b>{at + 1}</b>
        </span>
      ))}
    </div>
  );
}

/** Снимки всех вещей - по одной сцене за раз. */
export function useViews(list: { id: string; model: string | null; won: Record<string, Spot> }[]) {
  const [views, setViews] = useState<Record<string, View | null>>({});
  const next = list.find((one) => !(one.id in views)) ?? null;
  const shooter = next ? (
    <Shooter key={next.id} model={next.model} won={next.won} onDone={(view) => setViews((all) => ({ ...all, [next.id]: view }))} />
  ) : null;
  return { views, shooter };
}
