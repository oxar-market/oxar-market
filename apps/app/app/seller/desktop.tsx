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
  const [session, setSession] = useState<{ id: string; code: string } | null>(null);
  const [state, setState] = useState<"waiting" | "shooting" | "landed">("waiting");
  // Сессию не завели - QR вести некуда; остаётся загрузка файлами.
  const [noSession, setNoSession] = useState(false);

  useEffect(() => {
    void startCapture().then((started) => {
      setSession(started);
      setNoSession(started === null);
    });
  }, []);

  // Телефон пишет в ту же строку; раз в две секунды смотрим, что он сделал.
  useEffect(() => {
    if (!session) return;
    const tick = setInterval(async () => {
      const read = await readCapture(session.id);
      if (!read) return;
      setState(read.state);
      if (read.state === "landed" && read.photos.length > 0) {
        clearInterval(tick);
        onPhotos(read.photos, photoUrl(read.photos[0]!));
      }
    }, 2000);
    return () => clearInterval(tick);
  }, [session, onPhotos]);

  // Ссылка короткая намеренно: восемь знаков кода вместо uuid - и сетка
  // 29 на 29 вместо 49, полоски вдвое крупнее, камера берёт код увереннее.
  const link = session ? `${window.location.origin}/?c=${session.code}` : "";

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
        <div className="sl-qr">
          {link && <Code text={link} />}
          <img className="sl-qr-mark" src="/oxar-mark.webp" alt="" />
        </div>
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
 * QR в духе App Clip: код полосками, угловые метки - кольца с точкой, вокруг
 * - штриховые кольца, в центре знак OXAR.
 *
 * Полоски - это соседние тёмные модули строки, слитые в капсулу: форма
 * остаётся в клетках модулей, поэтому сканер читает код как обычный.
 * Кольца лежат за зазором в модуль от кода и в данные не попадают. Центр
 * под знаком - около 8% кода, коррекция Q восстанавливает до 25%; дырка
 * крупнее (13%) на сетке 29 на 29 уже ломала чтение.
 *
 * Проверено декодером zxing (тем же, что в Android-сканерах): короткая
 * ссылка читается на размерах от 494 до 160 px с кольцами и знаком.
 */
function Code({ text }: { text: string }) {
  const shape = useMemo(() => {
    const code = qrcode(0, "Q");
    code.addData(text);
    code.make();
    const n = code.getModuleCount();
    const finder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    const half = (n / 2) * Math.SQRT2;
    const gap = 1;
    const rings = 3;
    const step = 1.9;
    const radius = half + gap + rings * step + 0.6;
    const offset = radius - n / 2;

    // Полоски: серии тёмных модулей в строке, без угловых меток.
    const bars: { x: number; y: number; length: number }[] = [];
    for (let y = 0; y < n; y++) {
      let x = 0;
      while (x < n) {
        if (code.isDark(y, x) && !finder(x, y)) {
          const start = x;
          while (x < n && code.isDark(y, x) && !finder(x, y)) x++;
          bars.push({ x: start + offset, y: y + offset, length: x - start });
        } else {
          x++;
        }
      }
    }

    // Штрихи колец - случайные, но одни и те же для одного адреса: иначе
    // узор мерцал бы при каждой перерисовке.
    let seed = [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 7);
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const arcs: string[] = [];
    for (let ring = 0; ring < rings; ring++) {
      const r = half + gap + 0.5 + ring * step;
      let a = random() * Math.PI * 2;
      const end = a + Math.PI * 2 - 0.15;
      while (a < end) {
        const length = Math.min((0.18 + random() * 0.42) * (1 - 0.15 * ring), end - a);
        if (length < 0.05) break;
        const from = [radius + r * Math.cos(a), radius + r * Math.sin(a)];
        const to = [radius + r * Math.cos(a + length), radius + r * Math.sin(a + length)];
        arcs.push(
          `M${from[0]!.toFixed(3)} ${from[1]!.toFixed(3)}A${r} ${r} 0 0 1 ${to[0]!.toFixed(3)} ${to[1]!.toFixed(3)}`,
        );
        a += length + 0.1 + random() * 0.12;
      }
    }

    const eyes = [
      [0, 0],
      [n - 7, 0],
      [0, n - 7],
    ].map(([x, y]) => [x! + offset + 3.5, y! + offset + 3.5] as const);
    const hole = Math.sqrt((0.08 * n * n) / Math.PI);
    return { size: radius * 2, bars, arcs, eyes, hole, middle: radius };
  }, [text]);

  const thick = 0.78;
  return (
    <svg viewBox={`0 0 ${shape.size} ${shape.size}`} aria-label="QR code">
      {shape.bars.map((bar) => (
        <rect
          key={`${bar.x}-${bar.y}`}
          x={bar.x + (1 - thick) / 2}
          y={bar.y + (1 - thick) / 2}
          width={bar.length - (1 - thick)}
          height={thick}
          rx={thick / 2}
          fill="currentColor"
        />
      ))}
      {shape.eyes.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={3} fill="none" stroke="currentColor" strokeWidth={1} />
          <circle cx={x} cy={y} r={1.5} fill="currentColor" />
        </g>
      ))}
      {shape.arcs.map((path) => (
        <path key={path} d={path} fill="none" stroke="currentColor" strokeWidth={0.85} strokeLinecap="round" />
      ))}
      <circle cx={shape.middle} cy={shape.middle} r={shape.hole} className="sl-qr-hole" />
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
