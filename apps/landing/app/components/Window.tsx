"use client";

import { useEffect, useRef } from "react";

/**
 * Окно рабочего стола.
 *
 * Драг идёт мимо React: на каждое движение указателя мы пишем transform прямо
 * в DOM через ref. Если гонять это через состояние, будет ре-рендер на каждый
 * кадр и заметное дёрганье. Состояние тут вообще не нужно - позицию окна никто,
 * кроме самого окна, не читает.
 *
 * Анимируются только transform и opacity: любая анимация размеров или
 * координат заставляет браузер пересчитывать лэйаут в каждом кадре.
 */
export function Window({
  title,
  onClose,
  wide = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Окну с макетом профиля нужно больше места, чем текстовому файлу. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; startX: number; startY: number } | null>(
    null,
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function startDrag(event: React.PointerEvent) {
    // Тянуть можно только за заголовок, и только основной кнопкой.
    if (event.button !== 0) return;
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX - offset.current.x,
      startY: event.clientY - offset.current.y,
    };
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  function onDrag(event: React.PointerEvent) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId || !frame.current) return;
    offset.current = {
      x: event.clientX - state.startX,
      y: event.clientY - state.startY,
    };
    frame.current.style.transform = `translate3d(${offset.current.x}px, ${offset.current.y}px, 0)`;
  }

  function endDrag(event: React.PointerEvent) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  return (
    <div className="window-layer" role="dialog" aria-label={title}>
      <div className={wide ? "window wide" : "window"} ref={frame}>
        <div
          className="window-bar"
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <button
            type="button"
            className="window-close"
            onClick={onClose}
            aria-label="Close"
          />
          <span className="window-title">{title}</span>
        </div>
        <div className="window-body">{children}</div>
      </div>
    </div>
  );
}
