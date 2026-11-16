"use client";

/**
 * Что показать, когда рендер упал.
 *
 * Без этого Next отдаёт свой белый экран «Application error», по которому не
 * понять ни что сломалось, ни что делать. На запуске это дорого: первый же
 * сбой у первого же человека выглядит как «приложение не работает» вообще.
 *
 * Поэтому здесь текст ошибки виден прямо на экране - его можно прочесть и
 * прислать, не открывая консоль, которой на телефоне и нет. `digest` - метка,
 * по которой ту же ошибку видно в логах.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="crash">
      <h1>Something broke</h1>
      <p className="crash-msg">{error.message || "Unknown error"}</p>
      {error.digest && <p className="crash-digest">ref {error.digest}</p>}
      <button type="button" className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
