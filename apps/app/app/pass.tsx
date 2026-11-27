"use client";

import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import "./pass.css";

/**
 * Пропуск охвата на двух лентах. Верле-физика: каждая лента - цепочка точек,
 * карточка - жёсткий прямоугольник из четырёх точек со связями по сторонам и
 * диагоналям. Тянешь карточку - ленты натягиваются, отпустил - качается и
 * успокаивается.
 *
 * Охват - сумма охватов торгов, где стоял логотип человека. Пока цифры
 * вносим мы, а не статистика постов, пропуск честно пишет «estimated».
 */

export type PassLine = { title: string; reach: string; note: string };

type Card = {
  holder: string;
  reach: number;
  estimated: boolean;
  lines: PassLine[];
  /** Своя картинка профиля, если загружена. */
  picture: string | null;
  avatar: CSSProperties;
  letter: string;
};

/** Сама карточка: на ленте в кабинете и без ленты в окне «поделиться». */
export function PassCard({
  card,
  holder,
  reach,
  estimated,
  lines,
  picture,
  avatar,
  letter,
}: Card & { card?: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="lp-card" ref={card}>
      <span className="lp-holes" aria-hidden>
        <i />
        <i />
      </span>
      <div className="lp-cover">
        <div className="lp-cover-top">
          <img src="/site/oxar-mark.webp" alt="" />
          <span>2026</span>
        </div>
        <b>Reach pass</b>
        <span className="lp-cover-sub">Logo on real things</span>
      </div>
      <div className="lp-body">
        <div className="lp-holder">
          <span className="lp-ava" style={picture ? undefined : avatar}>
            {picture ? <img src={picture} alt="" /> : letter}
          </span>
          <div>
            <span className="lp-label">Holder</span>
            <span className="lp-name">{holder}</span>
          </div>
        </div>
        <div className="lp-seen">
          <span className="lp-label">Seen by</span>
          <b>
            {estimated && "~"}
            {reach.toLocaleString("en-US")}
          </b>
          <span className="lp-mute">people saw your logo{estimated && " · estimated"}</span>
        </div>
      </div>
      <div className="lp-tear" aria-hidden />
      <div className="lp-stub">
        {lines.length === 0 && <small>Win a spot and it shows up here</small>}
        {lines.map((line) => (
          <div key={line.title} className="lp-line">
            <div>
              <span>{line.title}</span>
              <span>{line.reach}</span>
            </div>
            <small>{line.note}</small>
          </div>
        ))}
      </div>
      <span className="lp-glare" aria-hidden />
    </div>
  );
}

/** Точек в ленте; гравитация, px/с²; проходов по связям; затухание за кадр. */
const N = 12;
const G = 1400;
const ITER = 14;
const DAMP = 0.985;
/** Скорость точки за кадр ограничена: резкий бросок не выкинет пропуск за экран. */
const MAX = 28;
/**
 * Ниже этой линии от верха держатся углы пропуска: выше точек подвеса (-30)
 * он не взлетает, даже повёрнутый боком - запас на край карточки за углом.
 */
const CEIL = 50;
/** Отступ точки крепления ленты от углов карточки. */
const HOLE_X = 26;
const HOLE_Y = 18;
const SVG = "http://www.w3.org/2000/svg";

type Pt = { x: number; y: number; px: number; py: number; pin: boolean };

