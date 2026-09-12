// Страница-заглушка: все запросы к этому домену уезжают редиректом на oxar.app,
// сюда посетитель попадает только если редирект не сработал.
export default function Moved() {
  return (
    <main className="page">
      <h1>OXAR moved</h1>
      <p>
        The marketplace now lives inside the desktop at{" "}
        <a href="https://oxar.app">oxar.app</a>.
      </p>
    </main>
  );
}
