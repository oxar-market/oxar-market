"use client";

import { useEffect, useRef, useState } from "react";

/**
 * «Куда идут деньги» - схема под первым экраном. Комнаты (спонсоры, эскроу,
 * организатор, комиссия) соединены трубами, квадраты - это USDC: квадрат
 * уходит из стопки одной комнаты, едет по трубе и ложится в стопку другой.
 * Три вкладки - три сценария, ровно как их ведёт контракт: ставка и
 * возврат перебитой, возврат победителям без пруфа, выплата после пруфа.
 *
 * Схема не обещает ничего сверх контракта. Проценты не пишем: комиссия
 * меняется в админке, и цифра на лендинге разошлась бы с цепочкой молча.
 * Ни «Solana», ни «USDC» в текстах нет: лендинг говорит не только с теми,
 * кто знает эти слова.
 */

type Lane = "bid" | "refund" | "payout" | "fee";
type Room = "sponsors" | "escrow" | "organizer" | "fee";
type Point = [number, number];

type Layout = {
  width: number;
  height: number;
  rooms: Record<Room, [number, number, number, number]>;
  /**
   * Труба - точки ломаной от комнаты-источника к комнате-получателю. Трубы
   * входят в комнаты ниже подписей и в стороне от них: иначе квадрат по пути
   * к стопке проезжал бы по тексту.
   */
  lanes: Record<Lane, Point[]>;
};

/** Десктоп: слева направо. */
const WIDE: Layout = {
  width: 1000,
  height: 300,
  rooms: {
    sponsors: [20, 80, 180, 150],
    escrow: [320, 80, 220, 150],
    organizer: [780, 40, 200, 110],
    fee: [780, 170, 200, 90],
  },
  lanes: {
    bid: [[200, 155], [320, 155]],
    refund: [[320, 205], [200, 205]],
    payout: [[540, 160], [660, 160], [660, 125], [780, 125]],
    fee: [[540, 160], [660, 160], [660, 215], [780, 215]],
  },
};

/** Телефон: сверху вниз, иначе схема ужалась бы до нечитаемой. */
const TALL: Layout = {
  width: 340,
  height: 620,
  rooms: {
    sponsors: [20, 20, 300, 110],
    escrow: [20, 230, 300, 120],
    organizer: [20, 470, 180, 130],
    fee: [220, 470, 100, 130],
  },
  lanes: {
    bid: [[235, 130], [235, 230]],
    refund: [[285, 230], [285, 130]],
    payout: [[215, 350], [215, 410], [175, 410], [175, 470]],
    fee: [[215, 350], [215, 410], [270, 410], [270, 470]],
  },
};

/** Откуда и куда ведёт труба. */
const ENDS: Record<Lane, [Room, Room]> = {
  bid: ["sponsors", "escrow"],
  refund: ["escrow", "sponsors"],
  payout: ["escrow", "organizer"],
  fee: ["escrow", "fee"],
};

/**
 * Схему читает тот, кто ставит, поэтому его комната - «твой кошелёк», а не
 * «спонсоры»: со словом «спонсоры» человек не узнавал в схеме себя.
 */
const NAMES: Record<Room, string> = {
  sponsors: "Your wallet",
  escrow: "Escrow",
  organizer: "Event organizer",
  fee: "OXAR fee",
};

/** Строка под названием: что это за комната, одними словами. */
const HINTS: Partial<Record<Room, string>> = {
  sponsors: "you bid on a spot",
  escrow: "a program holds it, not us",
  organizer: "paid after the photo",
};

type Piles = Record<Room, number>;

type Stage = {
  tab: string;
  text: string;
  /** С чего сценарий начинается: сколько квадратов в какой комнате. */
  start: Partial<Piles>;
  /** По каким трубам по очереди уходят квадраты, по кругу. */
  order: Lane[];
};

const STAGES: Stage[] = [
  {
    tab: "You bid",
    text: "You pay your bid upfront into escrow. If someone outbids you, your money comes straight back.",
    start: { sponsors: 6 },
    order: ["bid", "bid", "refund"],
  },
  {
    tab: "No photo, no pay",
    text: "If you win, the organizer has a deadline to post a photo of your logo in place. No photo by then, and you get your money back automatically.",
    start: { escrow: 5 },
    order: ["refund"],
  },
  {
    tab: "Photo is up",
    text: "Once the photo is up, you have 72 hours to dispute it. Then the program pays the organizer and takes the OXAR fee. Disputes go to an arbiter.",
    start: { escrow: 6 },
    order: ["payout", "payout", "payout", "payout", "fee", "payout"],
  },
];

