"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { tapped } from "./haptics";
import { spring } from "./spring";

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

/**
 * Насколько иконка сопротивляется, когда её тянут за край стола.
 *
 * До этого она уходила за границу один к одному, а на отпускании её обрезало и
 * телепортировало обратно. Жёсткий упор читается как «зависло», растущее
 * сопротивление - как «дальше ничего нет». Формула из сэмплов Apple.
 */
const RUBBER = 0.55;

function rubberband(overshoot: number, dimension: number): number {
  return (overshoot * dimension * RUBBER) / (dimension + RUBBER * overshoot);
}

/**
 * Куда иконка доехала бы сама, если её бросить.
 *
 * Экспоненциальное затухание, как у прокрутки, а не школьная формула через
 * ускорение: именно это даёт ощущение броска, когда маленькое движение пальца
 * отправляет иконку далеко.
 */
const DECELERATION = 0.998;

function project(velocity: number): number {
  return ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);
}

/** Сколько последних точек храним, чтобы посчитать скорость на отпускании. */
const TRAIL = 5;

export type Point = { x: number; y: number };
export type Layout = Record<string, Point>;
/** Где лежит иконка: имя папки или null, если прямо на столе. */
export type Parents = Record<string, string | null>;

type Stored = { positions: Layout; parents?: Parents };

/** Летящая иконка: чем её остановить и где она сейчас относительно места. */
type Flight = { stop: () => void; at: Point };

/**
 * Иконка долетает до места сама, начиная с той скорости, с какой её отпустили.
 *
 * Раньше она вставала туда мгновенно: точку приземления считали с учётом
 * броска, а прыжок в неё был в один кадр - иконка пропадала из-под пальца и
 * появлялась вдали. Это хуже, чем если бы броска не было вовсе.
 *
 * По оси на пружину, а не одна на расстояние: при разной скорости по X и Y
 * общая пружина рассинхронизирует движение и оно идёт по дуге, которой человек
 * не задавал.
 */
function fly(
  element: HTMLElement,
  from: Point,
  velocity: Point,
  flight: Flight,
  onEnd: () => void,
): () => void {
  let left = 2;
  const done = () => {
    if (--left === 0) onEnd();
  };
  const write = () => {
    element.style.transform = `translate3d(${flight.at.x}px, ${flight.at.y}px, 0)`;
  };
  const stopX = spring({
    from: from.x,
    to: 0,
    velocity: velocity.x,
    onFrame: (value) => {
      flight.at.x = value;
      write();
    },
    onDone: done,
  });
  const stopY = spring({
    from: from.y,
    to: 0,
    velocity: velocity.y,
    onFrame: (value) => {
      flight.at.y = value;
      write();
    },
    onDone: done,
  });
  return () => {
    stopX();
    stopY();
  };
}

type DragState = {
  slug: string;
  pointerId: number;
  startX: number;
  startY: number;
  element: HTMLElement;
  moved: boolean;
  /**
   * Смещение, которое было на иконке в момент захвата. Не ноль только когда
   * иконку поймали в полёте: тогда она стоит на своих left/top плюс остаток
   * пружины, и палец обязан продолжить движение отсюда, а не с прыжка.
   */
  origin: Point;
  /** Где иконка лежала до перетаскивания: от неё считается выход за край. */
  startRect: DOMRect;
  box: DOMRect | null;
  /** Последние точки с временем: по ним считается скорость броска. */
  trail: { x: number; y: number; at: number }[];
  /** Смещение с учётом резинки - его же отдаём как точку отпускания. */
  shown: { x: number; y: number };
};

