"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import "./pass.css";

/**
 * Пропуск охвата на ленте. Лента и пропуск качаются вместе: курсор толкает
 * их по горизонтали, пружина возвращает назад. Лента - кривая от точки
 * подвеса до карабина, поэтому при качании она гнётся, а не ломается.
 * Под курсором пропуск ещё и наклоняется к нему, по пластику идёт блик.
 *
 * Охват - сумма охватов торгов, где стоял логотип человека. Пока цифры
 * вносим мы, а не статистика постов, пропуск честно пишет «estimated».
 */

/** Длина видимой ленты от верха до карабина, px. */
const STRAP = 92;
/** Пружина и трение качания, в секундах. */
const SPRING = 26;
const DAMP = 3.2;

export type PassLine = { title: string; reach: string; thumb?: string };

export function ReachPass({
  holder,
  brands,
  reach,
  estimated,
  lines,
  avatar,
  picture,
}: {
  holder: string;
  brands: string;
  reach: number;
  estimated: boolean;
  lines: PassLine[];
  avatar: CSSProperties;
  /** Своя картинка профиля, если загружена. */
  picture: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const strap = useRef<SVGGElement>(null);
  const state = useRef({ angle: 0, speed: 0, lastX: 0, lastT: 0, running: false, rx: 0, ry: 0, tx: 0, ty: 0 });
  const [still, setStill] = useState(false);
  const [width, setWidth] = useState(0);
  // Свои id у каждого пропуска: их два на странице, когда открыто окно
  // «поделиться», и надпись ленты иначе цеплялась за чужую линию.
  const uid = useId().replace(/:/g, "");
  const line = `ym-line-${uid}`;
  const metal = `ym-metal-${uid}`;
  const weave = `ym-weave-${uid}`;

  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = wrap.current;
    if (!el) return;
    const watch = new ResizeObserver(() => setWidth(el.clientWidth));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);

  // Кадр: пружина качания, сглаженный наклон, лента по дуге, пропуск на конце.
  function frame(now: number) {
    const s = state.current;
    const dt = Math.min(0.033, (now - (s.lastT || now)) / 1000) || 0.016;
    s.lastT = now;
    s.speed += (-SPRING * s.angle - DAMP * s.speed) * dt;
    s.angle = Math.max(-0.38, Math.min(0.38, s.angle + s.speed * dt));
    s.rx += (s.tx - s.rx) * 0.14;
    s.ry += (s.ty - s.ry) * 0.14;
    draw();
    const moving = Math.abs(s.angle) > 0.0008 || Math.abs(s.speed) > 0.0008 || Math.abs(s.tx - s.rx) > 0.01 || Math.abs(s.ty - s.ry) > 0.01;
    if (moving) requestAnimationFrame(frame);
    else s.running = false;
  }

  function kick() {
    const s = state.current;
    if (still || s.running) return;
    s.running = true;
    s.lastT = 0;
    requestAnimationFrame(frame);
  }

  function draw() {
    const s = state.current;
    const center = (wrap.current?.clientWidth ?? 0) / 2;
    const ex = center + Math.sin(s.angle) * STRAP;
    const ey = Math.cos(s.angle) * STRAP;
    if (strap.current) {
      const d = `M${center} -4 Q${center} ${STRAP * 0.55} ${ex} ${ey}`;
      // Только линии самой ленты - у карабина свои формы.
      strap.current.querySelectorAll('path[class^="ym-strap"]').forEach((path) => path.setAttribute("d", d));
      const hook = strap.current.querySelector<SVGGElement>(".ym-hook");
      hook?.setAttribute("transform", `translate(${ex} ${ey}) rotate(${(-s.angle * 180) / Math.PI * -1.1})`);
    }
    if (card.current) {
      card.current.style.transform = `translate(${ex - center}px, ${ey - STRAP}px) rotate(${s.angle * 1.1}rad) rotateX(${s.rx}deg) rotateY(${s.ry}deg)`;
    }
  }

  useEffect(draw);

  // Мышь качает пропуск без нажатия, палец - ведя по нему: на телефоне
  // pointermove приходит только пока палец на экране. Вертикальный жест
  // остаётся прокруткой страницы (touch-action: pan-y), горизонтальный -
  // наш.
  function move(event: PointerEvent<HTMLDivElement>) {
    if (still) return;
    const s = state.current;
    const now = performance.now();
    if (s.lastX) {
      const vx = (event.clientX - s.lastX) / Math.max(8, now - (s.lastT || now - 16));
      // Палец ведут медленнее мыши - ему отклик сильнее.
      s.speed += vx * (event.pointerType === "mouse" ? 0.09 : 0.22);
    }
    s.lastX = event.clientX;
    const box = card.current?.getBoundingClientRect();
    if (box) {
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      s.tx = -y * 9;
      s.ty = x * 11;
      card.current?.style.setProperty("--gx", `${(x + 0.5) * 100}%`);
      card.current?.style.setProperty("--gy", `${(y + 0.5) * 100}%`);
    }
    kick();
  }

  // Касание - лёгкий толчок в ту сторону, где палец, чтобы пропуск отвечал
  // и на тап.
  function press(event: PointerEvent<HTMLDivElement>) {
    if (still || event.pointerType === "mouse") return;
    const s = state.current;
    const box = card.current?.getBoundingClientRect();
    if (box) s.speed += ((event.clientX - box.left) / box.width - 0.5) * 2.4;
    s.lastX = event.clientX;
    kick();
  }

  function leave() {
    const s = state.current;
    s.tx = 0;
    s.ty = 0;
    s.lastX = 0;
    kick();
  }

  return (
    <div
      className="ym-pass-wrap"
      ref={wrap}
      onPointerDown={press}
      onPointerMove={move}
      onPointerUp={leave}
      onPointerCancel={leave}
      onPointerLeave={leave}
      style={{ paddingTop: STRAP }}
    >
      <svg className="ym-strap" width={width} height={STRAP + 40} aria-hidden>
        <defs>
          <linearGradient id={metal} x1="0" x2="1">
            <stop offset="0" stopColor="#8d8f93" />
            <stop offset="0.45" stopColor="#f2f3f4" />
            <stop offset="0.6" stopColor="#c9cbce" />
            <stop offset="1" stopColor="#77797d" />
          </linearGradient>
          <linearGradient id={weave} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="6" spreadMethod="repeat">
            <stop offset="0" stopColor="#e0381c" />
            <stop offset="0.5" stopColor="#c92f16" />
            <stop offset="1" stopColor="#e0381c" />
          </linearGradient>
        </defs>
        <g ref={strap}>
          {/* Тень ленты, тело с прострочкой по краям и надпись по центру. */}
          <path className="ym-strap-shadow" />
          <path className="ym-strap-stitch" />
          <path className="ym-strap-body" stroke={`url(#${weave})`} />
          <path id={line} className="ym-strap-line" />
          <text className="ym-strap-text">
            <textPath href={`#${line}`} startOffset="6">
              OXAR · OXAR · OXAR
            </textPath>
          </text>
          {/* Карабин: кольцо, корпус с защёлкой и хлястик к прорези. */}
          <g className="ym-hook">
            {/* Петля ленты вокруг кольца. */}
            <rect x="-10" y="-6" width="20" height="8" rx="2" fill="#b92a12" />
            <rect x="-11" y="0" width="22" height="6" rx="3" fill={`url(#${metal})`} stroke="#5e6064" strokeWidth="0.6" />
            {/* Вертлюг и корпус карабина с защёлкой. */}
            <rect x="-2.5" y="5" width="5" height="5" rx="1" fill={`url(#${metal})`} stroke="#5e6064" strokeWidth="0.5" />
            <path
              d="M-6 10 L-6 23 Q-6 31 0 31 Q6 31 6 23 L6 14"
              fill="none"
              stroke="#5e6064"
              strokeWidth="4.6"
              strokeLinecap="round"
            />
            <path d="M-6 10 L-6 23 Q-6 31 0 31 Q6 31 6 23 L6 14" fill="none" stroke={`url(#${metal})`} strokeWidth="3.2" strokeLinecap="round" />
            <path d="M6 14 L2.5 21" stroke="#5e6064" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 14 L2.5 21" stroke="#e7e8ea" strokeWidth="1" strokeLinecap="round" />
            {/* Прозрачный хлястик - от карабина в прорезь пропуска. */}
            <path d="M-6 28 h12 v12 a3 3 0 0 1 -3 3 h-6 a3 3 0 0 1 -3 -3 Z" fill="rgba(230,236,242,0.6)" stroke="rgba(140,150,160,0.7)" strokeWidth="0.8" />
          </g>
        </g>
      </svg>

      <div className="ym-pass" ref={card}>
        <span className="ym-slot" aria-hidden />
        <div className="ym-pass-cover">
          <span className="ym-pass-grain" aria-hidden />
          <div className="ym-pass-cover-top">
            <img src="/site/oxar-mark.webp" alt="" />
            <span>2026</span>
          </div>
          <div className="ym-pass-cover-name">
            <span>Reach pass</span>
            <b>Logo on real things</b>
          </div>
        </div>

        <div className="ym-pass-body">
          <div className="ym-pass-holder">
            <span className="ym-ava" style={picture ? undefined : avatar}>
              {picture && <img src={picture} alt="" />}
            </span>
            <div>
              <span className="ym-pass-label">Holder</span>
              <b>{holder}</b>
              <span>{brands}</span>
            </div>
          </div>
          <div className="ym-pass-reach">
            <span className="ym-pass-label">Seen by</span>
            <b>
              {estimated && "~"}
              {reach.toLocaleString("en-US")}
            </b>
            <p>
              people saw your logo, across all your auctions
              {estimated && <em> · estimated</em>}
            </p>
          </div>
        </div>

        <div className="ym-tear" aria-hidden />

        <div className="ym-pass-stub">
          {lines.map((line) => (
            <div key={line.title} className="ym-pass-row">
              <span className="ym-pass-thumb">{line.thumb && <img src={line.thumb} alt="" />}</span>
              <span>{line.title}</span>
              <b>{line.reach}</b>
            </div>
          ))}
        </div>
        <span className="ym-pass-glare" aria-hidden />
      </div>
    </div>
  );
}
