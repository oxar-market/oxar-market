"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { takeOpenPoint } from "@/lib/open-from";
import { spring } from "@/lib/spring";

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
  closer,
  folder,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Окну с макетом профиля нужно больше места, чем текстовому файлу. */
  wide?: boolean;
  /**
   * Куда окно кладёт свою же функцию ухода.
   *
   * Закрыть окно можно и снаружи: логотипом в доке, выносом иконки из папки.
   * Раньше эти пути звали onClose напрямую, и окно пропадало рывком, хотя по
   * крестику оно уходило с анимацией. Ссылка на leave делает уход одним и тем
   * же, откуда бы его ни попросили.
   */
  closer?: { current: (() => void) | null };
  /**
   * Имя папки, если окно её показывает.
   *
   * По этому атрибуту перетаскивание понимает, что иконку отпустили в папку.
   * Раньше он висел на сетке иконок внутри, и бросок засчитывался только по
   * ней: заголовок, поля и пустое место под иконками были мимо, хотя окно
   * показывает ту же папку. Целится человек в окно, а не в невидимый
   * прямоугольник внутри него.
   */
  folder?: string;
  children: React.ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    /** Последняя точка со временем: по ней считается скорость на отпускании. */
    lastY: number;
    lastAt: number;
    speed: number;
  } | null>(null);

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

  // Без списка зависимостей намеренно: leave пересоздаётся на каждый рендер, и
  // наружу должна смотреть свежая функция, а не та, что была при монтировании.
  useEffect(() => {
    if (!closer) return;
    closer.current = leave;
    return () => {
      if (closer.current === leave) closer.current = null;
    };
  });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") leave();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // leave стабилен: он не зависит от состояния.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  /**
   * Закрытие тем же путём, каким открывались. Размонтируем после анимации, а не
   * до: React иначе убирает узел сразу, и уход не виден.
   *
   * Если анимаций в системе просят меньше, длительность там короткая, и это
   * тот же самый путь - ждать нечего.
   */
  function leave() {
    const box = frame.current;
    if (!box) {
      onClose();
      return;
    }
    box.classList.add("leaving");
    const done = () => onClose();
    box.addEventListener("animationend", done, { once: true });
    // Страховка: если анимация не запустилась вовсе, окно всё равно закроется.
    window.setTimeout(done, 400);
  }

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
      lastY: event.clientY,
      lastAt: event.timeStamp,
      speed: 0,
    };
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  function onDrag(event: React.PointerEvent) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId || !frame.current) return;

    // На телефоне это не окно, а лист: он ходит только вниз и только чтобы
    // закрыться. Вверх не тянем, иначе контент уедет под статусбар.
    const seconds = (event.timeStamp - state.lastAt) / 1000;
    if (seconds > 0) state.speed = (event.clientY - state.lastY) / seconds;
    state.lastY = event.clientY;
    state.lastAt = event.timeStamp;

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
    const state = drag.current;
    if (state?.pointerId !== event.pointerId) return;
    drag.current = null;

    if (!isSheet() || !frame.current) return;

    const box = frame.current;
    const from = offset.current.y;

    // Закрывать или вернуть, решает намерение, а не расстояние. Короткий
    // быстрый флик вниз - это «закрой», даже если лист проехал сантиметр;
    // медленное протягивание на полэкрана с остановкой - это «передумал».
    const flung = state.speed > 500;
    if (flung || from > 110) {
      offset.current = { x: 0, y: 0 };
      spring({
        from,
        to: window.innerHeight,
        velocity: state.speed,
        response: 0.3,
        onFrame: (value) => {
          box.style.transform = `translate3d(0, ${value}px, 0)`;
        },
        onDone: onClose,
      });
      return;
    }

    // Возврат - тоже пружина с той же скоростью: у перехода на CSS начальная
    // скорость всегда ноль, и на отпускании видно, как движение спотыкается.
    offset.current = { x: 0, y: 0 };
    spring({
      from,
      to: 0,
      damping: 0.8,
      response: 0.3,
      velocity: state.speed,
      onFrame: (value) => {
        box.style.transform = `translate3d(0, ${value}px, 0)`;
      },
    });
  }

  return (
    <div className="window-layer" role="dialog" aria-label={title}>
      <div
        className={wide ? "window wide" : "window"}
        ref={frame}
        data-folder-window={folder}
      >
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
            onClick={leave}
            aria-label="Close"
          />
          <span className="window-title">{title}</span>
          {/* На телефоне точка в углу не читается как кнопка и попадает под
              палец плохо - нужен крестик в круге размером с палец. */}
          <button
            type="button"
            className="sheet-done"
            onClick={leave}
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
