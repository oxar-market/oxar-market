"use client";

import { usePrivy } from "@privy-io/react-auth";
import { BUILD } from "@/lib/build";

/**
 * Страница человека. Пока показывает только то, что знает наверняка: кто вошёл
 * и чем он может быть на площадке.
 *
 * Ролей две, и они независимы: один и тот же человек бывает и покупателем, и
 * продавцом. Покупателем становится каждый вошедший - ставить может кто угодно.
 * Продавцом только после разговора, и выдаём роль мы: в базе до этой колонки из
 * браузера не дотянуться вовсе.
 */

/** Куда зовёт разговор. Тот же адрес, что был в прошлой версии продукта. */
const CALL_URL = "https://calendly.com/daniel-l-oxar";

export function You() {
  const { user, logout } = usePrivy();
  const wallet = user?.wallet?.address;
  const email = user?.email?.address;

  return (
    <section className="screen">
      <h1>You</h1>

      <dl className="facts">
        <dt>Signed in as</dt>
        <dd className="mono">{email ?? wallet ?? "unknown"}</dd>
        {wallet && email && (
          <>
            <dt>Wallet</dt>
            <dd className="mono">{wallet}</dd>
          </>
        )}
        <dt>Buyer</dt>
        <dd>Yes. Anyone signed in can bid.</dd>
        <dt>Seller</dt>
        <dd>Not yet. It takes a call with us.</dd>
      </dl>

      <a className="ghost" href={CALL_URL} target="_blank" rel="noreferrer">
        Book a call to sell
      </a>

      <button type="button" className="quiet" onClick={logout}>
        Sign out
      </button>

      {/* Версия сборки: тихая подпись внизу, для нас, а не для человека. По ней
          на глаз видно, та ли версия открыта. */}
      <p className="build">build {BUILD}</p>
    </section>
  );
}