/** Скорость квадрата, единиц схемы в секунду. */
const SPEED = 260;
/** Через сколько секунд из комнаты уходит следующий квадрат. */
const EVERY = 0.55;
/** Пауза перед повтором, когда все деньги доехали. */
const REPLAY = 1.2;
const COIN = 9;
const GAP = 3;

const EMPTY: Piles = { sponsors: 0, escrow: 0, organizer: 0, fee: 0 };

export function MoneyFlow() {
  const [stage, setStage] = useState(0);
  const [tall, setTall] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 56rem)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => {
      setTall(narrow.matches);
      setStill(calm.matches);
    };
    read();
    narrow.addEventListener("change", read);
    calm.addEventListener("change", read);
    return () => {
      narrow.removeEventListener("change", read);
      calm.removeEventListener("change", read);
    };
  }, []);

  const current = STAGES[stage];

  return (
    <section className="flow" id="how" aria-labelledby="flow-title">
      <h2 id="flow-title">Where your money goes, in a nutshell.</h2>
      <div className="flow-tabs" role="tablist" aria-label="Money flow stage">
        {STAGES.map((one, at) => (
          <button
            key={one.tab}
            type="button"
            role="tab"
            aria-selected={at === stage}
            className={at === stage ? "flow-tab on" : "flow-tab"}
            onClick={() => setStage(at)}
          >
            <span className="flow-num">{at + 1}</span>
            {one.tab}
          </button>
        ))}
      </div>
      <Diagram layout={tall ? TALL : WIDE} stage={current} still={still} />
      <p className="flow-text">{current.text}</p>
      <a className="flow-more" href="https://github.com/oxar-market/oxar-market">
        The escrow program is open source &rarr;
      </a>
    </section>
  );
}

/** Где в комнате лежит квадрат с этим номером: стопка снизу вверх, рядами. */
function slot(layout: Layout, room: Room, at: number): Point {
  const [x, y, w, h] = layout.rooms[room];
  const row = Math.max(1, Math.floor((w - 32 + GAP) / (COIN + GAP)));
  return [
    x + 16 + (at % row) * (COIN + GAP) + COIN / 2,
    y + h - 20 - Math.floor(at / row) * (COIN + GAP) - COIN / 2,
  ];
}

/** Точка на ломаной на расстоянии `at` от её начала; null - доехали. */
function along(route: Point[], at: number): Point | null {
  let left = at;
  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1];
    const [bx, by] = route[i];
    const step = Math.hypot(bx - ax, by - ay);
    if (left <= step) {
      const t = step === 0 ? 1 : left / step;
      return [ax + (bx - ax) * t, ay + (by - ay) * t];
    }
    left -= step;
  }
  return null;
}

/**
 * Путь квадрата из стопки в стопку только под прямыми углами: внутри комнаты
 * он сперва встаёт на ось трубы, а на выходе из трубы - на ось своего места
 * в стопке. По диагонали квадрат срезал углы и шёл мимо труб.
 */
function square(start: Point, lane: Point[], end: Point): Point[] {
  const [first, second] = lane;
  const [last, before] = [lane[lane.length - 1], lane[lane.length - 2]];
  const inFlat = first[1] === second[1];
  const outFlat = last[1] === before[1];
  return [
    start,
    inFlat ? [start[0], first[1]] : [first[0], start[1]],
    ...lane,
    outFlat ? [end[0], last[1]] : [last[0], end[1]],
    end,
  ];
}

