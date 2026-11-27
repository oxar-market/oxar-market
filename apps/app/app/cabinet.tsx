"use client";

import "./cabinet.css";

import { useState } from "react";

/**
 * Части кабинета: копирование адреса. Сам кабинет - в you.tsx.
 */

/** Скопировать полный адрес: на секунду значок меняется на галочку. */
export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={done ? "ym-copy done" : "ym-copy"}
      aria-label={done ? "Address copied" : "Copy address"}
      title={done ? "Copied" : "Copy address"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        {done ? (
          <path d="M5 12.5 10 17l9-10" />
        ) : (
          <>
            <rect x="8" y="8" width="12" height="12" rx="2.5" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </>
        )}
      </svg>
    </button>
  );
}
