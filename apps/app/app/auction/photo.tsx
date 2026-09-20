"use client";

import { useEffect, useRef, useState } from "react";
import { quadTransform, type Corners } from "./quad.ts";
import { SPOTS } from "./spots.ts";

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
}: {
  shot: string;
  /** Углы каждого места на этом кадре, долями стороны. */
  quads: Record<string, Corners | null>;
  picked: string;
  onPick: (code: string) => void;
  /** Что показать в месте: свой примеренный файл или креатив лидера. */
  art: Record<string, string | undefined>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);

  // Матрица считается в пикселях, поэтому размер кадра надо знать. Следим, а
  // не меряем однажды: сцена резиновая, и поворот телефона её меняет.
  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const watch = new ResizeObserver(() => setSide(host.clientWidth));
    watch.observe(host);
    setSide(host.clientWidth);
    return () => watch.disconnect();
  }, []);

  return (
    <div className="photo" ref={box}>
      <img className="photo-shot" src={shot} alt="" draggable={false} />

      {side > 0 &&
        SPOTS.map((spot) => {
          const quad = quads[spot.code];
          // Места с этой стороны не видно - накладки нет вовсе. Прозрачная
          // кнопка на дальней стороне ловила бы клики сквозь вещь.
          if (!quad) return null;

          const matrix = quadTransform(
            quad.map(([x, y]) => [x * side, y * side]) as Corners,
          );
          if (!matrix) return null;

          const image = art[spot.code];
          return (
            <button
              key={spot.code}
              type="button"
              className={spot.code === picked ? "photo-spot on" : "photo-spot"}
              aria-label={spot.label}
              aria-pressed={spot.code === picked}
              onClick={() => onPick(spot.code)}
              style={{
                width: BASE,
                height: BASE,
                transform: `matrix3d(${matrix.join(",")}) scale(${1 / BASE}, ${1 / BASE})`,
              }}
            >
              {image && <img src={image} alt="" draggable={false} />}
            </button>
          );
        })}
    </div>
  );
}
