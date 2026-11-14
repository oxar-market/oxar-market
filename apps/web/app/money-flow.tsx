"use client";

import { useEffect, useRef, useState } from "react";

/**
 * «Куда идут деньги» - схема под первым экраном. Комнаты (спонсоры, эскроу,
 * организатор, комиссия) соединены трубами, по трубам едут квадраты - это
 * USDC. Три вкладки - три сценария, ровно как их ведёт контракт: ставка и
 * возврат перебитой, возврат победителям без пруфа, выплата после пруфа.
 *
 * Схема не обещает ничего сверх контракта. Проценты не пишем: комиссия
 * меняется в админке, и цифра на лендинге разошлась бы с цепочкой молча.
 */

type Lane = "bid" | "refund" | "payout" | "fee";
type Room = "sponsors" | "escrow" | "organizer" | "fee";

type Layout = {
  width: number;
  height: number;
  rooms: Record<Room, [number, number, number, number]>;
  lanes: Record<Lane, string>;
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
    bid: "M200 125 L320 125",
    refund: "M320 185 L200 185",
    payout: "M540 155 L640 155 L700 95 L780 95",
    fee: "M540 155 L640 155 L700 215 L780 215",
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
    bid: "M110 130 L110 230",
    refund: "M230 230 L230 130",
    payout: "M170 350 L170 400 L110 440 L110 470",
    fee: "M170 350 L170 400 L270 440 L270 470",
  },
};

const NAMES: Record<Room, string> = {
  sponsors: "Sponsors",
  escrow: "Escrow",
  organizer: "Organizer",
  fee: "OXAR fee",
};

type Stage = {
  tab: string;
  text: string;
  /** Труба - через сколько секунд выходит следующий квадрат. */
  flow: Partial<Record<Lane, number>>;
  /** Сколько квадратов лежит в комнате: где деньги сейчас. */
  piles: Partial<Record<Room, number>>;
};

const STAGES: Stage[] = [
  {
    tab: "While bidding",
    text: "Every bid is paid upfront into an escrow program on Solana. Get outbid and your USDC comes straight back, in the same transaction.",
    flow: { bid: 0.9, refund: 2.4 },
    piles: { sponsors: 3, escrow: 4 },
  },
  {
    tab: "If there's no proof",
    text: "The organizer has a deadline to post a photo of your logo in place. No proof by then, and the winning bids go back automatically.",
    flow: { refund: 0.8 },
    piles: { sponsors: 5, escrow: 1 },
  },
  {
    tab: "After the proof",
    text: "Once the photo is up, sponsors have 72 hours to dispute it. Then the program pays the organizer and takes the OXAR fee. Disputes go to an arbiter.",
    flow: { payout: 0.8, fee: 4 },
    piles: { organizer: 5, fee: 1 },
  },
];

/** Скорость квадрата, единиц схемы в секунду. */
const SPEED = 150;
const COIN = 9;
/** Сам переключает вкладки, пока человек не выбрал свою. */
const AUTO_MS = 6500;