function Diagram({ layout, stage, still }: { layout: Layout; stage: Stage; still: boolean }) {
  const svg = useRef<SVGSVGElement | null>(null);
  const coins = useRef<SVGGElement | null>(null);
  const [piles, setPiles] = useState<Piles>({ ...EMPTY, ...stage.start });
  const lanes = Object.keys(layout.lanes) as Lane[];
  const rooms = Object.keys(layout.rooms) as Room[];

  // Квадраты в пути двигаем сами, мимо React: шестьдесят перерисовок схемы в
  // секунду ради пары прямоугольников не нужны. React рисует только стопки -
  // они меняются, когда квадрат ушёл или приехал. Анимация идёт, только пока
  // схема на экране.
  useEffect(() => {
    const group = coins.current;
    const box = svg.current;
    if (!group || !box) return;
    group.replaceChildren();

    const begin = (): Piles => ({ ...EMPTY, ...stage.start });
    let count = begin();
    setPiles(count);
    if (still) return;

    // Сколько квадратов уже едут в комнату: их места в стопке заняты заранее.
    const coming: Piles = { ...EMPTY };
    const moving = new Set<{ rect: SVGRectElement; route: Point[]; at: number; to: Room }>();
    let next = 0;
    let wait = 0;
    let idle = 0;
    let frame = 0;
    let visible = false;
    let last = performance.now();

    const send = () => {
      // Труба без денег в источнике пропускает ход.
      for (let tries = 0; tries < stage.order.length; tries++) {
        const lane = stage.order[next % stage.order.length];
        next += 1;
        const [from, to] = ENDS[lane];
        if (count[from] === 0) continue;
        const start = slot(layout, from, count[from] - 1);
        const end = slot(layout, to, count[to] + coming[to]);
        count = { ...count, [from]: count[from] - 1 };
        coming[to] += 1;
        setPiles(count);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("width", String(COIN));
        rect.setAttribute("height", String(COIN));
        rect.setAttribute("class", "flow-coin");
        group.appendChild(rect);
        moving.add({ rect, route: square(start, layout.lanes[lane], end), at: 0, to });
        return true;
      }
      return false;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      wait -= dt;
      if (wait <= 0) {
        const sent = send();
        wait = EVERY;
        // Всё уехало и всё доехало: короткая пауза, и сценарий сначала.
        if (!sent && moving.size === 0) {
          idle += EVERY;
          if (idle >= REPLAY) {
            idle = 0;
            next = 0;
            count = begin();
            setPiles(count);
          }
        } else {
          idle = 0;
        }
      }

      for (const coin of moving) {
        coin.at += SPEED * dt;
        const point = along(coin.route, coin.at);
        if (point) {
          coin.rect.setAttribute("x", String(point[0] - COIN / 2));
          coin.rect.setAttribute("y", String(point[1] - COIN / 2));
        } else {
          coin.rect.remove();
          moving.delete(coin);
          coming[coin.to] -= 1;
          count = { ...count, [coin.to]: count[coin.to] + 1 };
          setPiles(count);
        }
      }
      frame = requestAnimationFrame(tick);
    };

    const seen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !visible) {
        visible = true;
        last = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting && visible) {
        visible = false;
        cancelAnimationFrame(frame);
      }
    });
    seen.observe(box);
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [layout, stage, still]);

  const tall = layout === TALL;
  const used = new Set(stage.order.flatMap((lane) => ENDS[lane]));

  return (
    <svg
      ref={svg}
      className="flow-map"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      style={{ maxWidth: tall ? "22rem" : "62rem" }}
      aria-hidden
    >
      {/* Контур объединения комнат и труб: снизу всё чуть шире цветом линии,
          сверху то же по точному размеру цветом фона - остаётся обводка
          одной фигуры, без швов на стыках. */}
      <g className="flow-edge">
        {rooms.map((room) => {
          const [x, y, w, h] = layout.rooms[room];
          return <rect key={room} x={x - 1} y={y - 1} width={w + 2} height={h + 2} />;
        })}
        {lanes.map((lane) => (
          <polyline key={lane} points={layout.lanes[lane].join(" ")} strokeWidth={26} />
        ))}
      </g>
      <g className="flow-fill">
        {rooms.map((room) => {
          const [x, y, w, h] = layout.rooms[room];
          return <rect key={room} x={x} y={y} width={w} height={h} />;
        })}
        {lanes.map((lane) => (
          <polyline key={lane} points={layout.lanes[lane].join(" ")} strokeWidth={24} />
        ))}
      </g>

      {rooms.map((room) => {
        const [x, y] = layout.rooms[room];
        return (
          <g key={room}>
            <text
              x={x + 16}
              y={y + 30}
              fontSize={tall ? 15 : 17}
              className={used.has(room) ? "flow-name" : "flow-name off"}
            >
              {NAMES[room]}
            </text>
            {HINTS[room] && (
              <text x={x + 16} y={y + 50} fontSize={tall ? 12 : 13} className="flow-hint">
                {HINTS[room]}
              </text>
            )}
            {Array.from({ length: piles[room] }, (_, at) => {
              const [cx, cy] = slot(layout, room, at);
              return (
                <rect
                  key={at}
                  className="flow-coin"
                  x={cx - COIN / 2}
                  y={cy - COIN / 2}
                  width={COIN}
                  height={COIN}
                />
              );
            })}
          </g>
        );
      })}

      <g ref={coins} />
    </svg>
  );
}
