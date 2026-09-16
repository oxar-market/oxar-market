"use client";

import { useRef, useState } from "react";

/**
 * Макет футболки с местами под нанесение - тот же приём, что и макет профиля X:
 * человек видит вещь и сразу понимает, что именно продаётся.
 *
 * Футболка вертится вокруг своей оси. Это не две картинки «перёд и спина»:
 * каждое место лежит на цилиндре под своим углом, и при повороте уезжает за
 * корпус и появляется с другой стороны само.
 *
 * Места лежат внутри той же группы, что и силуэт, и обрезаны по нему маской.
 * Поэтому они ведут себя как нанесённые на ткань: сужаются вместе с корпусом и
 * уходят под край, а не плавают поверх картинки.
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

/**
 * Силуэт: плечи, короткий рукав, чуть приталенный бок, ровный низ. Пропорции
 * взяты у настоящей футболки - ширина примерно две трети длины. Более узкая и
 * длинная выглядела как платье.
 */
const SHIRT =
  "M104 122 L138 110 Q160 146 182 110 L216 122 L276 184 L238 212 L228 196 " +
  "L228 310 Q160 322 92 310 L92 196 L82 212 L44 184 Z";

const SPOTS: Spot[] = [
  { id: "chest", label: "Chest", angle: 0, radius: 44, y: 250, w: 76, h: 58 },
  { id: "left-chest", label: "Left chest", angle: -42, radius: 44, y: 204, w: 30, h: 24 },
  { id: "right-chest", label: "Right chest", angle: 42, radius: 44, y: 204, w: 30, h: 24 },
  { id: "collar-front", label: "Under the collar", angle: 0, radius: 44, y: 172, w: 36, h: 12 },
  { id: "hem-front", label: "Front hem", angle: 0, radius: 44, y: 294, w: 54, h: 18 },
  // Рукава сидят ближе к фронту, чем настоящие ±90: ровно сбоку место
  // схлопывается в линию и с фронта его не было бы видно вовсе.
  { id: "sleeve-left", label: "Left sleeve", angle: -58, radius: 96, y: 186, w: 28, h: 22 },
  { id: "sleeve-right", label: "Right sleeve", angle: 58, radius: 96, y: 186, w: 28, h: 22 },
  { id: "back", label: "Back", angle: 180, radius: 44, y: 246, w: 84, h: 68 },
  { id: "nape", label: "Nape", angle: 180, radius: 44, y: 170, w: 48, h: 14 },
  { id: "back-hem", label: "Back hem", angle: 180, radius: 44, y: 294, w: 54, h: 18 },
];

const CX = 160;
const RAD = Math.PI / 180;

/** Куда уехало место и видно ли его вообще при текущем повороте. */
function project(spotAngle: number, turn: number) {
  const rel = ((spotAngle - turn + 540) % 360) - 180;
  const depth = Math.cos(rel * RAD);
  return {
    shift: Math.sin(rel * RAD),
    depth,
    // У самого края место сжато в линию и читать его нельзя - там оно гаснет.
    opacity: depth <= 0.12 ? 0 : Math.min(1, (depth - 0.12) / 0.2),
  };
}

export function Tshirt({ role, onWaitlist }: { role: Role; onWaitlist: () => void }) {
  const [turn, setTurn] = useState(0);
  const [hovered, setHovered] = useState<Spot | null>(null);
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
        {/* Поле зрения обрезано по самой вещи: при полном холсте футболка тонула
            в пустоте и выглядела мелкой. */}
        <svg viewBox="30 98 260 232" className="ts-svg" role="img" aria-label="T-shirt">
          <defs>
            {/* Ткань обрезает нанесение: место, уехавшее за бок, скрывается под
                краем, а не висит рядом с футболкой. */}
            <clipPath id="ts-fabric">
              <path d={SHIRT} />
            </clipPath>
          </defs>

          <g style={{ transform: `scaleX(${squeeze})`, transformOrigin: "160px 210px" }}>
            <path
              d={SHIRT}
              fill="#f4f5f7"
              stroke="#d8dbe0"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            {/* Горловина: спереди вырез, сзади шов по спинке. */}
            {back ? (
              <path
                d="M138 110 Q160 124 182 110"
                fill="none"
                stroke="#d8dbe0"
                strokeWidth="3"
              />
            ) : (
              <path
                d="M138 110 Q160 146 182 110"
                fill="#eceef1"
                stroke="#d8dbe0"
                strokeWidth="2"
              />
            )}

            <g clipPath="url(#ts-fabric)">
              {SPOTS.map((spot) => {
                const at = project(spot.angle, turn);
                if (at.opacity === 0) return null;
                const x = CX + at.shift * spot.radius;
                return (
                  <rect
                    key={spot.id}
                    className={hovered?.id === spot.id ? "ts-spot on" : "ts-spot"}
                    x={-spot.w / 2}
                    y={-spot.h / 2}
                    width={spot.w}
                    height={spot.h}
                    rx="4"
                    style={{ opacity: at.opacity }}
                    transform={`translate(${x} ${spot.y}) scale(${at.depth} 1)`}
                    onClick={onWaitlist}
                    onPointerEnter={() => setHovered(spot)}
                    onPointerLeave={() => setHovered(null)}
                  />
                );
              })}
            </g>
          </g>
        </svg>
      </div>

      {/* Своя дорожка вместо системного ползунка: тот выглядел как настройка
          громкости посреди макета. */}
      <div className="ts-controls">
        <input
          type="range"
          min={0}
          max={359}
          value={Math.round(turn)}
          onChange={(event) => setTurn(Number(event.target.value))}
          aria-label="Turn the shirt"
        />
        <span className="ts-side">{back ? "Back" : "Front"}</span>
      </div>

      {/* Подпись держит высоту всегда: иначе текст под футболкой прыгал бы на
          каждое наведение. */}
      <p className="ts-hint">
        {hovered ? hovered.label : "Drag the shirt to turn it. Tap a spot to sign up."}
      </p>

      <p className="muted small">
        {role === "advertiser"
          ? "Every marked area is a surface you could rent - on a team shirt, a merch drop, a conference tee."
          : "Every marked area is something a club or a team could rent out."}
      </p>
      <p className="muted small">
        Nobody is selling shirts yet. A profile can be checked automatically, a shirt
        needs a photo and a place - that part is next.
      </p>
      <button className="primary ts-cta" onClick={onWaitlist}>
        Join the waitlist
      </button>
    </div>
  );
}