export function MoneyFlow() {
  const [stage, setStage] = useState(0);
  const [touched, setTouched] = useState(false);
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

  useEffect(() => {
    if (touched) return;
    const timer = setInterval(() => setStage((at) => (at + 1) % STAGES.length), AUTO_MS);
    return () => clearInterval(timer);
  }, [touched]);

  const current = STAGES[stage];

  return (
    <section className="flow" aria-labelledby="flow-title">
      <h2 id="flow-title">Where the money goes, in a nutshell.</h2>
      <div className="flow-tabs" role="tablist" aria-label="Money flow stage">
        {STAGES.map((one, at) => (
          <button
            key={one.tab}
            type="button"
            role="tab"
            aria-selected={at === stage}
            className={at === stage ? "flow-tab on" : "flow-tab"}
            onClick={() => {
              setTouched(true);
              setStage(at);
            }}
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

function Diagram({ layout, stage, still }: { layout: Layout; stage: Stage; still: boolean }) {
  const svg = useRef<SVGSVGElement | null>(null);
  const coins = useRef<SVGGElement | null>(null);
  const paths = useRef<Partial<Record<Lane, SVGPathElement | null>>>({});
  const lanes = Object.keys(layout.lanes) as Lane[];
  const rooms = Object.keys(layout.rooms) as Room[];

  // Квадраты двигаем сами, мимо React: шестьдесят перерисовок схемы в
  // секунду ради нескольких прямоугольников не нужны. Анимация идёт, только
  // пока схема на экране.
  useEffect(() => {
    const group = coins.current;
    const box = svg.current;
    if (!group || !box) return;
    group.replaceChildren();

    const place = (rect: SVGRectElement, lane: Lane, at: number) => {
      const path = paths.current[lane];
      if (!path) return false;
      const length = path.getTotalLength();
      if (at > length) return false;
      const point = path.getPointAtLength(at);
      rect.setAttribute("x", String(point.x - COIN / 2));
      rect.setAttribute("y", String(point.y - COIN / 2));
      return true;
    };
    const coin = () => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("width", String(COIN));
      rect.setAttribute("height", String(COIN));
      rect.setAttribute("class", "flow-coin");
      group.appendChild(rect);
      return rect;
    };

    const active = Object.entries(stage.flow) as [Lane, number][];

    // Без движения: по квадрату на середине каждой рабочей трубы.
    if (still) {
      for (const [lane] of active) {
        const path = paths.current[lane];
        if (path) place(coin(), lane, path.getTotalLength() / 2);
      }
      return;
    }

    let frame = 0;
    let visible = false;
    let last = performance.now();
    const born = new Map<SVGRectElement, { lane: Lane; at: number }>();
    // Первый квадрат каждой трубы - сразу, а не через интервал.
    const wait = new Map<Lane, number>(active.map(([lane]) => [lane, 0]));

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const [lane, every] of active) {
        const left = (wait.get(lane) ?? 0) - dt;
        if (left <= 0) {
          born.set(coin(), { lane, at: 0 });
          wait.set(lane, every);
        } else {
          wait.set(lane, left);
        }
      }
      for (const [rect, one] of born) {
        one.at += SPEED * dt;
        if (!place(rect, one.lane, one.at)) {
          rect.remove();
          born.delete(rect);
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
  const label = tall ? 15 : 17;

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
          <path key={lane} d={layout.lanes[lane]} strokeWidth={26} />
        ))}
      </g>
      <g className="flow-fill">
        {rooms.map((room) => {
          const [x, y, w, h] = layout.rooms[room];
          return <rect key={room} x={x} y={y} width={w} height={h} />;
        })}
        {lanes.map((lane) => (
          <path
            key={lane}
            ref={(el) => {
              paths.current[lane] = el;
            }}
            d={layout.lanes[lane]}
            strokeWidth={24}
          />
        ))}
      </g>

      {rooms.map((room) => {
        const [x, y, , h] = layout.rooms[room];
        const pile = stage.piles[room] ?? 0;
        const lit = pile > 0 || Object.keys(stage.flow).some((lane) => touches(lane as Lane, room));
        return (
          <g key={room}>
            <text x={x + 16} y={y + 30} fontSize={label} className={lit ? "flow-name" : "flow-name off"}>
              {NAMES[room]}
            </text>
            {Array.from({ length: pile }, (_, at) => (
              <rect
                key={at}
                className="flow-coin"
                x={x + 16 + at * (COIN + 3)}
                y={y + h - 24}
                width={COIN}
                height={COIN}
              />
            ))}
          </g>
        );
      })}


      <g ref={coins} />
    </svg>
  );
}

/** Касается ли труба комнаты: так понятно, какие комнаты в этом сценарии работают. */
function touches(lane: Lane, room: Room): boolean {
  const ends: Record<Lane, Room[]> = {
    bid: ["sponsors", "escrow"],
    refund: ["escrow", "sponsors"],
    payout: ["escrow", "organizer"],
    fee: ["escrow", "fee"],
  };
  return ends[lane].includes(room);
}
