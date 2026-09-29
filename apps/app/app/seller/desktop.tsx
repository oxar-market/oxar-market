"use client";

import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { photoUrl, readCapture, startCapture } from "@/lib/seller";

/**
 * Вещь с десктопа: у ноутбука камера смотрит на человека, а не на вещь.
 * QR открывает камеру OXAR в браузере телефона того же человека; снимки
 * возвращаются сюда, и места размечаются уже на большом экране.
 *
 * Нет телефона - снимки можно загрузить файлами.
 */
export function AddOnDesktop({
  onBack,
  onPhotos,
}: {
  onBack: () => void;
  /** Снимки для разметки: пути из хранилища (с телефона) или файлы. */
  onPhotos: (photos: (Blob | string)[], preview: string) => void;
}) {
  const [session, setSession] = useState<string | null>(null);
  const [state, setState] = useState<"waiting" | "shooting" | "landed">("waiting");
  // Сессию не завели - QR вести некуда; остаётся загрузка файлами.
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    void startCapture().then((id) => {
      setSession(id);
      setNoSession(id === null);
    });
  }, []);

  // Телефон пишет в ту же строку; раз в две секунды смотрим, что он сделал.
  useEffect(() => {
    if (!session) return;
    const tick = setInterval(async () => {
      const read = await readCapture(session);
      if (!read) return;
      setState(read.state);
      if (read.state === "landed" && read.photos.length > 0) {
        clearInterval(tick);
        onPhotos(read.photos, photoUrl(read.photos[0]!));
      }
    }, 2000);
    return () => clearInterval(tick);
  }, [session, onPhotos]);

  // Ссылка короткая намеренно: чем меньше знаков, тем крупнее точка кода и
  // тем увереннее его берёт камера с расстояния.
  const link = session ? `${window.location.origin}/?c=${session.replace(/-/g, "")}` : "";

  return (
    <div className="sl-desk">
      <div className="sl-desk-top">
        <h1 className="mk-title">
          OXAR <span>You</span>
        </h1>
        <button type="button" onClick={onBack}>
          Back to your things
        </button>
      </div>

      <h2 className="sl-desk-title">Add a thing</h2>
      <p className="sl-desk-lead">
        Photos come from your phone camera. Marking spots works on either
        screen.
      </p>

      <div className="sl-qr-card">
        <i />
        <i />
        <i />
        <i />
        <div className="sl-qr">{link && <Dots text={link} />}</div>
        <h3 className="sl-qr-title">
          {state === "shooting" ? "Shooting on your phone" : "Scan with your phone camera"}
        </h3>
        <p className="sl-desk-lead">
          {state === "shooting"
            ? "The photos land here as soon as you tap Next on the phone."
            : "The OXAR camera opens in your phone browser. No app to install."}
        </p>
        {noSession ? (
          <p className="bad">The phone link did not start. Upload the photos instead.</p>
        ) : (
          <span className="sl-qr-wait">
            <i />
            {state === "shooting" ? "Your phone is shooting" : "Waiting for your phone"}
          </span>
        )}
        <div className="sl-qr-actions">
          <label>
            No phone? Upload photos
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={async (event) => {
                const files = [...(event.target.files ?? [])].slice(0, 3);
                if (files.length === 0) return;
                const cropped = await Promise.all(files.map(toPortrait));
                onPhotos(cropped, URL.createObjectURL(cropped[0]!));
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

/**
 * QR кругом, как на борде: настоящий код в центре, вокруг - точки той же
 * плотности до окружности, и квадрат кода растворяется в круге. Угловые
 * метки - кольца с точкой. Между кодом и узором вокруг - зазор в один
 * модуль: без него сканер не находит край кода (проверено - не читается). Центр закрыт кружком с «OXAR» -
 * это около 13% кода, поэтому коррекция ошибок Q (восстанавливает до 25%):
 * выше коррекция - больше модулей и мельче точки.
 *
 * Геометрия проверена декодером zxing (тем же, что в Android-сканерах) на
 * размерах от 494 до 160 px, вместе с надписью в центре.
 */
function Dots({ text }: { text: string }) {
  const shape = useMemo(() => {
    const code = qrcode(0, "Q");
    code.addData(text);
    code.make();
    const size = code.getModuleCount();
    const gap = 1;
    // Круг описывает квадрат кода с запасом; чётность подгоняется, чтобы код
    // лёг в сетку ровно, без полумодуля.
    let total = 2 * (Math.ceil((size / 2) * Math.SQRT2) + 2);
    if ((total - size) % 2) total += 1;
    const off = (total - size) / 2;
    const finder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);

    // Кольцо - случайное, но одно и то же для одного адреса: иначе код
    // мерцал бы узором при каждой перерисовке.
    let seed = [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const dots: [number, number][] = [];
    const radius = total / 2 - 0.6;
    for (let gy = 0; gy < total; gy++) {
      for (let gx = 0; gx < total; gx++) {
        const cx = gx + 0.5;
        const cy = gy + 0.5;
        if (Math.hypot(cx - total / 2, cy - total / 2) > radius) continue;
        const x = gx - off;
        const y = gy - off;
        if (x >= 0 && x < size && y >= 0 && y < size) {
          if (!finder(x, y) && code.isDark(y, x)) dots.push([cx, cy]);
        } else if (
          !(x >= -gap && x < size + gap && y >= -gap && y < size + gap) &&
          random() < 0.5
        ) {
          dots.push([cx, cy]);
        }
      }
    }
    const finders = [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ].map(([x, y]) => [x! + off, y! + off] as const);
    return { total, dots, finders, label: size * 0.2 };
  }, [text]);

  const middle = shape.total / 2;
  return (
    <svg viewBox={`0 0 ${shape.total} ${shape.total}`} aria-label="QR code">
      {shape.dots.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={0.4} fill="currentColor" />
      ))}
      {shape.finders.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x + 3.5} cy={y + 3.5} r={3} fill="none" stroke="currentColor" strokeWidth={1} />
          <circle cx={x + 3.5} cy={y + 3.5} r={1.5} fill="currentColor" />
        </g>
      ))}
      <circle cx={middle} cy={middle} r={shape.label} className="sl-qr-hole" />
      <text x={middle} y={middle} className="sl-qr-word" textAnchor="middle" dominantBaseline="central">
        OXAR
      </text>
    </svg>
  );
}

/** Загруженный файл - к той же пропорции 4:5, что у снимков камеры. */
export async function toPortrait(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const w = Math.min(bitmap.width, (bitmap.height * 4) / 5);
  const h = (w * 5) / 4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(Math.min(w, 1200));
  canvas.height = Math.round((canvas.width * 5) / 4);
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, (bitmap.width - w) / 2, (bitmap.height - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
  return new Promise((done) =>
    canvas.toBlob((blob) => done(blob ?? file), "image/jpeg", 0.88),
  );
}
