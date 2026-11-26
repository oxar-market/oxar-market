"use client";

import { useEffect, useState } from "react";
import { APP_URL, FOLLOW, NEXT } from "./data.ts";
import { avatar, readMe, type Me } from "./me.ts";

/**
 * Шапка - общая для всех страниц. На телефоне вместо ссылок - меню за
 * бургером, как у frontiertraders.com: рядом с бургером плашка ближайшего
 * торга и вход, а в меню ссылки группами под мелкими заголовками. Входа в
 * меню нет: он и так в шапке, а «открыть приложение» вёл бы туда же.
 */
/** Вход - вкладка You в приложении: там Privy и предлагает войти. */
const LOGIN = `${APP_URL}?tab=you`;

/**
 * Вход в шапке: вошёл - его аватар, ведёт в профиль; нет - «Log in». Страницы
 * приложения знают это от Privy и подставляют сами, на лендинге Privy нет, и
 * шапка читает подсказку, оставленную приложением после входа.
 */
export type Account = { label: string; href?: string; onClick?: () => void; me?: Me | null };

export function Top({ account }: { account?: Account }) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<Me | null>(null);
  useEffect(() => setHint(readMe()), []);
  const shown: Account = account ?? (hint ? { label: "Profile", href: "/app", me: hint } : { label: "Log in", href: LOGIN });

  // Пока меню открыто, страница под ним не крутится, а Escape его закрывает.
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <header className={open ? "v2-top open" : "v2-top"}>
      <a className="v2-mark" href="/">
        <img className="v2-mark-logo" src="/site/oxar-mark.webp" alt="" />
        OXAR
      </a>
      <nav className="v2-nav">
        <a href="/auctions">Auctions</a>
        <a href="/how-it-works">How it works</a>
        <a href="/sell">Sell a spot</a>
      </nav>
      <div className="v2-side">
        <a className="v2-pill" href="/auctions">
          <span className="v2-dot" />
          {/* «Next: Dec» и «Dec auction» не читались. Называем, что это:
              следующий торг; месяц - где для него есть место. */}
          <span className="v2-wide-only">Next auction: {NEXT ? NEXT.when : "soon"}</span>
          <span className="v2-narrow-only">Next auction</span>
        </a>
        <a className="v2-btn dark v2-wide-only" href="/sell">
          Sell a spot
        </a>
        {shown.me ? (
          <a className="v2-me" href={shown.href ?? "/app"} aria-label="Your profile" style={shown.me.img ? undefined : avatar(shown.me.seed)}>
            {shown.me.img ? <img src={shown.me.img} alt="" /> : shown.me.letter}
          </a>
        ) : shown.href ? (
          <a className="v2-btn light v2-account" href={shown.href}>
            {shown.label}
          </a>
        ) : (
          <button type="button" className="v2-btn light v2-account" onClick={shown.onClick}>
            {shown.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className="v2-burger"
        aria-expanded={open}
        aria-controls="v2-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
      >
        <span />
        <span />
      </button>
      {open && (
        <nav className="v2-menu" id="v2-menu" onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(false)}>
          <div className="v2-menu-group">
            <p>OXAR</p>
            <a href="/auctions">All auctions</a>
            <a href="/how-it-works">How it works</a>
            <a href="/sell">Sell a spot</a>
            <a href="/app">Profile</a>
          </div>
          <div className="v2-menu-group">
            <p>Help</p>
            <a href="mailto:support@oxar.app">Support</a>
            <a href="/terms">Terms of Service</a>
          </div>
          <a className="v2-menu-x" href={FOLLOW}>
            <XIcon />
            @oxar_app
          </a>
        </nav>
      )}
    </header>
  );
}

export function Foot() {
  return (
    <footer className="v2-foot">
      <a className="v2-mark small" href="/">
        <img className="v2-mark-logo" src="/site/oxar-mark.webp" alt="" />
        OXAR
      </a>
      <span>Ad space on physical things</span>
      <a className="v2-x" href={FOLLOW} aria-label="OXAR on X">
        <XIcon />
      </a>
    </footer>
  );
}

/** Знак X - в подвале и в меню. */
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
