"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { takeOpenPoint } from "@/lib/open-from";

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

  // Точка отсчёта масштабирования - иконка, по которой нажали. Считается после
  // вёрстки, а не до: до неё у окна нет ни размеров, ни места на экране.
  // transform-origin принимает значения и за пределами блока, поэтому иконка,
  // лежащая далеко от центра, работает как есть.
  useLayoutEffect(() => {
    const from = takeOpenPoint();
    const box = frame.current;
    if (!from || !box) return;
    const rect = box.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    box.style.transformOrigin = `${((from.x - rect.left) / rect.width) * 100}% ${
      ((from.y - rect.top) / rect.height) * 100
    }%`;
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function isSheet() {
    return window.matchMedia("(max-width: 760px)").matches;
  }

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

    // На телефоне это не окно, а лист: он ходит только вниз и только чтобы
    // закрыться. Вверх не тянем, иначе контент уедет под статусбар.
    const sheet = isSheet();
    offset.current = {
      x: sheet ? 0 : event.clientX - state.startX,
      y: sheet
        ? Math.max(0, event.clientY - state.startY)
        : event.clientY - state.startY,
    };
    frame.current.style.transform = `translate3d(${offset.current.x}px, ${offset.current.y}px, 0)`;
  }

  function endDrag(event: React.PointerEvent) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;

    if (!isSheet() || !frame.current) return;

    // Утянул лист вниз больше чем на 110 пикселей - закрываем, как в
    // мобильных системах. Иначе возвращаем на место.
    if (offset.current.y > 110) {
      onClose();
      return;
    }
    frame.current.style.transition = "transform 0.18s var(--spring)";
    frame.current.style.transform = "translate3d(0, 0, 0)";
    offset.current = { x: 0, y: 0 };
    window.setTimeout(() => {
      if (frame.current) frame.current.style.transition = "";
    }, 200);
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
          <span className="sheet-grab" aria-hidden />
          <button
            type="button"
            className="window-close"
            onClick={onClose}
            aria-label="Close"
          />
          <span className="window-title">{title}</span>
          {/* На телефоне точка в углу не читается как кнопка и попадает под
              палец плохо - нужен крестик в круге размером с палец. */}
          <button
            type="button"
            className="sheet-done"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path
                d="M7.5 7.5l9 9m0-9l-9 9"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="window-body">{children}</div>
      </div>
    </div>
  );
}
