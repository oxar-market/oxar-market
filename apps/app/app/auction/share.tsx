"use client";

import { useEffect, useState, type RefObject } from "react";
import { formatUsd } from "@oxar/core";
import type { Stage } from "@oxar/stage";
import { auctionLink, leadText, shareIntent, shareText, type ShareWorn } from "@/lib/share";
import { loadWorn } from "../worn.tsx";

/**
 * Поделиться ставкой в X: готовый текст и картинка - вещь с логотипом и сумма.
 *
 * Окно твита по ссылке картинку не берёт, поэтому два пути. На телефоне -
 * меню «Поделиться»: в нём есть приложение X, и твит открывается уже с
 * картинкой и текстом. На компьютере - сразу окно твита с текстом, а картинка
 * в буфере: её вставить. Меню «Поделиться» умеет и Safari на Mac, но X в нём
 * нет, и человек не понимал, куда делся твит. Плюс кнопка сохранить картинку -
 * на случай, если буфер не дался.
 */

/** Телефон или планшет: палец, а не мышь. Там меню «Поделиться» ведёт в X. */
const touch = () => window.matchMedia("(pointer: coarse)").matches;
export function ShareBid({
  thingId,
  stage,
  azimuth,
  title,
  spot,
  cents,
  mine = true,
  onClose,
}: {
  /** По нему - кто носит вещь, где и когда: это идёт в текст твита. */
  thingId: string;
  stage: RefObject<Stage | null>;
  /** С какой стороны снять вещь - с той, где место. */
  azimuth: number;
  title: string;
  /** Подпись места; пусто, если место у вещи одно. */
  spot?: string;
  cents: number;
  /** Своя ставка - от первого лица; ставка лидера, которой делится админ, - нет. */
  mine?: boolean;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [note, setNote] = useState("");
  const [worn, setWorn] = useState<ShareWorn | undefined>(undefined);
  useEffect(() => {
    void loadWorn(thingId).then(setWorn);
  }, [thingId]);
  const link = auctionLink(thingId);
  const text = mine
    ? shareText({ cents, title, spot, worn, link })
    : leadText({ cents, title, spot, worn, link });

  // Картинку собираем сразу: системное меню «Поделиться» открывается только
  // по нажатию, и ждать в нём сборки нельзя - жест истечёт.
  useEffect(() => {
    const shot = stage.current?.snapshot(azimuth) ?? null;
    const card = drawCard(shot, cents, title, spot, mine ? "I just bid" : "Top bid");
    let url = "";
    card.toBlob((blob) => {
      if (!blob) return;
      url = URL.createObjectURL(blob);
      setFile(new File([blob], "oxar-bid.png", { type: "image/png" }));
      setPreview(url);
    }, "image/png");
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [stage, azimuth, cents, title, spot, mine]);

  async function share() {
    if (!file) return;
    setNote("");
    if (touch() && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
      } catch {
        // Человек закрыл меню - это не ошибка.
      }
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
      copied = true;
    } catch {
      copied = false;
    }
    window.open(shareIntent(text), "_blank", "noopener");
    const paste = /Mac|iPhone|iPad/.test(navigator.platform) ? "Cmd+V" : "Ctrl+V";
    setNote(
      copied
        ? `The image is copied. Paste it into your post with ${paste}.`
        : "Save the image below and attach it to your post.",
    );
  }

  return (
    <div className="share-bid">
      <div className="share-head">
        <b>{mine ? "Your bid is in. Tell people." : "Share the top bid."}</b>
        <button type="button" className="share-close" aria-label="Close" onClick={onClose}>
          &times;
        </button>
      </div>
      {preview && <img className="share-preview" src={preview} alt="Your bid card" />}
      <div className="share-actions">
        <button type="button" className="sl-btn dark" disabled={!file} onClick={share}>
          Share on X
        </button>
        {preview && (
          <a className="sl-btn light" href={preview} download="oxar-bid.png">
            Save image
          </a>
        )}
      </div>
      {note && <p className="muted">{note}</p>}
    </div>
  );
}

/**
 * Поделиться торгом - для всех: окно со ссылкой прямо на торг и кнопкой
 * скопировать. Не твит: куда нести ссылку, человек решит сам. В X ведёт
 * только шеринг ставки (ShareBid).
 */
export function ShareAuction({ thingId }: { thingId: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = auctionLink(thingId);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="share-auction"
        onClick={() => {
          setCopied(false);
          setOpen(true);
        }}
      >
        Share auction
      </button>
      {open && (
        <div className="share-pop" role="dialog" aria-modal="true" aria-label="Share this auction" onClick={() => setOpen(false)}>
          <div className="share-pop-card" onClick={(event) => event.stopPropagation()}>
            <div className="share-head">
              <b>Share this auction</b>
              <button type="button" className="share-close" aria-label="Close" onClick={() => setOpen(false)}>
                &times;
              </button>
            </div>
            {/* Нажатие на саму ссылку тоже копирует: на телефоне в неё и тычут. */}
            <button type="button" className="share-link" onClick={copy}>
              {link}
            </button>
            <button type="button" className="sl-btn dark" onClick={copy}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Карточка 1200x675 - размер, который X показывает в ленте целиком: слева
 * вещь с логотипом, справа сумма, вещь и куда идти перебивать.
 */
function drawCard(
  shot: HTMLCanvasElement | null,
  cents: number,
  title: string,
  spot: string | undefined,
  heading: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const font = getComputedStyle(document.body).fontFamily;

  ctx.fillStyle = "#f9f9f7";
  ctx.fillRect(0, 0, 1200, 675);
  ctx.fillStyle = "#efefeb";
  ctx.beginPath();
  ctx.roundRect(32, 32, 611, 611, 28);
  ctx.fill();
  if (shot) ctx.drawImage(shot, 32, 32, 611, 611);

  const left = 700;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#e0381c";
  ctx.beginPath();
  ctx.arc(left + 7, 104, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6b6e76";
  ctx.font = `600 26px ${font}`;
  ctx.letterSpacing = "4px";
  ctx.fillText("OXAR AUCTION", left + 26, 113);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = "#14161a";
  ctx.font = `500 44px ${font}`;
  ctx.fillText(heading, left, 250);
  ctx.font = `700 132px ${font}`;
  ctx.fillText(formatUsd(cents), left, 380);

  ctx.font = `600 38px ${font}`;
  ctx.fillText(spot ? `${title}, spot ${spot}` : title, left, 450, 460);

  ctx.fillStyle = "#6b6e76";
  ctx.font = `500 30px ${font}`;
  ctx.fillText("Outbid me at app.oxar.app", left, 600, 460);
  return canvas;
}
