"use client";

import { useEffect, useRef, useState } from "react";
import "./header.css";
import { avatar, readMe, type Me } from "./me.ts";
import { mono } from "./mono.ts";

/**
 * Шапка всего сайта - два пункта: How it works и кошелёк.
 *
 * Не вошёл - [ Connect wallet ]. Вошёл - кошелёк, по нажатию меню: баланс,
 * Profile, List a spot, Admin (только админам), Copy address, Disconnect. List a spot живёт в меню, а
 * не в шапке: без кошелька выставить вещь всё равно нельзя, а на телефоне
 * третий пункт в строку уже не помещался.
 *
 * Страницы приложения знают человека от Privy и передают account. На
 * страницах витрины Privy нет: там шапка читает подсказку, которую оставило
 * приложение после входа, а вход и выход ведут в приложение.
 */
export type Account = {
  me: Me | null;
  /** Вход: на страницах приложения - окно Privy, иначе - переход в приложение. */
  onConnect?: () => void;
  /** Выход: на страницах приложения - Privy, иначе - переход в приложение с ?signout. */
  onDisconnect?: () => void;
};

const CONNECT = "/app?tab=you";
const SIGNOUT = "/app?signout=1";

export function Header({ account, className = "" }: { account?: Account; className?: string }) {
  const [hint, setHint] = useState<Me | null>(null);
  useEffect(() => setHint(readMe()), []);
  const me = account ? account.me : hint;

  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  // Баланс читаем, только когда меню открыли: шапка стоит на каждой странице,
  // и спрашивать ноду на каждом заходе незачем.
  const [usdc, setUsdc] = useState<number | null | "failed">(null);
  useEffect(() => {
    if (!open || !me?.wallet || usdc !== null) return;
    void usdcBalance(me.wallet).then(setUsdc);
  }, [open, me?.wallet, usdc]);

  const [copied, setCopied] = useState(false);

  return (
    <header className={`home-top site-top ${mono.className} ${className}`}>
      <a className="home-mark" href="/">
        <img src="/site/oxar-mark.webp" alt="" data-mark />
        OXAR
      </a>
      <nav>
        <a href="/how-it-works">
          <span className="site-long">How it works</span>
          <span className="site-short">How</span>
        </a>
        {me ? (
          <div className="site-wallet" ref={box}>
            <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
              <span className="site-ava" style={me.img ? undefined : avatar(me.seed)}>
                {me.img && <img src={me.img} alt="" />}
              </span>
              {me.wallet ? short(me.wallet) : "Profile"}
            </button>
            {open && (
              <div className="site-menu" role="menu">
                {me.wallet && (
                  <div className="site-balance">
                    <span>Balance</span>
                    <b>{usdc === null ? "-" : usdc === "failed" ? "Could not read" : `${money(usdc)} USDC`}</b>
                  </div>
                )}
                <a role="menuitem" href="/app">
                  Profile <span>&rarr;</span>
                </a>
                <a role="menuitem" href="/sell">
                  List a spot <span>&rarr;</span>
                </a>
                {me.admin && (
                  <a role="menuitem" href="/admin">
                    Admin <span>&rarr;</span>
                  </a>
                )}
                {me.wallet && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      void navigator.clipboard?.writeText(me.wallet!).then(() => setCopied(true));
                      window.setTimeout(() => setCopied(false), 1200);
                    }}
                  >
                    {copied ? "Copied" : "Copy address"}
                  </button>
                )}
                <i className="site-sep" />
                {account?.onDisconnect ? (
                  <button type="button" role="menuitem" onClick={account.onDisconnect}>
                    Disconnect
                  </button>
                ) : (
                  <a role="menuitem" href={SIGNOUT}>
                    Disconnect
                  </a>
                )}
              </div>
            )}
          </div>
        ) : account?.onConnect ? (
          <button type="button" className="site-connect" onClick={account.onConnect}>
            [ <span className="site-long">Connect wallet</span>
            <span className="site-short">Connect</span> ]
          </button>
        ) : (
          <a className="site-connect" href={CONNECT}>
            [ <span className="site-long">Connect wallet</span>
            <span className="site-short">Connect</span> ]
          </a>
        )}
      </nav>
    </header>
  );
}

/** «AkC8...3fQ»: начало и конец адреса, как его узнают люди. */
function short(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-3)}`;
}

function money(usd: number): string {
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
/** Нода - та же, что у приложения; без своей - публичная нода сети. */
const RPC =
  process.env.NEXT_PUBLIC_SOLANA_RPC ||
  (process.env.NEXT_PUBLIC_SOLANA_CLUSTER === "mainnet-beta" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com");

/**
 * USDC на кошельке - прямым запросом к ноде, без web3.js: шапка стоит и на
 * витрине, тащить туда библиотеку ради одной цифры незачем. Монета - та же,
 * что у последнего торга, как в кабинете.
 */
async function usdcBalance(owner: string): Promise<number | "failed"> {
  try {
    if (!SUPABASE || !ANON) return "failed";
    const lots = await fetch(`${SUPABASE}/rest/v1/lots?select=mint&mint=not.is.null&order=closes_at.desc&limit=1`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    const mint = lots.ok ? ((await lots.json()) as { mint: string }[])[0]?.mint : undefined;
    if (!mint) return "failed";
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTokenAccountsByOwner",
        params: [owner, { mint }, { encoding: "jsonParsed" }],
      }),
    });
    const body = (await response.json()) as {
      result?: { value: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }[] };
    };
    if (!body.result) return "failed";
    return body.result.value.reduce((sum, one) => sum + (one.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
  } catch {
    return "failed";
  }
}
