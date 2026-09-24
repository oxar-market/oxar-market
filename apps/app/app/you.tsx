"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PublicKey } from "@solana/web3.js";
import { avatarLetter, avatarTone } from "@oxar/core";
import { BUILD } from "@/lib/build";
import { connection, walletUnits } from "@/lib/chain";
import { db } from "@/lib/session";

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

  // Балансы кошелька из цепочки: USDC - чем ставят, SOL - чем платят комиссию
  // сети. null - ещё не прочитали; строку не показываем, а не врём нулём.
  // Монета торга берётся из открытого лота, как в форме ставки: своя константа
  // однажды разошлась бы с программой.
  const [usdc, setUsdc] = useState<number | null>(null);
  const [sol, setSol] = useState<number | null>(null);
  useEffect(() => {
    if (!wallet || !db) return;
    let live = true;
    (async () => {
      const owner = new PublicKey(wallet);
      const lamports = await connection.getBalance(owner);
      if (live) setSol(lamports / 1e9);
      const { data } = await db!
        .from("lots")
        .select("mint")
        .eq("status", "open")
        .not("mint", "is", null)
        .limit(1);
      const mint = data?.[0]?.mint;
      if (!mint) return;
      const units = await walletUnits(new PublicKey(mint), owner);
      if (live) setUsdc(Number(units / 10_000n) / 100);
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [wallet]);

  // «Скопировано» живёт две секунды: постоянная надпись врала бы, а без неё
  // непонятно, сработала ли кнопка.
  const [copied, setCopied] = useState(false);
  function copyAddress() {
    if (!wallet) return;
    void navigator.clipboard.writeText(wallet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

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
        {/* Кошелёк и пополнение. Живой случай первого дня: человек отправил
            USDT вместо USDC и увидел «баланс ноль» - поэтому монета и сеть
            названы прямо, а не подразумеваются. */}
        {wallet && (
          <div className="role">
            <div className="role-top">
              <span className="role-name">Wallet</span>
              {usdc !== null && sol !== null && (
                <span className="role-state">
                  ${usdc.toFixed(2)} USDC · {sol.toFixed(3)} SOL
                </span>
              )}
            </div>
            <p className="role-note">
              To bid, this wallet needs USDC and a little SOL for network fees.
              Send both on the Solana network to the address below. USDC only -
              USDT or other coins will not work here.
            </p>
            <p className="you-addr mono">{wallet}</p>
            <button type="button" className="ghost" onClick={copyAddress}>
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
        )}

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
