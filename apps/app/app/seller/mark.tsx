"use client";

import { useEffect, useRef, useState } from "react";
import { outlineBox, simplifyOutline, type Point } from "@oxar/core";
import type { Marked } from "@/lib/seller";
import { Bar, SpotMark } from "./parts.tsx";

/** Меньше этого место не считается: случайное касание, а не разметка. */
const MIN_SIDE = 0.04;

/**
 * Разметка мест: обводишь пальцем или мышью - появляется место. Доли кадра, а не
 * пиксели: снимок показывают разного размера, а место обязано остаться на
 * той же части вещи.
 *
 * Размечать можно каждый снимок: сверху переключатель, и место помнит, на
 * каком снимке оно стоит. Номера мест сквозные.
 */
export function MarkSpots({
  photos,
  onBack,
  onSend,
  sending,
  failed,
}: {
  photos: string[];
  onBack: () => void;
  onSend: (spots: Marked[], title: string) => void;
  sending: boolean;
  failed: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<Marked[]>([]);
  const [shown, setShown] = useState(0);
  const [title, setTitle] = useState("");
  // Контур, который сейчас ведут пальцем: точки в долях кадра.
  const [draft, setDraft] = useState<Point[] | null>(null);
  const path = useRef<Point[] | null>(null);

  // Рамку тянут пальцем, часто от левого края - а там же живёт жест
  // «назад» браузера (Safari, встроенные браузеры кошельков). touch-action
  // его не останавливает; останавливает только отменённое касание, а
  // слушатели касаний в React пассивные и отменить не могут. Поэтому свой,
  // непассивный. События указателя, по которым рисуется рамка, при этом
  // приходят как прежде.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const stop = (event: TouchEvent) => event.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);

  function at(event: React.PointerEvent): Point {
    const frame = box.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (event.clientX - frame.left) / frame.width)),
      Math.min(1, Math.max(0, (event.clientY - frame.top) / frame.height)),
    ];
  }

  return (
    <>
      <Bar title="Mark the spots" onBack={onBack} step="2 of 3" />
      <p className="sl-lead">
        Draw around each spot you want to sell - with a finger or the mouse.
        Mark flat areas that stay visible when you use the thing.
      </p>

      {photos.length > 1 && (
        <div className="sl-mark-shots">
          {photos.map((url, index) => (
            <button
              type="button"
              key={url}
              className={index === shown ? "on" : ""}
              aria-label={`Photo ${index + 1}`}
              onClick={() => {
                setShown(index);
                setDraft(null);
              }}
            >
              <img src={url} alt="" />
              <span>{spots.filter((spot) => spot.photo === index).length}</span>
            </button>
          ))}
        </div>
      )}

      <div
        className="sl-photo"
        ref={box}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          path.current = [at(event)];
          setDraft(path.current);
        }}
        onPointerMove={(event) => {
          const points = path.current;
          if (!points) return;
          // Точки гуще полупроцента кадра - это дрожь, а не форма.
          const next = at(event);
          const last = points[points.length - 1]!;
          if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 0.005) return;
          path.current = [...points, next];
          setDraft(path.current);
        }}
        onPointerUp={() => {
          const points = path.current;
          path.current = null;
          setDraft(null);
          if (!points || points.length < 3) return;
          // Контур замыкается сам: отпустил палец - фигура готова.
          const outline = simplifyOutline(points, 0.004);
          const rect = outlineBox(outline);
          if (rect.w >= MIN_SIDE && rect.h >= MIN_SIDE) {
            setSpots((was) => [...was, { ...rect, photo: shown, outline }]);
          }
        }}
      >
        {photos[shown] ? <img src={photos[shown]} alt="" /> : <span className="sl-photo-cap">Your photo</span>}
        {spots.map((spot, index) =>
          spot.photo === shown ? (
            <SpotMark key={index} rect={spot} outline={spot.outline} number={index + 1} />
          ) : null,
        )}
        {draft && (
          <svg className="sl-draft" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={draft.map(([x, y]) => `${x * 100},${y * 100}`).join(" ")} />
          </svg>
        )}
      </div>

      <div className="sl-marked">
        <span>
          {spots.length === 1 ? "1 spot marked" : `${spots.length} spots marked`}
        </span>
        <div>
          <button
            type="button"
            className="sl-pill"
            disabled={spots.length === 0}
            onClick={() => setSpots((was) => was.slice(0, -1))}
          >
            Undo
          </button>
          <button
            type="button"
            className="sl-pill"
            disabled={spots.length === 0}
            onClick={() => setSpots([])}
          >
            Clear
          </button>
        </div>
      </div>

      {spots.length > 0 && (
        <div className="sl-chips">
          {spots.map((_, index) => (
            <span className="sl-chip" key={index}>
              Spot {index + 1}
              <button
                type="button"
                aria-label={`Remove spot ${index + 1}`}
                onClick={() => setSpots((was) => was.filter((__, other) => other !== index))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Название даёт продавец: его видят покупатели на маркете. */}
      <label className="sl-field sl-name-field">
        Name your thing
        <span className="sl-input soft">
          <input
            value={title}
            maxLength={60}
            placeholder="Laptop lid, backpack, jacket"
            onChange={(event) => setTitle(event.target.value)}
          />
        </span>
      </label>

      {failed && (
        <p className="bad">Could not save the thing. Check the connection and try again.</p>
      )}

      <button
        type="button"
        className="sl-btn dark"
        disabled={spots.length === 0 || !title.trim() || sending}
        onClick={() => onSend(spots, title.trim())}
      >
        {sending ? "Saving…" : "Next: set prices"}
      </button>
    </>
  );
}
