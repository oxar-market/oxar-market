"use client";

import type { Rect } from "@/lib/seller";

/** Шапка шага: «Back» слева, заголовок по центру, счётчик шагов справа. */
export function Bar({
  title,
  onBack,
  step,
}: {
  title: string;
  onBack?: () => void;
  step?: string;
}) {
  return (
    <div className="sl-bar">
      {onBack ? (
        <button type="button" onClick={onBack}>
          Back
        </button>
      ) : (
        <span />
      )}
      <h1>{title}</h1>
      <span>{step ?? ""}</span>
    </div>
  );
}

/** Место на снимке: розовая заливка, красные уголки, номер в углу. */
export function SpotMark({
  rect,
  number,
  art,
}: {
  rect: Rect;
  number: number;
  art?: string;
}) {
  return (
    <span
      className="sl-spot"
      style={{
        left: `${rect.x * 100}%`,
        top: `${rect.y * 100}%`,
        width: `${rect.w * 100}%`,
        height: `${rect.h * 100}%`,
      }}
    >
      <i />
      <i />
      <i />
      <i />
      {art && <img src={art} alt="" />}
      <b>{number}</b>
    </span>
  );
}

/** Обложка строки: снимок, а пока его нет - штриховка. */
export function Thumb({ src, holo }: { src?: string | null; holo?: boolean }) {
  if (holo) return <span className="sl-thumb holo" />;
  return src ? <img className="sl-thumb" src={src} alt="" /> : <span className="sl-thumb" />;
}

/** Адрес покороче: края, по которым кошелёк узнают. */
export function shortWallet(at: string): string {
  return `${at.slice(0, 4)}..${at.slice(-4)}`;
}

/** Деньги в центах - как на борде, всегда с копейками. */
export function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** День коротко: «Oct 14». */
export function shortDay(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Часы до срока: «04:09:54», больше суток - «2d 04:09:54». */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = `${pad(Math.floor((s % 86_400) / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return d > 0 ? `${d}d ${time}` : time;
}
