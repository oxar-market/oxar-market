"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { NAME_MAX, BRAND_MAX, HANDLE_MAX, cleanProfile } from "@oxar/core";
import { faceUrl, saveProfile, uploadFace, type Profile } from "@/lib/profile";

/**
 * Окна кабинета: «поделиться охватом» - карточка пропуска картинкой и в X, и
 * «профиль» - имя, аватар, бренд, логотип и X. Кошелёк здесь не меняется: он
 * и есть аккаунт, поэтому показан только для чтения. Почта для писем - в
 * Settings: её подтверждает Privy, а не это окно.
 */

function Modal({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", key);
    return () => {
      document.documentElement.style.overflow = "";
      window.removeEventListener("keydown", key);
    };
  }, [onClose]);
  return (
    <div className="ym-modal-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="ym-scrim" aria-label="Close" onClick={onClose} />
      <div className="ym-modal">
        <div className="ym-modal-head">
          <div>
            <h2>{title}</h2>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="ym-x" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type ShareData = { name: string; brands: string; reach: number; estimated: boolean; lines: { title: string; reach: string }[] };

const W = 1080;
const H = 1350;

function round(pen: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  pen.beginPath();
  pen.roundRect(x, y, w, h, r);
}

/**
 * Пропуск картинкой - тот же, что в кабинете, только без ленты: сохранить
 * и выложить. Портрет 4:5 - так он целиком виден в ленте X.
 */
async function draw(canvas: HTMLCanvasElement, data: ShareData) {
  const pen = canvas.getContext("2d");
  if (!pen) return;
  canvas.width = W;
  canvas.height = H;
  const font = getComputedStyle(document.body).fontFamily;
  pen.fillStyle = "#f2f2ef";
  pen.fillRect(0, 0, W, H);

  const cx = 190;
  const cw = W - cx * 2;
  // Высота - по содержимому: пустой низ у пропуска выглядел недоделанным.
  const ch = 330 + 70 + 140 + 222 + 54 + Math.min(3, data.lines.length) * 50 + 10;
  const cy = Math.round((H - ch) / 2);
  // Тень и сам пропуск.
  pen.save();
  pen.shadowColor = "rgba(60, 20, 10, 0.28)";
  pen.shadowBlur = 60;
  pen.shadowOffsetY = 30;
  round(pen, cx, cy, cw, ch, 22);
  pen.fillStyle = "#fff";
  pen.fill();
  pen.restore();

  // Обложка: тот же тёплый градиент.
  const coverH = 330;
  pen.save();
  round(pen, cx, cy, cw, ch, 22);
  pen.clip();
  pen.fillStyle = "#d2361f";
  pen.fillRect(cx, cy, cw, coverH);
  const glow = (x: number, y: number, r: number, stops: [number, string][]) => {
    const g = pen.createRadialGradient(x, y, 0, x, y, r);
    for (const [at, color] of stops) g.addColorStop(at, color);
    pen.fillStyle = g;
    pen.fillRect(cx, cy, cw, coverH);
  };
  glow(cx + cw * 0.88, cy + 20, cw * 0.8, [[0, "#ffbd4a"], [0.28, "#ff7a1a"], [0.7, "rgba(255,122,26,0)"]]);
  glow(cx + cw * 0.08, cy + coverH, cw * 0.65, [[0, "#7a1f66"], [0.75, "rgba(122,31,102,0)"]]);
  pen.restore();

  // Прорезь под ленту.
  round(pen, cx + cw / 2 - 52, cy + 26, 104, 18, 9);
  pen.fillStyle = "#f2f2ef";
  pen.fill();

  const mark = new Image();
  mark.src = "/site/oxar-mark.webp";
  await new Promise((resolve) => {
    mark.onload = resolve;
    mark.onerror = resolve;
  });
  if (mark.naturalWidth) {
    const h = 64;
    pen.save();
    pen.filter = "brightness(0) invert(1)";
    pen.drawImage(mark, cx + 48, cy + 72, (mark.naturalWidth / mark.naturalHeight) * h, h);
    pen.restore();
  }
  pen.fillStyle = "#fff";
  pen.font = `600 22px ${font}`;
  pen.globalAlpha = 0.85;
  pen.fillText("R E A C H   P A S S", cx + 48, cy + coverH - 78);
  pen.globalAlpha = 1;
  pen.font = `600 50px ${font}`;
  pen.fillText("Logo on real things", cx + 48, cy + coverH - 30);

  const left = cx + 48;
  let y = cy + coverH + 70;
  pen.fillStyle = "#9a9aa0";
  pen.font = `600 20px ${font}`;
  pen.fillText("H O L D E R", left, y);
  pen.fillStyle = "#16181d";
  pen.font = `600 36px ${font}`;
  pen.fillText(data.name, left, y + 44);
  pen.fillStyle = "#6b6b73";
  pen.font = `400 24px ${font}`;
  pen.fillText(data.brands, left, y + 80);

  y += 140;
  pen.fillStyle = "#9a9aa0";
  pen.font = `600 20px ${font}`;
  pen.fillText("S E E N   B Y", left, y);
  pen.fillStyle = "#16181d";
  pen.font = `600 130px ${font}`;
  pen.fillText(`${data.estimated ? "~" : ""}${data.reach.toLocaleString("en-US")}`, left - 6, y + 120);
  pen.fillStyle = "#6b6b73";
  pen.font = `400 26px ${font}`;
  pen.fillText(data.estimated ? "people saw my logo on OXAR (estimated)" : "people saw my logo on OXAR", left, y + 168);

  // Линия отрыва и корешок.
  y += 222;
  pen.strokeStyle = "#d9d8d2";
  pen.lineWidth = 2;
  pen.setLineDash([10, 8]);
  pen.beginPath();
  pen.moveTo(cx + 30, y);
  pen.lineTo(cx + cw - 30, y);
  pen.stroke();
  pen.setLineDash([]);
  y += 54;
  for (const line of data.lines.slice(0, 3)) {
    pen.fillStyle = "#16181d";
    pen.font = `400 28px ${font}`;
    pen.fillText(line.title, left, y);
    pen.font = `600 28px ${font}`;
    pen.textAlign = "right";
    pen.fillText(line.reach, cx + cw - 48, y);
    pen.textAlign = "left";
    y += 50;
  }
}

/** Поделиться пропуском: он сам в окне, картинкой - сохранить, и в X. */
export function ShareModal({ data, children, onClose }: { data: ShareData; children: ReactNode; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [saved, setSaved] = useState(false);
  const text = `My logo was seen by ${data.estimated ? "about " : ""}${data.reach.toLocaleString("en-US")} people on @oxar_app.`;
  const post = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://oxar.app")}`;

  async function save() {
    if (!canvas.current) return;
    await draw(canvas.current, data);
    const link = document.createElement("a");
    link.download = "oxar-reach-pass.png";
    link.href = canvas.current.toDataURL("image/png");
    link.click();
    setSaved(true);
  }

  return (
    <Modal title="Share your reach" sub="Your OXAR reach pass" onClose={onClose}>
      <div className="ym-share-stage">{children}</div>
      <canvas ref={canvas} hidden />
      <div className="ym-modal-go two">
        <button type="button" className="ym-mbtn light" onClick={() => void save()}>
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
          </svg>
          {saved ? "Saved" : "Save image"}
        </button>
        <a className="ym-mbtn dark" href={post} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 24 24" aria-hidden className="fill">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          Share on X
        </a>
      </div>
    </Modal>
  );
}

/** Профиль: картинки грузятся сразу при выборе, сохраняется всё по кнопке. */
export function EditModal({
  profile,
  wallet,
  avatarStyle,
  onSaved,
  onClose,
}: {
  profile: Profile;
  wallet: string;
  avatarStyle: CSSProperties;
  onSaved: (next: Profile) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(profile.display_name ?? "");
  const [brand, setBrand] = useState(profile.brand ?? "");
  const [x, setX] = useState(profile.x_handle ? `@${profile.x_handle}` : "");
  const [avatar, setAvatar] = useState(profile.avatar_path);
  const [logo, setLogo] = useState(profile.logo_path);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(list: FileList | null, kind: "avatar" | "logo") {
    const file = list?.[0];
    if (!file) return;
    setError("");
    setBusy(true);
    const result = await uploadFace(file, kind);
    setBusy(false);
    if ("error" in result) return setError(result.error);
    if (kind === "avatar") setAvatar(result.path);
    else setLogo(result.path);
  }

  async function save() {
    const clean = cleanProfile({ name, brand, x });
    if (!clean.ok) return setError(clean.error);
    const next: Profile = { ...clean.value, avatar_path: avatar, logo_path: logo };
    setBusy(true);
    const failed = await saveProfile(next);
    setBusy(false);
    if (failed) return setError(failed);
    onSaved(next);
    onClose();
  }

  return (
    <Modal title="Edit profile" sub="How you show up on OXAR" onClose={onClose}>
      <form
        className="ym-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="ym-form-media">
          <label className="ym-upload">
            <span className="ym-upload-pic" style={avatar ? undefined : avatarStyle}>
              {avatar && <img src={faceUrl(avatar) ?? ""} alt="" />}
            </span>
            <span>
              <b>Profile picture</b>
              <em>Square, PNG, JPG or WebP</em>
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void pick(event.target.files, "avatar")} />
          </label>
          <label className="ym-upload">
            <span className="ym-upload-pic logo">{logo ? <img src={faceUrl(logo) ?? ""} alt="" /> : "Logo"}</span>
            <span>
              <b>Brand logo</b>
              <em>PNG, JPG or WebP, up to 2 MB</em>
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void pick(event.target.files, "logo")} />
          </label>
        </div>

        <label className="ym-field">
          <span>Display name</span>
          <input value={name} maxLength={NAME_MAX} onChange={(event) => setName(event.target.value)} placeholder="Shown instead of your wallet" />
        </label>
        <div className="ym-form-two">
          <label className="ym-field">
            <span>Brand name</span>
            <input value={brand} maxLength={BRAND_MAX} onChange={(event) => setBrand(event.target.value)} placeholder="Shown next to your name" />
          </label>
          <label className="ym-field">
            <span>X account</span>
            <input value={x} maxLength={HANDLE_MAX + 1} onChange={(event) => setX(event.target.value)} placeholder="@handle" />
          </label>
        </div>

        <div className="ym-field">
          <span>Wallet</span>
          <div className="ym-readonly">
            <code>{wallet}</code>
            <em>Your wallet is your account</em>
          </div>
        </div>

        {error && <p className="ym-form-error">{error}</p>}

        <div className="ym-modal-go two">
          <button type="button" className="ym-mbtn light" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="ym-mbtn dark" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
