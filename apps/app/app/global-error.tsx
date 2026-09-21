"use client";

/**
 * Тот же перехват, но для падения в самом корне - в layout или во входе Privy,
 * выше обычного error.tsx. Он заменяет весь документ, поэтому несёт свои
 * <html> и <body>: показать ему нечего снаружи, всё уже рухнуло.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
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
