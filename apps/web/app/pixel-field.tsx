"use client";

import { useEffect, useRef } from "react";

/**
 * Живая сетка квадратов за первым экраном - те же «деньги», что ездят по
 * схеме ниже. Часть клеток медленно тлеет красным, клетка под курсором
 * загорается, и от неё расходится перекрестие по своей строке и колонке.
 *
 * Рисуем на холсте: сотни клеток DOM-элементами перерисовывались бы на
 * каждое движение мыши. Холст крутится, только пока экран виден, и стоит
 * без движения, если человек просил систему не анимировать.
 */

const RED = "224, 56, 28";
/** Сколько клеток тлеют сами по себе. */
const GLOW_SHARE = 0.09;
/** За сколько секунд гаснет клетка, с которой ушёл курсор. */
const FADE = 0.7;

export function PixelField() {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvas.current;
    // Курсор ловим на всём первом экране: сам холст под текстом и кнопками
    // и событий не получает.
    const host = el?.parentElement?.parentElement;
    if (!el || !host) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let size = 72;
    let cols = 0;
    let rows = 0;
    let glow: { at: number; phase: number; speed: number }[] = [];
    // Клетки, с которых курсор ушёл: номер клетки - сколько ей ещё гаснуть.
    const trail = new Map<number, number>();
    let hover = -1;
    let line = "rgba(0,0,0,0.06)";

    const layout = () => {
      const box = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(box.width * dpr);
      el.height = Math.round(box.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      size = box.width < 700 ? 48 : 72;
      cols = Math.ceil(box.width / size);
      rows = Math.ceil(box.height / size);
      const total = cols * rows;
      glow = Array.from({ length: Math.round(total * GLOW_SHARE) }, () => ({
        at: Math.floor(Math.random() * total),
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 0.6,
      }));
      // Линии сетки - цветом разделителей текущей темы.
      const ink = getComputedStyle(document.documentElement).getPropertyValue("--line").trim();
      line = ink || line;
    };

    const cell = (at: number, alpha: number, lit = false) => {
      const x = (at % cols) * size;
      const y = Math.floor(at / cols) * size;
      if (lit) {
        ctx.shadowColor = `rgba(${RED}, ${alpha})`;
        ctx.shadowBlur = 24;
      }
      ctx.fillStyle = `rgba(${RED}, ${alpha})`;
      ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
      ctx.shadowBlur = 0;
    };

    // Перекрестие от горящей клетки: тонкие линии по краям её строки и
    // колонки, гаснут к краям экрана.
    const cross = (at: number, alpha: number) => {
      const x = (at % cols) * size;
      const y = Math.floor(at / cols) * size;
      const w = cols * size;
      const h = rows * size;
      const across = ctx.createLinearGradient(0, 0, w, 0);
      across.addColorStop(0, `rgba(${RED}, 0)`);
      across.addColorStop(Math.max(0, Math.min(1, (x + size / 2) / w)), `rgba(${RED}, ${alpha})`);
      across.addColorStop(1, `rgba(${RED}, 0)`);
      const down = ctx.createLinearGradient(0, 0, 0, h);
      down.addColorStop(0, `rgba(${RED}, 0)`);
      down.addColorStop(Math.max(0, Math.min(1, (y + size / 2) / h)), `rgba(${RED}, ${alpha})`);
      down.addColorStop(1, `rgba(${RED}, 0)`);
      ctx.lineWidth = 1;
      ctx.strokeStyle = across;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.moveTo(0, y + size - 0.5);
      ctx.lineTo(w, y + size - 0.5);
      ctx.stroke();
      ctx.strokeStyle = down;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.moveTo(x + size - 0.5, 0);
      ctx.lineTo(x + size - 0.5, h);
      ctx.stroke();
    };

    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      ctx.clearRect(0, 0, el.width, el.height);

      // Сетка вполсилы: она фон, а не рисунок.
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c <= cols; c++) {
        ctx.moveTo(c * size + 0.5, 0);
        ctx.lineTo(c * size + 0.5, rows * size);
      }
      for (let r = 0; r <= rows; r++) {
        ctx.moveTo(0, r * size + 0.5);
        ctx.lineTo(cols * size, r * size + 0.5);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      for (const one of glow) {
        const wave = still ? 0.5 : (Math.sin(t * one.speed + one.phase) + 1) / 2;
        cell(one.at, 0.02 + wave * 0.07);
      }
      for (const [at, left] of trail) {
        const next = left - dt;
        if (next <= 0) {
          trail.delete(at);
          continue;
        }
        trail.set(at, next);
        cell(at, 0.3 * (next / FADE));
      }
      if (hover >= 0) {
        cross(hover, 0.45);
        cell(hover, 0.4, true);
      }
    };

    const move = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const inside = x >= 0 && y >= 0 && x < box.width && y < box.height;
      const at = inside ? Math.floor(y / size) * cols + Math.floor(x / size) : -1;
      if (at === hover) return;
      if (hover >= 0) trail.set(hover, FADE);
      hover = at;
      if (still) draw(performance.now());
    };
    const leave = () => {
      if (hover >= 0) trail.set(hover, FADE);
      hover = -1;
    };

    layout();
    let frame = 0;
    let visible = false;
    const loop = (now: number) => {
      draw(now);
      frame = requestAnimationFrame(loop);
    };
    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      if (visible && !still) frame = requestAnimationFrame(loop);
      else draw(performance.now());
    });
    seen.observe(el);

    // Тема поменялась - перечитываем цвет линий.
    const theme = new MutationObserver(layout);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const resize = new ResizeObserver(layout);
    resize.observe(el);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      seen.disconnect();
      theme.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div className="hero-pixels" aria-hidden>
      <canvas ref={canvas} />
    </div>
  );
}
