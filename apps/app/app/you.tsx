"use client";

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { PublicKey } from "@solana/web3.js";
import { avatarLetter, formatUsd } from "@oxar/core";
import { BUILD } from "@/lib/build";
import { connection, walletUnits } from "@/lib/chain";
import { loadMyStands, type MyStand } from "@/lib/auction";
import { db } from "@/lib/session";

/**
 * Страница человека, собранная по дизайн-борду «OXAR Auction design
 * directions»: кошелёк сразу под личностью, баланс - герой экрана, ставки
 * с красной карточкой «перебили», роли одним переключателем.
 *
 * Кошелёк нарочно не называется «кошельком OXAR»: он принадлежит человеку -
 * либо создан Privy при входе почтой, либо это его собственный Phantom.
 * Путаница здесь стоила бы доверия, поэтому подпись говорит это прямо.
 */

/** Куда зовёт разговор. Тот же адрес, что был в прошлой версии продукта. */
const CALL_URL = "https://calendly.com/daniel-l-oxar";

export function You({ onOpenAuction }: { onOpenAuction: () => void }) {
  const { user, logout } = usePrivy();
  const wallet = user?.wallet?.address;
  const email = user?.email?.address;
  // Privy помечает свой встроенный кошелёк; всё прочее - внешний, и его
  // хозяину не нужны наши объяснения про пополнение.
  const embedded = user?.wallet?.walletClientType === "privy";

  // Балансы из цепочки: USDC - чем ставят, SOL - чем платят комиссию сети.
  // null - ещё не прочитали; показываем прочерк, а не врём нулём.
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

  // Мои ставки: живые наверху экрана, закрытые - историей внизу.
  const [stands, setStands] = useState<MyStand[]>([]);
  useEffect(() => {
    if (!wallet) return;
    let live = true;
    void loadMyStands(wallet).then((rows) => live && setStands(rows));
    return () => {
      live = false;
    };
  }, [wallet]);

  // Часы для «closes in»: перебитая ставка - вопрос времени, и оно тикает.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const [copied, setCopied] = useState(false);
  function copyAddress() {
    if (!wallet) return;
    void navigator.clipboard.writeText(wallet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Роли одним переключателем: Seller - не второй режим, а дверь к разговору,
  // и до своего кабинета он живёт одной карточкой с Buyer.
  const [role, setRole] = useState<"buyer" | "seller">("buyer");

  const outbid = stands.filter((one) => one.open && !one.leading);
  const leading = stands.filter((one) => one.open && one.leading);
  const history = stands.filter((one) => !one.open);
  const activeCount = outbid.length + leading.length;

  return (
    <section className="screen">
      <h1>You</h1>

      <div className="you-card">
        <span className="you-face" aria-hidden>
          {avatarLetter(email ?? wallet ?? "?")}
        </span>
        <div className="you-id">
          {email ? <p className="you-mail">{email}</p> : null}
          {wallet && !email ? <p className="you-mail mono">{shorten(wallet)}</p> : null}
          <p className="you-sub">
            {email ? "Signed in with email" : "Signed in with a wallet"}
          </p>
        </div>
      </div>

      {wallet && (
        <div className="wallet-card">
          <div className="wallet-head">
            <div className="wallet-name">
              <span className="wallet-title">Your wallet</span>
              <span className="wallet-cap">
                {embedded
                  ? "Created by Privy when you signed in. Yours, not ours."
                  : "Connected from your own wallet app."}
              </span>
            </div>
          </div>

          <div className="balance">
            <span className="balance-usdc">
              {usdc === null
                ? "-"
                : `$${usdc.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}`}
            </span>
            <span className="balance-unit">USDC</span>
            <span className="balance-sol">
              {sol === null ? "" : `${sol.toFixed(3)} `}
              <span className="balance-unit">SOL</span>
            </span>
          </div>

          <div className="addr-box">
            <span>{wallet}</span>
            <button type="button" className="ghost small" onClick={copyAddress}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {embedded && (
            <div className="funds">
              <span className="funds-head">Add funds</span>
              <p className="role-note">
                Send USDC, plus a little SOL for fees, on the Solana network to
                the address above. Anything sent on another network is lost.
              </p>
            </div>
          )}

          <p className="wallet-cap">
            Transfers are irreversible. <a href="/terms">See terms</a>.
          </p>
        </div>
      )}

      {activeCount > 0 && (
        <div className="bids-head">
          <span className="bids-title">Your bids</span>
          <span className="muted">
            {activeCount} active
          </span>
        </div>
      )}

      {outbid.map((one) => (
        <div className="outbid-card" key={one.lotId}>
          <div className="outbid-top">
            <span className="outbid-badge">OUTBID</span>
            <span className="outbid-when">closes in {left(one.closesAt, now)}</span>
          </div>
          <span className="outbid-title">
            Spot {one.spot} · {one.thing}
          </span>
          <div className="outbid-grid">
            <div>
              <span className="outbid-cap">
                {one.leaderBrand ? `Leader - ${one.leaderBrand}` : "Leader"}
              </span>
              <span className="outbid-num lead">{formatUsd(one.topCents)}</span>
            </div>
            <div>
              <span className="outbid-cap">Your bid</span>
              <span className="outbid-num mine">{formatUsd(one.mineCents)}</span>
            </div>
          </div>
          <button
            type="button"
            className="raise"
            onClick={() => {
              // Торг откроется сразу на этом месте: код едет через
              // sessionStorage, вкладки - состояние экрана, а не адреса.
              window.sessionStorage.setItem("oxar.jump", one.code);
              onOpenAuction();
            }}
          >
            Raise your bid
          </button>
          <span className="outbid-note">
            Your {formatUsd(one.mineCents)} is already back in your wallet.
          </span>
        </div>
      ))}

      {leading.length > 0 && (
        <div className="leading-card">
          {leading.map((one) => (
            <div className="leading-row" key={one.lotId}>
              <div className="leading-what">
                <span>Spot {one.spot}</span>
                <span className="muted small">{one.thing}</span>
              </div>
              <span className="tagchip">LEADING</span>
              <span className="leading-amt">{formatUsd(one.mineCents)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="bids-head">
        <span className="hist-title">History</span>
      </div>
      {history.length === 0 ? (
        // Пустая история - не пустое место: она говорит, когда наполнится.
        // Победы и поражения записываются после закрытия торга, и до первого
        // разбора здесь честно нечего показывать.
        <p className="muted">
          Nothing here yet. Bid on a spot - wins and losses land here after
          the auction closes.
        </p>
      ) : (
        <>
          <div className="hist-list">
            {history.map((one) => (
              <div className="hist-row" key={one.lotId}>
                <span className="hist-date">{day(one.closesAt)}</span>
                <span className="hist-what">
                  Spot {one.spot} · {one.thing}
                </span>
                <span
                  className="tagchip"
                  style={{ color: one.won ? "#16181d" : undefined }}
                >
                  {one.won ? "WON" : "LOST"}
                </span>
                <span className="hist-amt">{formatUsd(one.mineCents)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="role-card">
        <div className="role-toggle">
          {(["buyer", "seller"] as const).map((one) => (
            <button
              key={one}
              type="button"
              className={role === one ? "role-tab on" : "role-tab"}
              onClick={() => setRole(one)}
            >
              {one === "buyer" ? "Buyer" : "Seller"}
            </button>
          ))}
        </div>
        {role === "buyer" ? (
          <p className="role-note">
            Anyone signed in can bid. The money leaves your wallet with the bid
            and comes back if someone outbids you.
          </p>
        ) : (
          <>
            <p className="role-note">
              Want your thing here? The first auctions are run by us - book a
              call.
            </p>
            <a className="primary center" href={CALL_URL} target="_blank" rel="noreferrer">
              Book a call
            </a>
          </>
        )}
      </div>

      <button type="button" className="signout" onClick={logout}>
        Sign out
      </button>

      <p className="you-foot">
        <span className="build">build {BUILD}</span>
        <a href="/terms">terms</a>
      </p>
    </section>
  );
}

/** Адрес в шапке: края, по которым свой кошелёк узнают. */
function shorten(at: string): string {
  return `${at.slice(0, 4)}…${at.slice(-4)}`;
}

/** День для истории: коротко, в часах читателя. */
function day(at: string): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Сколько осталось торгу: часы тикают на глазах у перебитого. */
function left(closesAt: string, now: number): string {
  const ms = Math.max(0, Date.parse(closesAt) - now);
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
