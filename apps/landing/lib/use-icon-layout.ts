"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Перетаскивание иконок по рабочему столу.
 *
 * Иконка ложится туда, куда её отпустили, и на телефоне тоже: сетка со сменой
 * порядка вела себя не как рабочий стол, а как список. Позиция хранится в
 * процентах от размера стола, поэтому раскладка не разъезжается на другом
 * разрешении.
 *
 * Пока палец или мышь двигаются, transform пишется прямо в DOM. Через состояние
 * это был бы ре-рендер на каждый кадр и заметное дёрганье.
 */

const STORAGE_KEY = "oxar.desktop.layout.v2";
const MOBILE_QUERY = "(max-width: 760px)";
/** Меньше этого считаем не перетаскиванием, а нажатием. */
const CLICK_SLOP = 6;
/** Иконка на телефоне шире по площади, поэтому промах пальцем больше. */
const TOUCH_SLOP = 10;

export type Point = { x: number; y: number };
export type Layout = Record<string, Point>;

type Stored = { positions: Layout };

type DragState = {
  slug: string;
  pointerId: number;
  startX: number;
  startY: number;
  element: HTMLElement;
  moved: boolean;
};

export function useIconLayout(defaults: Layout, mobileDefaults: Layout) {
  const [positions, setPositions] = useState<Layout>(defaults);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  // Читаем сохранённую раскладку после гидратации: на сервере localStorage нет,
  // а несовпадение разметки дало бы ошибку гидратации.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Stored;
        if (saved.positions) {
          setPositions({ ...defaults, ...saved.positions });
          return;
        }
      }
      // Раскладки нет: на узком экране проценты от десктопа положили бы иконки
      // друг на друга и за правый край.
      if (isMobile()) setPositions(mobileDefaults);
    } catch {
      // Повреждённая запись не должна ломать страницу.
    }
    // Значения по умолчанию не меняются во время жизни страницы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next: Stored) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Приватный режим - просто не запоминаем раскладку.
    }
  }, []);

  const isMobile = () => window.matchMedia(MOBILE_QUERY).matches;

  const onPointerDown = useCallback((slug: string, event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const element = event.currentTarget as HTMLElement;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Захват указателя не критичен: без него драг просто прервётся, если
      // курсор уйдёт с иконки.
    }
    // У иконки есть переход на transform для наведения. Во время драга он
    // обязан быть выключен: иначе иконка тянется за курсором с запозданием,
    // а конечную позицию мы считываем в середине анимации и она уезжает не
    // туда, куда её отпустили.
    element.style.transition = "none";

    drag.current = {
      slug,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      element,
      moved: false,
    };
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    const slop = event.pointerType === "mouse" ? CLICK_SLOP : TOUCH_SLOP;
    if (Math.abs(dx) > slop || Math.abs(dy) > slop) {
      state.moved = true;
      state.element.classList.add("lifted");
    }
    if (!state.moved) return;

    state.element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    state.element.style.zIndex = "4";
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent, onClick: (slug: string) => void) => {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      drag.current = null;
      state.element.classList.remove("lifted");

      const wasDrag = state.moved;
      const reset = () => {
        state.element.style.transform = "";
        state.element.style.zIndex = "";
        state.element.style.transition = "";
      };

      if (!wasDrag) {
        reset();
        // Нажатие без движения - это открытие иконки.
        onClick(state.slug);
        return;
      }

      const box = surface.current?.getBoundingClientRect();
      if (!box) {
        reset();
        return;
      }

      const rect = state.element.getBoundingClientRect();
      const maxX = isMobile() ? 74 : 92;
      const x = clamp(((rect.left - box.left) / box.width) * 100, 0, maxX);
      const y = clamp(((rect.top - box.top) / box.height) * 100, 0, 88);

      // Новые координаты пишем в DOM в том же кадре, в котором убираем
      // transform. Если сначала стереть transform и ждать ре-рендер React,
      // иконка на один кадр прыгает на старое место и это видно как рывок.
      state.element.style.left = `${x}%`;
      state.element.style.top = `${y}%`;
      state.element.style.transform = "";
      state.element.style.zIndex = "";

      const next = { ...positions, [state.slug]: { x, y } };
      setPositions(next);
      persist({ positions: next });

      // Переход возвращаем только со следующего кадра, иначе он подхватит
      // сброс transform и анимирует его.
      requestAnimationFrame(() => {
        state.element.style.transition = "";
      });
    },
    [positions, persist],
  );

  return { positions, surface, onPointerDown, onPointerMove, onPointerUp };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