export function ReachPass(props: Card) {
  const host = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const box = host.current;
    const el = card.current;
    const art = svg.current;
    if (!box || !el || !art) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const pts: Pt[] = [];
    const links: { a: Pt; b: Pt; d: number }[] = [];
    const ropes: Pt[][] = [[], []];
    let corners: Pt[] = [];
    const P = (x: number, y: number, pin = false) => {
      const p = { x, y, px: x, py: y, pin };
      pts.push(p);
      return p;
    };
    const link = (a: Pt, b: Pt) => links.push({ a, b, d: Math.hypot(a.x - b.x, a.y - b.y) });

    function build() {
      pts.length = 0;
      links.length = 0;
      const W = box!.clientWidth;
      const H = box!.clientHeight;
      const cw = el!.offsetWidth;
      const ch = el!.offsetHeight;
      const top = -30;
      const spread = Math.min(W * 0.22, 120);
      const cx = W / 2;
      const cardTop = top + Math.max(140, H - ch - 70);
      const c0 = P(cx - cw / 2 + HOLE_X, cardTop);
      const c1 = P(cx + cw / 2 - HOLE_X, cardTop);
      const c2 = P(cx + cw / 2 - HOLE_X, cardTop + ch - HOLE_Y);
      const c3 = P(cx - cw / 2 + HOLE_X, cardTop + ch - HOLE_Y);
      corners = [c0, c1, c2, c3];
      link(c0, c1);
      link(c1, c2);
      link(c2, c3);
      link(c3, c0);
      link(c0, c2);
      link(c1, c3);
      // Две ленты: от точки над экраном к дыркам карточки.
      (
        [
          [cx - spread, c0],
          [cx + spread, c1],
        ] as const
      ).forEach(([ax, end], k) => {
        const chain = [P(ax, top, true)];
        for (let i = 1; i < N; i++) {
          const t = i / N;
          chain.push(P(ax + (end.x - ax) * t, top + (end.y - top) * t));
          link(chain[i - 1]!, chain[i]!);
        }
        chain.push(end);
        link(chain[N - 1]!, end);
        ropes[k] = chain;
      });
      // Лёгкий толчок: видно, что живое.
      if (!still) for (const p of corners) p.px -= 6;
    }

    const parts = [0, 1].map(() => {
      const g = document.createElementNS(SVG, "g");
      const paths = ["lp-shadow", "lp-band", "lp-stitch"].map((name) => {
        const path = document.createElementNS(SVG, "path");
        path.setAttribute("class", name);
        return path;
      });
      g.append(...paths);
      const ring = document.createElementNS(SVG, "circle");
      ring.setAttribute("r", "6");
      ring.setAttribute("class", "lp-ring");
      art.append(g, ring);
      return { g, paths, ring };
    });

    let grab: { p: Pt; dx: number; dy: number; m: { x: number; y: number } } | null = null;
    let wind = 0;
    let lastMx: number | null = null;
    const local = (event: PointerEvent) => {
      const r = box.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    };
    const down = (event: PointerEvent) => {
      if (still) return;
      const m = local(event);
      // Хватаем за ближнюю точку карточки со смещением: карточка не прыгает к курсору.
      const near = corners.reduce((a, b) =>
        Math.hypot(a.x - m.x, a.y - m.y) < Math.hypot(b.x - m.x, b.y - m.y) ? a : b,
      );
      grab = { p: near, dx: near.x - m.x, dy: near.y - m.y, m };
      el.setPointerCapture(event.pointerId);
      el.classList.add("held");
    };
    const drag = (event: PointerEvent) => {
      if (grab) grab.m = local(event);
    };
    const drop = () => {
      // Отпустили: точка, которую держали, получает скорость соседей, а не скачок от курсора.
      if (grab) {
        const other = corners.find((p) => p !== grab!.p)!;
        grab.p.px = grab.p.x - (other.x - other.px);
        grab.p.py = grab.p.y - (other.y - other.py);
      }
      grab = null;
      el.classList.remove("held");
    };
    // Мышь рядом - лёгкий ветерок по карточке.
    const breeze = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const m = local(event);
      if (lastMx !== null && !grab) wind += (m.x - lastMx) * 0.6;
      lastMx = m.x;
    };
    const calm = () => {
      lastMx = null;
    };

    function smooth(chain: Pt[]) {
      let d = `M${chain[0]!.x} ${chain[0]!.y}`;
      for (let i = 1; i < chain.length - 1; i++) {
        const a = chain[i]!;
        const b = chain[i + 1]!;
        d += ` Q${a.x} ${a.y} ${(a.x + b.x) / 2} ${(a.y + b.y) / 2}`;
      }
      const end = chain[chain.length - 1]!;
      return `${d} L${end.x} ${end.y}`;
    }

    function physics(dt: number) {
      if (grab) {
        grab.p.x = grab.m.x + grab.dx;
        grab.p.y = grab.m.y + grab.dy;
      }
      for (const p of pts) {
        if (p.pin || (grab && p === grab.p)) continue;
        let vx = (p.x - p.px) * DAMP;
        let vy = (p.y - p.py) * DAMP;
        const speed = Math.hypot(vx, vy);
        if (speed > MAX) {
          vx *= MAX / speed;
          vy *= MAX / speed;
        }
        p.px = p.x;
        p.py = p.y;
        p.x += vx + (corners.includes(p) ? wind * dt : 0);
        p.y += vy + G * dt * dt;
      }
      wind *= 0.85;
      for (const p of corners) {
        if (p.y < CEIL) {
          p.y = CEIL;
          p.py = Math.min(p.py, p.y);
        }
      }
      for (let k = 0; k < ITER; k++) {
        for (const l of links) {
          const dx = l.b.x - l.a.x;
          const dy = l.b.y - l.a.y;
          const d = Math.hypot(dx, dy) || 1;
          // Лента не тянется, но и не толкает: сжиматься ей можно.
          if ((!corners.includes(l.a) || !corners.includes(l.b)) && d < l.d) continue;
          const diff = (d - l.d) / d;
          const fa = l.a.pin || (grab && l.a === grab.p) ? 0 : 1;
          const fb = l.b.pin || (grab && l.b === grab.p) ? 0 : 1;
          const s = fa + fb || 1;
          l.a.x += (dx * diff * fa) / s;
          l.a.y += (dy * diff * fa) / s;
          l.b.x -= (dx * diff * fb) / s;
          l.b.y -= (dy * diff * fb) / s;
        }
      }
    }

    function draw() {
      // Карточка по двум верхним точкам; лёгкий 3D-наклон от скорости.
      const [c0, c1] = corners as [Pt, Pt];
      const angle = Math.atan2(c1.y - c0.y, c1.x - c0.x);
      const vx = c0.x - c0.px;
      el!.style.transform = `translate(${c0.x}px, ${c0.y}px) rotate(${angle}rad) translate(${-HOLE_X}px, ${-HOLE_Y}px) perspective(900px) rotateY(${Math.max(-18, Math.min(18, -vx * 2.2))}deg)`;
      el!.style.setProperty("--g", `${50 + Math.max(-50, Math.min(50, vx * 12))}%`);
      ropes.forEach((chain, k) => {
        const d = smooth(chain);
        for (const path of parts[k]!.paths) path.setAttribute("d", d);
        parts[k]!.ring.setAttribute("cx", String(chain[N]!.x));
        parts[k]!.ring.setAttribute("cy", String(chain[N]!.y));
      });
    }

    let frame = 0;
    let last = performance.now();
    function step(now: number) {
      physics(Math.min((now - last) / 1000, 1 / 30));
      last = now;
      draw();
      frame = requestAnimationFrame(step);
    }

    // Без движения - сразу в покое: ленты провисли, карточка висит ровно.
    function settle() {
      build();
      if (still) for (let i = 0; i < 240; i++) physics(1 / 60);
      draw();
    }
    settle();
    const watch = new ResizeObserver(settle);
    watch.observe(box);
    watch.observe(el);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", drag);
    el.addEventListener("pointerup", drop);
    el.addEventListener("pointercancel", drop);
    box.addEventListener("pointermove", breeze);
    box.addEventListener("pointerleave", calm);
    if (!still) frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      watch.disconnect();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", drag);
      el.removeEventListener("pointerup", drop);
      el.removeEventListener("pointercancel", drop);
      box.removeEventListener("pointermove", breeze);
      box.removeEventListener("pointerleave", calm);
      for (const part of parts) {
        part.g.remove();
        part.ring.remove();
      }
    };
  }, []);

  return (
    <div className="lp-host" ref={host}>
      <svg ref={svg} aria-hidden />
      <PassCard {...props} card={card} />
    </div>
  );
}