export function useIconLayout(
  defaults: Layout,
  mobileDefaults: Layout,
  defaultParents: Parents = {},
  /**
   * Иконку вынесли из папки на стол.
   *
   * Окно папки стоит поверх стола и занимает его середину, поэтому иконка,
   * положенная куда угодно под него, оказывается за окном - человек видит,
   * что вещь исчезла. Папку после выноса закрывают, и место приземления видно
   * сразу.
   */
  onOutOfFolder?: () => void,
) {
  const [positions, setPositions] = useState<Layout>(defaults);
  const [parents, setParents] = useState<Parents>(defaultParents);
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const flights = useRef(new Map<string, Flight>());

  // Читаем сохранённую раскладку после гидратации: на сервере localStorage нет,
  // а несовпадение разметки дало бы ошибку гидратации.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Stored;
        if (saved.positions) {
          setPositions({ ...defaults, ...saved.positions });
          // У раскладок, сохранённых до появления папок, поля parents нет -
          // тогда берём то, что положено по умолчанию.
          setParents({ ...defaultParents, ...(saved.parents ?? {}) });
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

    // Летящую иконку можно поймать. Пружину останавливаем, а её остаток берём
    // за начало нового движения: иначе иконка прыгнет на конечную точку - ровно
    // тот рывок, ради которого полёт и заводили.
    const flight = flights.current.get(slug);
    if (flight) flights.current.delete(slug);
    flight?.stop();

    drag.current = {
      slug,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      element,
      moved: false,
      origin: flight ? { ...flight.at } : { x: 0, y: 0 },
      // Снимаем до первого transform: потом эта рамка уже поехала бы вместе с
      // иконкой, и выход за край считался бы от неверного места.
      startRect: element.getBoundingClientRect(),
      box: surface.current?.getBoundingClientRect() ?? null,
      trail: [{ x: event.clientX, y: event.clientY, at: event.timeStamp }],
      shown: { x: 0, y: 0 },
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

    // Хвост из последних точек: одной разницы мало, по ней скорость дёргается
    // от кадра к кадру.
    state.trail.push({ x: event.clientX, y: event.clientY, at: event.timeStamp });
    if (state.trail.length > TRAIL) state.trail.shift();

    const moved = resist(state, dx, dy);
    state.shown = moved;
    state.element.style.transform = `translate3d(${state.origin.x + moved.x}px, ${
      state.origin.y + moved.y
    }px, 0)`;
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

      // Куда отпустили, решает то, что лежит под курсором, а не расчёт
      // расстояний до папок: под пальцем может оказаться окно, и тогда иконка
      // не должна улетать на стол сквозь него.
      const under = document.elementsFromPoint(event.clientX, event.clientY);
      const folder = under
        .find(
          (node) =>
            node instanceof HTMLElement &&
            node.dataset.folder &&
            node.dataset.folder !== state.slug,
        )
        ?.getAttribute("data-folder");

      if (folder) {
        reset();
        tapped();
        const nextParents = { ...parents, [state.slug]: folder };
        setParents(nextParents);
        persist({ positions, parents: nextParents });
        return;
      }

      // Отпустили в окне открытой папки. Раньше иконка просто оставалась там,
      // где лежала, и для своей же папки это верно - а вот принесённая со
      // стола так и оставалась на столе. Окно папки показывает ровно то же,
      // что её иконка, значит и принимать должно так же.
      const openFolder = under
        .find((node) => node instanceof HTMLElement && node.dataset.folderWindow)
        ?.getAttribute("data-folder-window");
      if (openFolder) {
        reset();
        if (parents[state.slug] !== openFolder) {
          tapped();
          const nextParents = { ...parents, [state.slug]: openFolder };
          setParents(nextParents);
          persist({ positions, parents: nextParents });
        }
        return;
      }

      const box = surface.current?.getBoundingClientRect();
      if (!box) {
        reset();
        return;
      }

      // Бросок: иконка летит туда, куда доехала бы сама, а не встаёт там, где
      // разжали палец. Маленькое движение - большой результат.
      const speed = velocityOf(state);
      const thrown = {
        x: state.startRect.left + state.shown.x + project(speed.x),
        y: state.startRect.top + state.shown.y + project(speed.y),
      };

      const maxX = isMobile() ? 74 : 92;
      const x = clamp(((thrown.x - box.left) / box.width) * 100, 0, maxX);
      const y = clamp(((thrown.y - box.top) / box.height) * 100, 0, 88);

      const cameFromFolder = Boolean(parents[state.slug]);
      const next = { ...positions, [state.slug]: { x, y } };
      const nextParents = cameFromFolder
        ? { ...parents, [state.slug]: null }
        : parents;

      if (cameFromFolder) {
        // Иконка лежала внутри окна папки, в обычном потоке. Писать ей left и
        // top бессмысленно: React сейчас перенесёт её на стол, и позицию она
        // возьмёт из состояния.
        reset();
        setParents(nextParents);
        onOutOfFolder?.();
      } else {
        // Новые координаты пишем в DOM в том же кадре, в котором меняем
        // transform. Если сначала стереть transform и ждать ре-рендер React,
        // иконка на один кадр прыгает на старое место и это видно как рывок.
        state.element.style.left = `${x}%`;
        state.element.style.top = `${y}%`;

        // Место у иконки уже новое, но видно её пока на старом: transform
        // держит разницу, и пружина сводит эту разницу к нулю, начиная с той
        // скорости, с какой палец её отпустил. Так между рукой и полётом нет
        // шва - движение не прерывается ни на кадр.
        const rest = {
          x: state.startRect.left + state.shown.x - (box.left + (x / 100) * box.width),
          y: state.startRect.top + state.shown.y - (box.top + (y / 100) * box.height),
        };
        state.element.style.transform = `translate3d(${rest.x}px, ${rest.y}px, 0)`;

        const flight: Flight = { stop: () => {}, at: { ...rest } };
        flights.current.set(state.slug, flight);
        flight.stop = fly(state.element, rest, speed, flight, () => {
          // Полёт мог быть прерван новым захватом - тогда убирать за собой
          // нельзя, иконка уже в чужих руках.
          if (flights.current.get(state.slug) !== flight) return;
          flights.current.delete(state.slug);
          state.element.style.transform = "";
          state.element.style.zIndex = "";
          state.element.style.transition = "";
        });
      }

      setPositions(next);
      persist({ positions: next, parents: nextParents });
    },
    [positions, parents, persist, onOutOfFolder],
  );

  return { positions, parents, surface, onPointerDown, onPointerMove, onPointerUp };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Смещение с сопротивлением у края: внутри стола палец и иконка идут один к
 * одному, за краем иконка отстаёт всё сильнее.
 */
function resist(state: DragState, dx: number, dy: number): Point {
  const box = state.box;
  if (!box) return { x: dx, y: dy };

  const soften = (
    delta: number,
    edge: number,
    size: number,
    low: number,
    high: number,
    span: number,
  ) => {
    const want = edge + delta;
    const held = clamp(want, low, high - size);
    const over = want - held;
    if (over === 0) return delta;
    return delta - over + Math.sign(over) * rubberband(Math.abs(over), span);
  };

  return {
    x: soften(dx, state.startRect.left, state.startRect.width, box.left, box.right, box.width),
    y: soften(dy, state.startRect.top, state.startRect.height, box.top, box.bottom, box.height),
  };
}

/**
 * Скорость в пикселях за секунду по хвосту точек. Берём от самой старой к
 * самой новой: так один дрогнувший кадр не решает исход броска.
 */
function velocityOf(state: DragState): Point {
  const trail = state.trail;
  if (trail.length < 2) return { x: 0, y: 0 };
  const first = trail[0]!;
  const last = trail[trail.length - 1]!;
  const seconds = (last.at - first.at) / 1000;
  // Палец замер перед отпусканием - значит броска не было.
  if (seconds <= 0 || seconds > 0.2) return { x: 0, y: 0 };
  return { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
}
