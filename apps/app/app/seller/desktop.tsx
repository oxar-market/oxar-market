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

  const link = session ? `${window.location.origin}/?capture=${session}` : "";

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
        <div className="sl-qr">{link && <Dots text={link} />}<b>OXAR</b></div>
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
 * QR точками. Модули рисуются кружками, а не квадратами - как на борде; три
 * угловых поиска остаются целыми, иначе телефон код не прочтёт. Центр
 * закрыт кружком с «OXAR», поэтому коррекция ошибок - высокая.
 */
function Dots({ text }: { text: string }) {
  const cells = useMemo(() => {
    const code = qrcode(0, "H");
    code.addData(text);
    code.make();
    const size = code.getModuleCount();
    const out: { x: number; y: number; finder: boolean }[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!code.isDark(y, x)) continue;
        const finder =
          (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
        out.push({ x, y, finder });
      }
    }
    return { size, out };
  }, [text]);
  return (
    <svg viewBox={`0 0 ${cells.size} ${cells.size}`} aria-label="QR code">
      {cells.out.map((cell) =>
        cell.finder ? (
          <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={1} height={1} fill="currentColor" />
        ) : (
          <circle key={`${cell.x}-${cell.y}`} cx={cell.x + 0.5} cy={cell.y + 0.5} r={0.36} fill="currentColor" />
        ),
      )}
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
