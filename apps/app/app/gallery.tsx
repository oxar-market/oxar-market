"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isVideo } from "@/lib/media";
import { stepIndex, swipeStep } from "@/lib/slides";

/**
 * Снимок или видео пруфа. Миниатюра видео - его первый кадр: iPhone без
 * #t сдвига кадр не рисует и показывает пустоту.
 */
export function Media({ src, play = false }: { src: string; play?: boolean }) {
  if (!isVideo(src)) return <img src={src} alt="" />;
  return play ? (
    <video src={src} controls playsInline preload="metadata" />
  ) : (
    <video src={`${src}#t=0.1`} muted playsInline preload="metadata" />
  );
}

/**
 * Ряд снимков, которые открываются здесь же, во весь экран. Прежде тап вёл
 * на голый адрес хранилища в новой вкладке: человек уходил из приложения и
 * назад попадал не всегда. Классы ряда и миниатюр - от места, где он стоит.
 */
export function Gallery({ urls, listClass, itemClass }: { urls: string[]; listClass: string; itemClass: string }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <>
      <div className={listClass}>
        {urls.map((url, at) => (
          <button
            type="button"
            className={`${itemClass} gallery-thumb`}
            key={url}
            aria-label={`Open photo ${at + 1}`}
            onClick={() => setOpen(at)}
          >
            <Media src={url} />
          </button>
        ))}
      </div>
      {open !== null && <Viewer urls={urls} start={open} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Снимок во весь экран: тап, крестик или Escape - закрыть; свайп и стрелки - соседний. */
function Viewer({ urls, start, onClose }: { urls: string[]; start: number; onClose: () => void }) {
  const [at, setAt] = useState(start);
  const many = urls.length > 1;
  const step = (by: number) => setAt((was) => stepIndex(was, by, urls.length));
  // Свайп кончается тем же отпусканием, что и тап, - его клик не закрывает.
  const from = useRef<number | null>(null);
  const swiped = useRef(false);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (many && event.key === "ArrowRight") setAt((was) => stepIndex(was, 1, urls.length));
      if (many && event.key === "ArrowLeft") setAt((was) => stepIndex(was, -1, urls.length));
    };
    window.addEventListener("keydown", key);
    // Страница под снимком не прокручивается, пока он открыт.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
    };
  }, [many, urls.length, onClose]);

  const arrow = (by: number, label: string, text: string) => (
    <button
      type="button"
      className={by > 0 ? "viewer-arrow next" : "viewer-arrow prev"}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        step(by);
      }}
    >
      {text}
    </button>
  );

  return createPortal(
    <div
      className="viewer"
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      onPointerDown={(event) => {
        from.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (from.current === null || !many) return;
        const by = swipeStep(event.clientX - from.current);
        from.current = null;
        if (by === 0) return;
        swiped.current = true;
        step(by);
      }}
      onClick={() => {
        if (swiped.current) {
          swiped.current = false;
          return;
        }
        onClose();
      }}
    >
      {isVideo(urls[at]) ? (
        // Тап по плееру - перемотка и пауза, а не закрыть просмотр.
        <video
          key={urls[at]}
          src={urls[at]}
          controls
          autoPlay
          playsInline
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
        />
      ) : (
        <img src={urls[at]} alt={`Photo ${at + 1} of ${urls.length}`} draggable={false} />
      )}
      <button type="button" className="viewer-close" aria-label="Close" onClick={onClose}>
        &times;
      </button>
      {many && (
        <>
          {arrow(-1, "Previous photo", "←")}
          {arrow(1, "Next photo", "→")}
          <span className="viewer-count">
            {at + 1} / {urls.length}
          </span>
        </>
      )}
    </div>,
    document.body,
  );
}
