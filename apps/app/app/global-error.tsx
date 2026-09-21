"use client";

import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

/**
 * Тот же перехват, но для падения в самом корне - в layout или во входе Privy,
 * выше обычного error.tsx. Он заменяет весь документ, поэтому несёт своё
 * <html>, свой шрифт и свои стили: layout сюда не оборачивает, и без этого
 * экран выходит голым системным шрифтом, не нашим.
 */
const oxar = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-oxar",
  display: "swap",
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className={oxar.variable}>
      <body>
        <main className="crash">
          <h1>Something broke</h1>
          <p className="crash-msg">{error.message || "Unknown error"}</p>
          {error.digest && <p className="crash-digest">ref {error.digest}</p>}
          <button type="button" className="primary" onClick={reset}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
