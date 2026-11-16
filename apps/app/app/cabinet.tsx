"use client";

import "./cabinet.css";

import { useState } from "react";
import { formatUsd, shortWallet, spotName, type Bidder, type ThingReach } from "@oxar/core";
import type { MyStand } from "@/lib/auction";
import { faceUrl, type Face } from "@/lib/profile";
import type { Auction } from "./_site/data.ts";
import { avatar } from "./_site/me.ts";

/**
 * Части кабинета: копирование адреса, венок первых трёх мест, торг
 * коробочкой и строка рейтинга. Сам кабинет - в you.tsx.
 */

/** Скопировать полный адрес: на секунду значок меняется на галочку. */
export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={done ? "ym-copy done" : "ym-copy"}
      aria-label={done ? "Address copied" : "Copy address"}
      title={done ? "Copied" : "Copy address"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden>
        {done ? (
          <path d="M5 12.5 10 17l9-10" />
        ) : (
          <>
            <rect x="8" y="8" width="12" height="12" rx="2.5" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </>
        )}
      </svg>
    </button>
  );
}

/** Венок своего металла у мест 1-3. */
export function Laurel({ place }: { place: number }) {
  const tone = place === 1 ? "gold" : place === 2 ? "silver" : "bronze";
  const cx = 40;
  const cy = 34;
  const r = 24;
  const branch = (side: 1 | -1) => {
    const leaves = [];
    for (let at = 0; at < 8; at++) {
      // Угол на окружности: от низа (100°) к верху (232°) - левая ветвь.
      const a = ((100 + at * 17) * Math.PI) / 180;
      const out = at % 2 === 0 ? 1 : -1;
      const x = cx + Math.cos(a) * (r + out * 3.2);
      const y = cy + Math.sin(a) * (r + out * 3.2);
      const tilt = (a * 180) / Math.PI + 90 + out * 32;
      const size = 1 - at * 0.045;
      leaves.push(
        <g key={at} transform={`translate(${x} ${y}) rotate(${tilt}) scale(${size})`}>
          <path d="M0 -6.5 Q3.4 0 0 6.5 Q-3.4 0 0 -6.5 Z" fill={`url(#ym-${tone})`} />
          <path d="M0 -5 L0 5" stroke="rgba(0,0,0,0.18)" strokeWidth="0.5" />
        </g>,
      );
    }
    const start = (100 * Math.PI) / 180;
    const end = (235 * Math.PI) / 180;
    const stem = `M${cx + Math.cos(start) * r} ${cy + Math.sin(start) * r} A${r} ${r} 0 0 1 ${cx + Math.cos(end) * r} ${cy + Math.sin(end) * r}`;
    return (
      <g transform={side === -1 ? `translate(${cx * 2} 0) scale(-1 1)` : undefined}>
        <path d={stem} fill="none" stroke={`url(#ym-${tone})`} strokeWidth="1.2" strokeLinecap="round" />
        {leaves}
      </g>
    );
  };
  return (
    <svg className="ym-laurel" viewBox="0 0 80 68" aria-hidden>
      <defs>
        <linearGradient id="ym-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f8e58c" />
          <stop offset="0.5" stopColor="#d9a520" />
          <stop offset="1" stopColor="#a5740c" />
        </linearGradient>
        <linearGradient id="ym-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6f7f8" />
          <stop offset="0.5" stopColor="#bfc2c7" />
          <stop offset="1" stopColor="#82858b" />
        </linearGradient>
        <linearGradient id="ym-bronze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3c294" />
          <stop offset="0.5" stopColor="#b97842" />
          <stop offset="1" stopColor="#7d4a22" />
        </linearGradient>
      </defs>
      {branch(1)}
      {branch(-1)}
      {/* Лента внизу, где ветви сходятся. */}
      <path d={`M${cx - 5} ${cy + r + 2} L${cx} ${cy + r - 1} L${cx + 5} ${cy + r + 2}`} fill="none" stroke={`url(#ym-${tone})`} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Торг коробочкой: метка, вещь, имя, что с ним у человека, полоса проданных
 * мест и кнопка. Перебили на идущем торге - кнопка ведёт поднять ставку
 * сразу на том месте.
 */
export function Box({
  one,
  view,
  places,
  stands,
  reach,
  onRaise,
}: {
  one: Auction;
  view: string | undefined;
  /** Сколько мест на вещи - со сцены; пока она не снята, полоса пустая. */
  places: number | null;
  /** Ставки человека на этой вещи. */
  stands: MyStand[];
  /** Охват постов о торге - у выигранного места его видно в строке. */
  reach?: ThingReach;
  onRaise: (stand: MyStand) => void;
}) {
  const sold = Object.keys(one.won).length;
  const total = places ?? 0;
  const outbid = stands.find((stand) => stand.open && !stand.leading);
  const leading = stands.filter((stand) => stand.open && stand.leading).length;
  const won = stands.filter((stand) => stand.won).length;
  const photo = one.slug === "the-van" ? "/site/van-card.jpg" : view;
  const status = outbid
    ? { text: `Outbid on ${spotName(outbid.spot)}`, tone: "bad" }
    : leading
      ? { text: leading === 1 ? "You lead on 1 spot" : `You lead on ${leading} spots`, tone: "good" }
      : won
        ? {
            text: [won === 1 ? "Your logo is on it" : `Your logo is on it · ${won} spots`, reach?.reach ? `${reach.checked ? "" : "~"}${people(reach.reach)} reach` : ""]
              .filter(Boolean)
              .join(" · "),
            tone: "good",
          }
        : stands.length
          ? { text: "You bid, someone else won", tone: "" }
          : { text: "You didn't bid", tone: "" };
  return (
    <div className="ym-box">
      <span className={one.status === "live" ? "ym-pill live" : "ym-pill"}>{one.status === "live" ? "Live" : "Ended"}</span>
      <div className={one.slug === "the-van" ? "ym-box-art ym-photo" : "ym-box-art"}>{photo && <img src={photo} alt="" />}</div>
      <h3>{one.title}</h3>
      <p className="ym-meta">
        {one.owner} · {new Date(one.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
      </p>
      <p className={`ym-you ${status.tone}`}>{status.text}</p>
      <div className="ym-bar">
        <span style={{ width: `${total ? (sold / total) * 100 : 0}%` }} />
      </div>
      <p className="ym-small">
        {total ? `${sold} of ${total}` : sold} {(total || sold) === 1 ? "spot" : "spots"} sold · {formatUsd(one.raisedCents)} raised
      </p>
      {outbid ? (
        <button type="button" className="ym-btn red" onClick={() => onRaise(outbid)}>
          Raise your bid
        </button>
      ) : (
        <a className="ym-btn" href={`/app?thing=${one.id}`}>
          View auction
        </a>
      )}
    </div>
  );
}

/** Строка рейтинга: место, кошелёк с брендами, места и сколько заплатил. */
export function BoardRow({ one, at, me, pinned, face }: { one: Bidder; at: number; me?: boolean; pinned?: boolean; face?: Face }) {
  return (
    <div className={pinned ? "ym-row pinned" : me ? "ym-row me" : "ym-row"}>
      <i className={at <= 3 ? "ym-place" : undefined}>
        {at <= 3 && <Laurel place={at} />}
        {at}
      </i>
      <span className="ym-who-cell">
        <Ava wallet={one.wallet} face={face} />
        <span>
          <b>
            {face?.display_name ?? shortWallet(one.wallet)}
            {(me || pinned) && <em>You</em>}
          </b>
          <span className="ym-brands">{under(one, face)}</span>
        </span>
      </span>
      <span className="ym-num">{one.spots}</span>
      <b className="ym-num">{formatUsd(one.paidCents)}</b>
    </div>
  );
}

/**
 * Первые три места - пьедесталом над таблицей: второе, первое, третье, первое
 * выше. Венок своего металла, кошелёк, бренды и сколько заплатил.
 */
export function Podium({ top, me, faces }: { top: Bidder[]; me: Bidder | null; faces: Record<string, Face> }) {
  const order = [1, 0, 2].filter((at) => top[at]);
  return (
    <div className="ym-podium">
      {order.map((at) => {
        const one = top[at]!;
        return (
          <div key={one.wallet} className={`ym-step p${at + 1}${one === me ? " me" : ""}`}>
            <span className="ym-step-place">
              <Laurel place={at + 1} />
              <b>{at + 1}</b>
            </span>
            <Ava wallet={one.wallet} face={faces[one.wallet]} big />
            <b className="ym-step-who">
              {faces[one.wallet]?.display_name ?? shortWallet(one.wallet)}
              {one === me && <em>You</em>}
            </b>
            <span className="ym-brands">{under(one, faces[one.wallet])}</span>
            <b className="ym-step-paid">{formatUsd(one.paidCents)}</b>
            <span className="ym-brands">
              {one.spots} {one.spots === 1 ? "spot" : "spots"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Аватар кошелька: своя картинка из профиля или цвет из адреса. */
function Ava({ wallet, face, big }: { wallet: string; face?: Face; big?: boolean }) {
  const picture = faceUrl(face?.avatar_path ?? null);
  return (
    <span className={big ? "ym-ava big" : "ym-ava"} style={picture ? undefined : avatar(wallet)}>
      {picture && <img src={picture} alt="" />}
    </span>
  );
}

/** Охват коротко: 50K. */
function people(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

/**
 * Строка под именем. Своё имя всегда идёт с коротким кошельком: имя выбирает
 * человек, а кошелёк - нет, по нему и видно, кто это на самом деле.
 */
function under(one: Bidder, face?: Face): string {
  const brand = face?.brand ?? (one.brands.join(", ") || "No name");
  return face?.display_name ? `${shortWallet(one.wallet)} · ${brand}` : brand;
}

