/**
 * Лендинг на oxar.app. Пока заглушка: имя, одна строка о продукте и дверь в
 * само приложение.
 *
 * Серверного кода и состояния здесь нет намеренно - это обычная страница,
 * поэтому и "use client" не нужен.
 */

/** Само приложение живёт на своём домене и деплоится отдельным проектом. */
const APP_URL = "https://app.oxar.app";

export default function Home() {
  return (
    <main>
      <h1>OXAR</h1>
      <p className="lead">Auctions for ad spots on things people carry.</p>
      <p className="soon">Coming soon.</p>
      <a className="launch" href={APP_URL}>
        Launch app
      </a>
    </main>
  );
}
