"use client";

import { useRef, useState, useEffect } from "react";
import { houseShape, ThingStage, type Corners, type Stage, type Views } from "@oxar/stage";

/**
 * Вещь с местами - главное на карточке торга: мы продаём место на вещи, и без
 * мест карточка ничем не отличалась бы от карточки фандрейзинга.
 *
 * Кадр снимается с той же 3D-сцены, что в приложении, вместе с логотипами
 * победителей, а сцена отдаёт, где на этом кадре лежит каждое место. Поверх
 * кадра - наши кадрирующие уголки: у проданного места внутри логотип, у
 * свободного - номер. Наведение показывает, кто и за сколько.
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

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/** Уголки рамки: от каждого угла - короткие отрезки вдоль двух сторон. */
function brackets(corners: Corners): string {
  const share = 0.24;
  return corners
    .map((corner, at) => {
      const next = corners[(at + 1) % 4];
      const prev = corners[(at + 3) % 4];
      const toward = (to: [number, number]) => [corner[0] + (to[0] - corner[0]) * share, corner[1] + (to[1] - corner[1]) * share];
      const [ax, ay] = toward(next);
      const [bx, by] = toward(prev);
      return `M${ax} ${ay} L${corner[0]} ${corner[1]} L${bx} ${by}`;
    })
    .join(" ");
}

/** Кадр вещи с размеченными местами. */
export function SpotView({ view, won }: { view: View; won: Record<string, Spot> }) {
  const visible = Object.entries(view.quads).filter((entry): entry is [string, Corners] => entry[1] !== null);
  // Номер места - по порядку кода, как на торге.
  const order = Object.keys(view.quads).sort();
  return (
    <div className="v2-spotview">
      <img src={view.src} alt="" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden>
        {visible.map(([code, corners]) => (
          <path key={code} d={brackets(corners)} className={won[code] ? "sold" : "open"} />
        ))}
      </svg>
      {visible.map(([code, corners]) => {
        const xs = corners.map(([x]) => x);
        const ys = corners.map(([, y]) => y);
        const left = Math.min(...xs) * 100;
        const top = Math.min(...ys) * 100;
        const spot = won[code];
        const number = order.indexOf(code) + 1;
        return (
          <span
            key={code}
            className={spot ? "v2-spot sold" : "v2-spot open"}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${Math.max(...xs) * 100 - left}%`,
              height: `${Math.max(...ys) * 100 - top}%`,
            }}
            data-tip={spot ? `Spot ${number} · ${spot.brand || "won"} · ${usd(spot.cents)}` : `Spot ${number} · open`}
          >
            {!spot && <b>{number}</b>}
          </span>
        );
      })}
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
