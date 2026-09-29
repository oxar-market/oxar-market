"use client";

import { useEffect, useRef, useState } from "react";
import type { Marked, Rect } from "@/lib/seller";
import { Bar, SpotMark } from "./parts.tsx";

/** Меньше этого место не считается: случайное касание, а не разметка. */
const MIN_SIDE = 0.04;

/**
 * Разметка мест: тянешь по снимку - появляется место. Доли кадра, а не
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
  onSend: (spots: Marked[]) => void;
  sending: boolean;
  failed: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [spots, setSpots] = useState<Marked[]>([]);
  const [shown, setShown] = useState(0);
  const [draft, setDraft] = useState<Rect | null>(null);
  const from = useRef<{ x: number; y: number } | null>(null);

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

  function at(event: React.PointerEvent): { x: number; y: number } {
    const frame = box.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - frame.left) / frame.width)),
      y: Math.min(1, Math.max(0, (event.clientY - frame.top) / frame.height)),
    };
  }

  function rectOf(a: { x: number; y: number }, b: { x: number; y: number }): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    };
  }

  return (
    <>
      <Bar title="Mark the spots" onBack={onBack} step="2 of 3" />
      <p className="sl-lead">
        Drag on the photo to mark a spot someone can rent. Mark flat areas
        that stay visible when you use the thing.
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
          from.current = at(event);
          setDraft(null);
        }}
        onPointerMove={(event) => {
          if (from.current) setDraft(rectOf(from.current, at(event)));
        }}
        onPointerUp={(event) => {
          if (!from.current) return;
          const rect = rectOf(from.current, at(event));
          from.current = null;
          setDraft(null);
          if (rect.w >= MIN_SIDE && rect.h >= MIN_SIDE) setSpots((was) => [...was, { ...rect, photo: shown }]);
        }}
      >
        {photos[shown] ? <img src={photos[shown]} alt="" /> : <span className="sl-photo-cap">Your photo</span>}
        {spots.map((spot, index) =>
          spot.photo === shown ? <SpotMark key={index} rect={spot} number={index + 1} /> : null,
        )}
        {draft && <SpotMark rect={draft} number={spots.length + 1} />}
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

      {failed && (
        <p className="bad">Could not send the thing. Check the connection and try again.</p>
      )}

      <button
        type="button"
        className="sl-btn dark"
        disabled={spots.length === 0 || sending}
        onClick={() => onSend(spots)}
      >
        {sending ? "Sending…" : "Send to OXAR"}
      </button>
    </>
  );
}
