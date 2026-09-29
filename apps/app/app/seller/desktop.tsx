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
  const [session, setSession] = useState<{ id: string; secret: string } | null>(null);
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

  // В ссылке секрет сессии: по нему телефон снимает без входа и кошелька.
  const link = session ? `${window.location.origin}/?c=${session.secret}` : "";

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
 * QR: жирные круглые точки почти впритык, скруглённые угловые метки, знак OXAR в
 * центре. Ссылка постоянная и короткая, поэтому сетка маленькая и модули
 * крупные. Центр под знаком - около 6% кода: на маленькой сетке 8% уже
 * ломали чтение крупным планом.
 */
function Code({ text }: { text: string }) {
  const shape = useMemo(() => {
    const code = qrcode(0, "Q");
    code.addData(text);
    code.make();
    const n = code.getModuleCount();
    const finder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    const cells: [number, number][] = [];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (code.isDark(y, x) && !finder(x, y)) cells.push([x, y]);
      }
    }
    return { n, cells, hole: Math.sqrt((0.06 * n * n) / Math.PI) };
  }, [text]);

  const { n } = shape;
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} aria-label="QR code">
      {shape.cells.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x + 0.5} cy={y + 0.5} r={0.46} fill="currentColor" />
      ))}
      {[
        [0, 0],
        [n - 7, 0],
        [0, n - 7],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x! + 0.5} y={y! + 0.5} width={6} height={6} rx={1.8} fill="none" stroke="currentColor" strokeWidth={1} />
          <rect x={x! + 2} y={y! + 2} width={3} height={3} rx={0.9} fill="currentColor" />
        </g>
      ))}
      <circle cx={n / 2} cy={n / 2} r={shape.hole} className="sl-qr-hole" />
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
