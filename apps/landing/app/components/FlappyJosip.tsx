"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BIRD_R,
  BIRD_X,
  BOARD_W,
  fresh,
  GAP,
  H,
  LIFT,
  PRICES,
  step,
  W,
  type World,
} from "@/lib/flappy";

/**
 * Flappy Josip. Тап или пробел - подъём, дальше падение, пролетаешь между
 * рекламными щитами. На щитах пунктирная рамка, "YOUR AD HERE" и цена: игра про
 * то же, про что и сам продукт - свободное место, которое кто-то мог бы купить.
 *
 * Поле логическое, 340 на 480; канвас масштабируется под контейнер и под
 * плотность экрана, поэтому физика одинакова на любом устройстве.
 */

export function FlappyJosip({
  onScore,
}: {
  /** null - начата новая попытка, прошлый результат больше не актуален. */
  onScore?: (score: number | null) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World>(fresh());
  const face = useRef<HTMLImageElement | null>(null);
  const [phase, setPhase] = useState<"ready" | "playing" | "dead">("ready");
  const [score, setScore] = useState(0);

  const flap = useCallback(() => {
    if (phase === "dead") return;
    if (phase === "ready") setPhase("playing");
    world.current.vy = LIFT;
  }, [phase]);

  const restart = useCallback(() => {
    world.current = fresh();
    setScore(0);
    setPhase("ready");
    onScore?.(null);
  }, [onScore]);

  // Лицо рисуем картинкой: держим её в ref, чтобы не грузить на каждый кадр.
  useEffect(() => {
    const image = new Image();
    image.src = "/icons/josip.png";
    image.onload = () => {
      face.current = image;
    };
  }, []);

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;

    const ctx = node.getContext("2d");
    if (!ctx) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 3);
    node.width = W * ratio;
    node.height = H * ratio;

    let raf = 0;
    let last = performance.now();
    let running = true;

    const draw = () => {
      const w = world.current;

      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // небо
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#eef2fb");
      sky.addColorStop(1, "#f7f7f5");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      for (const board of w.boards) {
        const top = board.gapY - GAP / 2;
        const bottom = board.gapY + GAP / 2;
        for (const [y0, y1] of [
          [0, top],
          [bottom, H],
        ] as const) {
          const height = y1 - y0;
          if (height <= 4) continue;

          ctx.fillStyle = "#ffffff";
          ctx.fillRect(board.x, y0, BOARD_W, height);

          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = "#b9c0d4";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(board.x + 4, y0 + 4, BOARD_W - 8, height - 8);
          ctx.setLineDash([]);

          // Подпись только если щит достаточно высок, иначе текст налезает
          if (height > 74) {
            ctx.save();
            ctx.translate(board.x + BOARD_W / 2, y0 + height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = "#8a90a6";
            ctx.font = "600 11px ui-sans-serif, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("YOUR AD HERE", 0, -4);
            ctx.fillStyle = "#5b6178";
            ctx.font = "700 12px ui-sans-serif, system-ui, sans-serif";
            ctx.fillText(`$${board.price}`, 0, 12);
            ctx.restore();
          }
        }
      }

      // земля
      ctx.fillStyle = "#e7e7e2";
      ctx.fillRect(0, H - 6, W, 6);

      // сам Йосип
      ctx.save();
      ctx.beginPath();
      ctx.arc(BIRD_X, w.y, BIRD_R, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = "#6b46e5";
      ctx.fill();
      ctx.clip();
      if (face.current) {
        ctx.drawImage(face.current, BIRD_X - BIRD_R, w.y - BIRD_R, BIRD_R * 2, BIRD_R * 2);
      }
      ctx.restore();

      ctx.fillStyle = "#16161a";
      ctx.font = "700 28px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(w.score), W / 2, 48);
    };

    const frame = (now: number) => {
      if (!running) return;
      // Шаг ограничен: после сворачивания вкладки один кадр иначе перенёс бы
      // Йосипа через щит без столкновения.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      if (phase === "playing") {
        world.current = step(world.current, dt, () => ({
          gapY: 90 + Math.random() * (H - 180),
          price: PRICES[Math.floor(Math.random() * PRICES.length)]!,
        }));

        if (world.current.score !== score) setScore(world.current.score);
        if (world.current.dead) {
          setPhase("dead");
          onScore?.(world.current.score);
        }
      }

      draw();
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [phase, score, onScore]);

  // Пробел - как в оригинале. Слушаем на окне: канвас может быть не в фокусе.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.code !== "ArrowUp") return;
      event.preventDefault();
      if (phase === "dead") restart();
      else flap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap, phase, restart]);

  return (
    <div className="flap">
      <div
        className="flap-field"
        onPointerDown={(event) => {
          event.preventDefault();
          if (phase === "dead") restart();
          else flap();
        }}
      >
        <canvas ref={canvas} className="flap-canvas" style={{ aspectRatio: `${W} / ${H}` }} />

        {phase === "ready" && (
          <div className="flap-over">
            <strong>Tap to fly</strong>
            <span className="muted small">Space works too</span>
          </div>
        )}

        {phase === "dead" && (
          <div className="flap-over">
            <strong>{score} boards</strong>
            <span className="muted small">Tap to try again</span>
          </div>
        )}
      </div>
    </div>
  );
}
