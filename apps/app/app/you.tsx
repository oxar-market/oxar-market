"use client";

import { usePrivy } from "@privy-io/react-auth";
import { avatarLetter, avatarTone } from "@oxar/core";
import { BUILD } from "@/lib/build";

/**
 * Страница человека. Показывает только то, что знает наверняка: кто вошёл и чем
 * он может быть на площадке.
 *
 * Ролей две, и они независимы: один и тот же человек бывает и покупателем, и
 * продавцом. Покупателем становится каждый вошедший - ставить может кто угодно.
 * Продавцом только после разговора, и выдаём роль мы: в базе до этой колонки из
 * браузера не дотянуться вовсе.
 *
 * Роли нарисованы карточками, а не строчками списка, и это не украшение. Из
 * списка «Seller: not yet» читается как отказ, а из карточки с открытой дверью
 * - как следующий шаг. Разница в том, напишет человек нам или закроет вкладку.
 */

/** Куда зовёт разговор. Тот же адрес, что был в прошлой версии продукта. */
const CALL_URL = "https://calendly.com/daniel-l-oxar";

export function You() {
  const { user, logout } = usePrivy();
  const wallet = user?.wallet?.address;
  const email = user?.email?.address;

  // Кружок тот же, что у участников торга в ленте ставок: цвет выводится из
  // строки и всегда один и тот же. Войти можно и письмом, и кошельком, поэтому
  // берём то, что есть, - но в одном порядке, иначе человек, у которого есть
  // и то и другое, менял бы цвет от способа входа.
  const who = email ?? wallet ?? "";

  return (
    <section className="screen">
      <h1>You</h1>

      <div className="you-card">
        <span
          className="you-face"
          style={{ background: avatarTone(who) }}
          aria-hidden
        >
          {avatarLetter(who)}
        </span>

        <div className="you-id">
          {/* Почта крупнее адреса: её человек узнаёт, а сорок четыре знака
              base58 - нет. Если входили кошельком, почты не будет вовсе, и
              тогда адрес занимает её место. */}
          {email ? <p className="you-mail">{email}</p> : null}
          {wallet ? (
            <p className={email ? "you-wallet" : "you-mail mono"}>{wallet}</p>
          ) : null}
        </div>
      </div>

      <div className="roles">
        <div className="role">
          <div className="role-top">
            <span className="role-name">Buyer</span>
            <span className="role-state on">Active</span>
          </div>
          <p className="role-note">
            Anyone signed in can bid. The money leaves your wallet with the bid
            and comes back if someone outbids you.
          </p>
        </div>

        <div className="role">
          <div className="role-top">
            <span className="role-name">Seller</span>
            <span className="role-state">Not yet</span>
          </div>
          <p className="role-note">
            Selling spots on your own thing is not open yet. The first
            auctions are run by us; if you want yours to be next, book a call.
          </p>
          <a className="ghost" href={CALL_URL} target="_blank" rel="noreferrer">
            Book a call
          </a>
        </div>
      </div>

      <button type="button" className="quiet" onClick={logout}>
        Sign out
      </button>

      {/* Версия сборки: тихая подпись внизу, для нас, а не для человека. По ней
          на глаз видно, та ли версия открыта. */}
      <p className="build">build {BUILD}</p>
    </section>
  );
}
