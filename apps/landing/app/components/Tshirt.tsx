"use client";

import { useRef, useState } from "react";

/**
 * Макет футболки с местами под нанесение - тот же приём, что и макет профиля X:
 * человек видит вещь и сразу понимает, что именно продаётся.
 *
 * Футболка вертится вокруг своей оси. Это не две картинки «перёд и спина»:
 * каждое место лежит на цилиндре под своим углом, и при повороте уезжает за
 * корпус и появляется с другой стороны само. Поэтому спина не нарисована
 * отдельно - она получается из того же силуэта.
 *
 * Цен здесь нет намеренно. Ни одна футболка ещё не продана, проверять
 * размещение на ткани мы пока не умеем, и ставить цифру было бы обещанием,
 * которого мы не выполним. Место ведёт в вейтлист.
 */

type Role = "creator" | "advertiser";

type Spot = {
  id: string;
  label: string;
  /** Угол на цилиндре: 0 - грудь, 180 - спина, ±90 - бока. */
  angle: number;
  /** Насколько место далеко от оси. Рукава дальше корпуса. */
  radius: number;
  y: number;
  w: number;
  h: number;
};

const SPOTS: Spot[] = [
  { id: "chest", label: "Chest", angle: 0, radius: 52, y: 240, w: 92, h: 70 },
  { id: "pocket", label: "Left chest", angle: -40, radius: 52, y: 180, w: 44, h: 30 },
  { id: "back", label: "Back", angle: 180, radius: 52, y: 240, w: 100, h: 86 },
  { id: "nape", label: "Nape", angle: 180, radius: 52, y: 180, w: 62, h: 18 },
  // Рукава сидят ближе к фронту, чем настоящие ±90: ровно сбоку место
  // схлопывается в линию, и при взгляде анфас его не было бы видно вовсе.
  { id: "sleeve-right", label: "Sleeve", angle: 62, radius: 76, y: 150, w: 42, h: 30 },
  { id: "sleeve-left", label: "Sleeve", angle: -62, radius: 76, y: 150, w: 42, h: 30 },
];

const CX = 160;
const RAD = Math.PI / 180;

/** Куда уехало место и видно ли его вообще при текущем повороте. */
function project(spotAngle: number, turn: number) {
  const rel = ((spotAngle - turn + 540) % 360) - 180;
  const depth = Math.cos(rel * RAD);
  return {
    x: CX + Math.sin(rel * RAD),
    shift: Math.sin(rel * RAD),
    depth,
    // У самого края место сжато в линию и читать его нельзя - там оно гаснет.
    opacity: depth <= 0.14 ? 0 : Math.min(1, (depth - 0.14) / 0.22),
  };
}

export function Tshirt({ role, onWaitlist }: { role: Role; onWaitlist: () => void }) {
  const [turn, setTurn] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const drag = useRef<{ id: number; x: number; from: number } | null>(null);

  // Силуэт при повороте сужается: футболка сбоку уже, чем анфас. Ткань не
  // исчезает совсем, поэтому нижняя граница не ноль.
  const squeeze = 0.34 + 0.66 * Math.abs(Math.cos(turn * RAD));
  // Нормализуем в -180..180 и считаем спиной всё, что дальше четверти оборота.
  const back = Math.abs(((turn + 180) % 360) - 180) > 90;

  function onPointerDown(event: React.PointerEvent) {
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    } catch {
      // Захват указателя не обязателен: без него поворот просто прервётся,
      // если курсор уйдёт со сцены. А исключение отсюда убило бы поворот
      // вовсе - обработчик дальше не дошёл бы до запоминания начальной точки.
    }
    drag.current = { id: event.pointerId, x: event.clientX, from: turn };
  }

  function onPointerMove(event: React.PointerEvent) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    // Пол-экрана пальца - полный оборот.
    const width = (event.currentTarget as HTMLElement).clientWidth || 320;
    const next = state.from + ((event.clientX - state.x) / width) * 360;
    setTurn(((next % 360) + 360) % 360);
  }

  function onPointerUp(event: React.PointerEvent) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  return (
    <div className="ts">
      <div
        className="ts-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <svg viewBox="0 0 320 380" className="ts-svg" role="img" aria-label="T-shirt">
          <g
            style={{ transform: `scaleX(${squeeze})`, transformOrigin: "160px 200px" }}
          >
            {/* Корпус и рукава одной фигурой: плечи, короткий рукав, бок с
                небольшим приталиванием, ровный низ. */}
            <path
              d="M104 108 L134 94 Q160 110 186 94 L216 108 L258 152 L228 186 L212 168
                 L212 320 Q160 332 108 320 L108 168 L92 186 L62 152 Z"
              fill="#f4f5f7"
              stroke="#d8dbe0"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Горловина: спереди вырез, сзади шов по спинке. */}
            {back ? (
              <path
                d="M134 94 Q160 106 186 94"
                fill="none"
                stroke="#d8dbe0"
                strokeWidth="3"
              />
            ) : (
              <path
                d="M134 94 Q160 126 186 94"
                fill="#eceef1"
                stroke="#d8dbe0"
                strokeWidth="2"
              />
            )}
          </g>

          {SPOTS.map((spot) => {
            const at = project(spot.angle, turn);
            if (at.opacity === 0) return null;
            const x = CX + at.shift * spot.radius * squeeze;
            const on = hovered === spot.id;
            return (
              <g
                key={spot.id}
                className={on ? "ts-spot on" : "ts-spot"}
                style={{ opacity: at.opacity }}
                transform={`translate(${x} ${spot.y}) scale(${at.depth} 1)`}
                onClick={onWaitlist}
                onPointerEnter={() => setHovered(spot.id)}
                onPointerLeave={() => setHovered(null)}
              >
                <rect
                  x={-spot.w / 2}
                  y={-spot.h / 2}
                  width={spot.w}
                  height={spot.h}
                  rx="6"
                />
                {/* Подпись держим прямой: вместе с местом она сжималась бы в
                    нечитаемую полосу. */}
                <text textAnchor="middle" dy="4" transform={`scale(${1 / at.depth} 1)`}>
                  {spot.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="ts-controls">
        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(turn)}
          onChange={(event) => setTurn(Number(event.target.value))}
          aria-label="Turn the shirt"
        />
        <span className="muted small">{back ? "Back" : "Front"}</span>
      </div>

      <p className="muted small">
        {role === "advertiser"
          ? "Every highlighted area is a surface you could rent. Drag the shirt to turn it."
          : "Every highlighted area is something a club or a team could rent out. Drag the shirt to turn it."}
      </p>
      <p className="muted small">
        Nobody is selling shirts yet. A profile can be checked automatically, a shirt
        needs a photo and a place - that part is next. Join the waitlist and you get it
        first.
      </p>
      <button className="primary" onClick={onWaitlist}>
        Join the waitlist
      </button>
    </div>
  );
}
