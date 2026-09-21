"use client";

import { useEffect, useRef, useState } from "react";
import { quadTransform, type Corners } from "./quad.ts";
import { FRAME_PAD, FRAME_ROUND, SPOTS } from "./spots.ts";

/**
 * Вещь кадром, а не сценой.
 *
 * Тот же предмет, но снятый: кадр снят с запасом по разрешению и без оглядки
 * на скорость, поэтому он подробнее того, что рисуется вживую. Вертеть нельзя
 * - ракурсов ровно четыре, те же, что под сценой.
 *
 * Места на кадре не нарисованы заново: они уже есть на самом снимке, их
 * отпечатала та же разметка. Сверху ложится только прозрачная накладка - она
 * ловит клик и несёт креатив, если он есть.
 *
 * Креатив кладётся перспективно, а не растягивается: место на рукаве видно
 * трапецией, и картинка обязана лечь в ту же трапецию, иначе она выглядит
 * наклейкой поверх фотографии, а не печатью на ткани.
 *
 * Снимки сегодня делаем мы сами. Когда появятся настоящие - с телефона, со
 * штатива, откуда угодно, - они лягут в те же гнёзда: кадр и четыре угла на
 * каждое место. Эта смотрелка не изменится.
 */

/** База накладки в пикселях. Матрица потом сжимает её в единичный квадрат. */
const BASE = 100;

export function PhotoView({
  shot,
  quads,
  picked,
  onPick,
  art,
  drawFrames = false,
}: {
  shot: string;
  /** Углы каждого места на этом кадре, долями стороны. */
  quads: Record<string, Corners | null>;
  picked: string;
  onPick: (code: string) => void;
  /** Что показать в месте: свой примеренный файл или креатив лидера. */
  art: Record<string, string | undefined>;
  /**
   * Рисовать ли рамку и номер самой накладкой.
   *
   * На наших кадрах они уже отпечатаны - их проставила та же разметка, что и
   * на сцене, - и рисовать второй раз значило бы двоить. На чужом снимке
   * рисовать некому, и тогда это единственное, чем место видно.
   */
  drawFrames?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ side: 0, left: 0, top: 0 });

  /**
   * Куда именно легла картинка внутри рамки.
   *
   * Рамка повторяет сцену, а кадр квадратный, и лежит он в ней целиком, с
   * полями. Стыка не видно, потому что фона у снимка нет вовсе: он вырезан,
   * и вещь лежит на той же подложке, что и вещь на сцене.
   *
   * Разметка задана долями кадра, а не рамки, поэтому без этой поправки
   * места уехали бы вместе с полями.
   *
   * Следим, а не меряем однажды: рамка резиновая, и поворот телефона её
   * меняет.
   */
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const measure = () => {
      const side = Math.min(host.clientWidth, host.clientHeight);
      setFit({
        side,
        left: (host.clientWidth - side) / 2,
        top: (host.clientHeight - side) / 2,
      });
    };
    const watch = new ResizeObserver(measure);
    watch.observe(host);
    measure();
    return () => watch.disconnect();
  }, []);

  return (
    <div className="photo" ref={box}>
      <img className="photo-shot" src={shot} alt="" draggable={false} />

      {fit.side > 0 &&
        SPOTS.map((spot) => {
          const quad = quads[spot.code];
          // Места с этой стороны не видно - накладки нет вовсе. Прозрачная
          // кнопка на дальней стороне ловила бы клики сквозь вещь.
          if (!quad) return null;

          const matrix = quadTransform(
            quad.map(([x, y]) => [
              fit.left + x * fit.side,
              fit.top + y * fit.side,
            ]) as Corners,
          );
          if (!matrix) return null;

          // Углы у рамки скруглены, и обводка обязана повторить их, иначе по
          // четырём углам она торчит за пунктир.
          const short = Math.min(spot.size[0], spot.size[1]);
          const inner = [
            spot.size[0] - short * FRAME_PAD * 2,
            spot.size[1] - short * FRAME_PAD * 2,
          ];
          const round = short * FRAME_ROUND;
          const image = art[spot.code];
          return (
            <button
              key={spot.code}
              type="button"
              className={[
                "photo-spot",
                spot.code === picked ? "on" : "",
                drawFrames ? "drawn" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={spot.label}
              aria-pressed={spot.code === picked}
              onClick={() => onPick(spot.code)}
              style={{
                width: BASE,
                height: BASE,
                borderRadius: `${(round / inner[0]) * 100}% / ${(round / inner[1]) * 100}%`,
                transform: `matrix3d(${matrix.join(",")}) scale(${1 / BASE}, ${1 / BASE})`,
              }}
            >
              {image ? (
                <img src={image} alt="" draggable={false} />
              ) : (
                drawFrames && <span>{spot.label}</span>
              )}
            </button>
          );
        })}
    </div>
  );
}
