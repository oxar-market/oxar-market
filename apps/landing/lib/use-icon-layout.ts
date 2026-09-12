"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Перетаскивание иконок по рабочему столу.
 *
 * На большом экране иконка ложится туда, куда её отпустили: позиция хранится в
 * процентах от размера стола, поэтому раскладка не разъезжается на другом
 * разрешении. На телефоне свободных координат нет - там сетка, и перетаскивание
 * меняет порядок иконок, как на домашнем экране телефона.
 *
 * Пока палец или мышь двигаются, transform пишется прямо в DOM. Через состояние
 * это был бы ре-рендер на каждый кадр и заметное дёрганье.
 */

const STORAGE_KEY = "oxar.desktop.layout.v1";
const MOBILE_QUERY = "(max-width: 760px)";
/** Меньше этого считаем не перетаскиванием, а нажатием. */
const CLICK_SLOP = 6;
/** На телефоне драг начинается после удержания, иначе ломается прокрутка. */
const HOLD_MS = 260;

export type Point = { x: number; y: number };
export type Layout = Record<string, Point>;

type Stored = { positions: Layout; order: string[] };

type DragState = {
  slug: string;
  pointerId: number;
  startX: number;
  startY: number;
  element: HTMLElement;
  moved: boolean;
  active: boolean;
  holdTimer: number | null;
};

export function useIconLayout(slugs: string[], defaults: Layout) {
  const [positions, setPositions] = useState<Layout>(defaults);
  const [order, setOrder] = useState<string[]>(slugs);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);

  // Читаем сохранённую раскладку после гидратации: на сервере localStorage нет,
  // а несовпадение разметки дало бы ошибку гидратации.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Stored;
      if (saved.positions) setPositions({ ...defaults, ...saved.positions });
      if (saved.order?.length) {
        const known = saved.order.filter((slug) => slugs.includes(slug));
        const missing = slugs.filter((slug) => !known.includes(slug));
        setOrder([...known, ...missing]);
      }
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

    const state: DragState = {
      slug,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      element,
      moved: false,
      active: !isMobile(),
      holdTimer: null,
    };

    if (isMobile()) {
      state.holdTimer = window.setTimeout(() => {
        if (drag.current?.slug !== slug) return;
        drag.current.active = true;
        element.classList.add("lifted");
      }, HOLD_MS);
    }

    drag.current = state;
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (Math.abs(dx) > CLICK_SLOP || Math.abs(dy) > CLICK_SLOP) state.moved = true;
    if (!state.active) return;

    state.element.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    state.element.style.zIndex = "4";
  }, []);

  const onPointerUp = useCallback(
    (event: React.PointerEvent, onClick: (slug: string) => void) => {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      drag.current = null;
      if (state.holdTimer) window.clearTimeout(state.holdTimer);
      state.element.classList.remove("lifted");

      const wasDrag = state.moved && state.active;
      const reset = () => {
        state.element.style.transform = "";
        state.element.style.zIndex = "";
        state.element.style.transition = "";
      };

      if (!wasDrag) {
        reset();
        // Нажатие без движения - это открытие иконки.
        if (!state.moved) onClick(state.slug);
        return;
      }

      const box = surface.current?.getBoundingClientRect();
      if (!box) {
        reset();
        return;
      }

      if (isMobile()) {
        // Сетка: переставляем иконку туда, куда её отнесли.
        const next = reorder(order, state.slug, state.element, box, event);
        reset();
        setOrder(next);
        persist({ positions, order: next });
        return;
      }

      const rect = state.element.getBoundingClientRect();
      const x = clamp(((rect.left - box.left) / box.width) * 100, 0, 92);
      const y = clamp(((rect.top - box.top) / box.height) * 100, 0, 88);
      reset();

      const next = { ...positions, [state.slug]: { x, y } };
      setPositions(next);
      persist({ positions: next, order });
    },
    [order, positions, persist],
  );

  return { positions, order, surface, onPointerDown, onPointerMove, onPointerUp };
}

/** Индекс слота под пальцем, пересчитанный в новый порядок иконок. */
function reorder(
  order: string[],
  slug: string,
  element: HTMLElement,
  box: DOMRect,
  event: React.PointerEvent,
): string[] {
  const columns = 4;
  const cellWidth = box.width / columns;
  const cellHeight = element.offsetHeight + 22;

  const column = clamp(Math.floor((event.clientX - box.left) / cellWidth), 0, columns - 1);
  const row = Math.max(0, Math.floor((event.clientY - box.top) / cellHeight));
  const target = clamp(row * columns + column, 0, order.length - 1);

  const next = order.filter((item) => item !== slug);
  next.splice(target, 0, slug);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
