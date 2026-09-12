"use client";

import { useRef, useState } from "react";
import { MAX_BYTES } from "@/lib/upload";

// Поле для креатива: файл можно бросить в область или выбрать в диалоге.
// Нажатие на всю область открывает диалог - маленькая кнопка "выбрать файл"
// заставляет целиться, а бросить файл на телефоне нельзя вообще.

export function CreativeDrop({
  file,
  uploading,
  onPick,
  onClear,
}: {
  file: { name: string; url: string } | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  if (file) {
    return (
      <div className="attached">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {file.url.match(/\.(png|jpe?g|webp|gif)$/i) ? (
          <img src={file.url} alt="" className="attached-preview" />
        ) : (
          <span className="attached-preview file" aria-hidden />
        )}
        <span className="attached-name">{file.name}</span>
        <button
          type="button"
          className="attached-remove"
          onClick={onClear}
          aria-label="Remove file"
        >
          ×
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={over ? "drop over" : "drop"}
      onClick={() => input.current?.click()}
      onDragOver={(event) => {
        // Без этого браузер откроет файл вместо того, чтобы отдать его нам.
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const dropped = event.dataTransfer.files[0];
        if (dropped) onPick(dropped);
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime"
        onChange={(event) => {
          const picked = event.target.files?.[0];
          // Сбрасываем значение: иначе выбор того же файла второй раз молчит.
          event.target.value = "";
          if (picked) onPick(picked);
        }}
      />

      <span className="drop-mark" aria-hidden>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
          <path
            d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 15v2.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V15"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </span>

      <span className="drop-text">
        {uploading ? "Uploading…" : "Choose a file or drop it here"}
      </span>
      <span className="drop-hint">
        image or mp4, up to {Math.round(MAX_BYTES / 1024 / 1024)} MB
      </span>
    </button>
  );
}
