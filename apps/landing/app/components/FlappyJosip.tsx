"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Cross } from "./icons";
import {
  BIRD_R,
  birdX,
  BOARD_W,
  fresh,
  GAP,
  H,
  LIFT,
  priceFor,
  step,
  type World,
} from "@/lib/flappy";

/**
 * Flappy Josip. Тап или пробел - подъём, дальше падение, пролетаешь между
 * рекламными щитами. На щитах пунктирная рамка, "YOUR AD HERE" и цена по
 * размеру щита: игра про то же, про что и продукт - место, которое стоит
 * пустым, пока его не купили.
 *
 * Игра занимает весь экран. В рамке внутри окна она читалась как вставка, а на
 * телефоне от поля оставалась узкая полоска посреди пустоты.
 *
 * Высота поля логическая и постоянная - от неё зависит физика, и прыжок обязан
 * быть одинаковым везде. Ширина считается по пропорциям экрана: на широком
 * видно дальше вперёд, но сложность та же.
 */

export function FlappyJosip({
  onScore,
  onExit,
}: {
  /** null - начата новая попытка, прошлый результат больше не актуален. */
  onScore?: (score: number | null) => void;
  onExit?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World>(fresh());
  const face = useRef<HTMLImageElement | null>(null);
  const width = useRef(340);
  const [phase, setPhase] = useState<"ready" | "playing" | "dead">("ready");
  const [score, setScore] = useState(0);

  // Цикл создаётся один раз и читает фазу отсюда. Если он зависит от состояния,
  // то пересоздаётся на каждом очке - и вместе с ним заново создаётся мир:
  // игра сама начиналась с начала после первых же щитов.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const report = useRef(onScore);
  report.current = onScore;
  // Последний показанный счёт. Без него setScore звался бы каждый кадр, и React
  // перерисовывал бы разметку шестьдесят раз в секунду - отсюда подтормаживание.
  const shown = useRef(0);

  const flap = useCallback(() => {
    if (phase === "dead") return;
    if (phase === "ready") setPhase("playing");
    world.current.vy = LIFT;
  }, [phase]);

  const restart = useCallback(() => {
    world.current = fresh(width.current);
    shown.current = 0;
    setScore(0);
    setPhase("ready");
    report.current?.(null);
  }, []);

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

    // Тот же шрифт, что у всей страницы. Имя семейства у next/font хэшированное,
    // поэтому в канвас его можно передать только вычисленным значением.
    const family = getComputedStyle(document.body).fontFamily;

    let raf = 0;
    let last = performance.now();
    let running = true;
    let scale = 1;
    let sky: CanvasGradient | null = null;

    const resize = () => {
      const box = node.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      node.width = Math.round(box.width * ratio);
      node.height = Math.round(box.height * ratio);
      scale = node.height / H;
      // Логическая ширина - сколько игровых единиц влезает при этом масштабе
      width.current = node.width / scale;

      // Градиент зависит только от высоты поля, поэтому строится при смене
      // размера, а не в каждом кадре.
      sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#dde6fa");
      sky.addColorStop(1, "#f0f2f7");
    };

    resize();
    world.current = fresh(width.current);
    window.addEventListener("resize", resize);
    // Мир создаётся здесь один раз: пересоздание на каждый resize стирало бы
    // текущую попытку при повороте телефона.

    const draw = () => {
      const w = world.current;
      const logicalW = width.current;

      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, logicalW, H);

      ctx.fillStyle = sky ?? "#eef1f7";
      ctx.fillRect(0, 0, logicalW, H);

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

          // Контур: белый щит на светлом небе иначе сливается с фоном
          ctx.strokeStyle = "#c5cee2";
          ctx.lineWidth = 1;
          ctx.strokeRect(board.x + 0.5, y0 + 0.5, BOARD_W - 1, height - 1);

          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = "#b9c0d4";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(board.x + 4, y0 + 4, BOARD_W - 8, height - 8);
          ctx.setLineDash([]);

          // Подпись только если щит достаточно высок, иначе текст налезает.
          // Цена своя у каждой половины: она зависит от её площади.
          if (height > 64) {
            ctx.save();
            ctx.translate(board.x + BOARD_W / 2, y0 + height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = "center";
            ctx.fillStyle = "#9aa0b4";
            ctx.font = `600 8.5px ${family}`;
            ctx.fillText("YOUR AD HERE", 0, -3);
            ctx.fillStyle = "#6b7186";
            ctx.font = `700 9.5px ${family}`;
            ctx.fillText(`$${priceFor(height)}`, 0, 8);
            ctx.restore();
          }
        }
      }

      ctx.fillStyle = "#e7e7e2";
      ctx.fillRect(0, H - 6, logicalW, 6);

      // Само лицо, без подложки: фон у картинки прозрачный, и круг под ней
      // только обрезал уши и подбородок.
      if (face.current) {
        const size = BIRD_R * 2.4;
        ctx.drawImage(
          face.current,
          birdX(logicalW) - size / 2,
          w.y - size / 2,
          size,
          size,
        );
      }
    };

    const frame = (now: number) => {
      if (!running) return;
      // Шаг ограничен: после сворачивания вкладки один кадр иначе перенёс бы
      // Йосипа через щит без столкновения.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      if (phaseRef.current === "playing") {
        world.current = step(
          world.current,
          dt,
          () => 100 + Math.random() * (H - 200),
          width.current,
        );

        if (world.current.score !== shown.current) {
          shown.current = world.current.score;
          setScore(world.current.score);
        }
        if (world.current.dead) {
          setPhase("dead");
          report.current?.(world.current.score);
        }
      }

      draw();
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // Пустые зависимости намеренно: цикл живёт всё время, пока открыта игра.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        onExit?.();
        return;
      }
      if (event.code !== "Space" && event.code !== "ArrowUp") return;
      event.preventDefault();
      if (phase === "dead") restart();
      else flap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap, phase, restart, onExit]);

  // Игра рисуется в конце страницы, а не внутри окна: внутри её слой лежал в
  // контексте наложения окна и оказывался под доком.
  return createPortal(
    <div
      className="flap"
      onPointerDown={(event) => {
        event.preventDefault();
        if (phase === "dead") restart();
        else flap();
      }}
    >
      <canvas ref={canvas} className="flap-canvas" />

      {/* Счёт и кнопки разметкой, а не на канвасе: так они попадают в
          безопасную зону экрана и не прячутся под островом. */}
      <span className="flap-score">{score}</span>

      {/* Выход показывается до и после попытки, но не в полёте: там каждый тап
          - это взмах, и кнопка у края экрана ловит промахи вместо игры. */}
      {phase !== "playing" && (
        <button
          type="button"
          className="flap-close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onExit}
          aria-label="Close the game"
        >
          <Cross />
        </button>
      )}

      {phase === "ready" && (
        <div className="flap-over">
          <strong>Tap to fly</strong>
          <span className="muted small">Space works too</span>
        </div>
      )}

      {phase === "dead" && (
        <div className="flap-over">
          <strong>{score} boards</strong>
          <span className="muted small">Tap anywhere to try again</span>
          <button
            type="button"
            className="primary"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onExit}
          >
            Post this score
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}
