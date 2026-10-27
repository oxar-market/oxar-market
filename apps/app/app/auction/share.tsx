"use client";

import { useEffect, useState, type RefObject } from "react";
import { formatUsd, formatUsdFull } from "@oxar/core";
import { Usdc } from "../usdc.tsx";
import type { Stage } from "@oxar/stage";
import { auctionLink, leadText, shareIntent, shareText, tieText, type ShareWorn } from "@/lib/share";
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
type ShareInput = {
  /** По нему - кто носит вещь, где и когда: это идёт в текст твита. */
  thingId: string;
  stage: RefObject<Stage | null>;
  /** С какой стороны снять вещь - с той, где место. */
  azimuth: number;
  title: string;
  /** Подпись места; пусто, если место у вещи одно. */
  spot?: string;
  cents: number;
  /** Чей логотип на вещи: своя ставка - свой бренд, ставка лидера - его. */
  brand: string;
  /** Своя ставка - от первого лица; ставка лидера, которой делится админ, - нет. */
  mine?: boolean;
  /**
   * Свой голос и вид у большого нашего торга - галстука Simon: вещь говорит
   * сама, а картинка - заставка прямого эфира, а не справка.
   */
  broadcast?: boolean;
};

/**
 * Картинка ставки и отправка в X - одно на окно «ставка принята» и на блок
 * «поделиться лидерством». Снимок вещи отдаётся и отдельно: окно показывает
 * его в карточке.
 */
function useShareBid({ thingId, stage, azimuth, title, spot, cents, brand, mine = true, broadcast = false }: ShareInput) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [thing, setThing] = useState("");
  const [note, setNote] = useState("");
  const [worn, setWorn] = useState<ShareWorn | undefined>(undefined);
  useEffect(() => {
    void loadWorn(thingId).then(setWorn);
  }, [thingId]);
  const link = auctionLink(thingId);
  const text = broadcast
    ? tieText({ mine, brand })
    : mine
      ? shareText({ cents, title, spot, worn, link })
      : leadText({ cents, title, spot, worn, link });

  // Картинку собираем сразу: системное меню «Поделиться» открывается только
  // по нажатию, и ждать в нём сборки нельзя - жест истечёт.
  useEffect(() => {
    const shot = stage.current?.snapshot(azimuth) ?? null;
    setThing(shot ? shot.toDataURL("image/png") : "");
    const card = broadcast
      ? drawBroadcast(shot, brand)
      : drawCard(shot, cents, title, spot, mine ? "I just bid" : "Top bid");
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
  }, [stage, azimuth, cents, title, spot, mine, broadcast, brand]);

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

  return { file, preview, thing, note, share };
}

export function ShareBid({ onClose, ...input }: ShareInput & { onClose: () => void }) {
  const mine = input.mine ?? true;
  const { file, preview, note, share } = useShareBid(input);

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
 * Ставка принята - окном поверх торга: галочка, вещь с логотипом ставки,
 * сумма, что дальше, и «Share on X» тут же, пока радость свежая.
 */
export function BidSuccess({
  closesAt,
  onClose,
  ...input
}: ShareInput & { closesAt: number | null; onClose: () => void }) {
  const { file, thing, note, share } = useShareBid(input);
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const closes = closesAt
    ? new Date(closesAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <div className="bid-ok-dim" onClick={onClose}>
      <div
        className="bid-ok"
        role="dialog"
        aria-modal="true"
        aria-label="Bid placed"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="share-close bid-ok-x" aria-label="Close" onClick={onClose}>
          &times;
        </button>
        <div className="bid-ok-mark" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ "--a": `${i * 45 + 20}deg` } as React.CSSProperties} />
          ))}
          <span>
            <svg viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </div>
        <h2>Congrats!</h2>
        <p className="bid-ok-sub">Your bid is in. You lead {input.spot ? `the ${input.spot}` : "this auction"} right now.</p>

        <div className="bid-ok-card">
          <span className="bid-ok-thing">{thing && <img src={thing} alt="" />}</span>
          <span className="bid-ok-info">
            <span className="bid-ok-pill">Leading</span>
            <b className="bid-ok-title">{input.title}</b>
            {input.spot && <span className="bid-ok-spot">{input.spot}</span>}
            <span className="bid-ok-cap">Your bid</span>
            <span className="bid-ok-sum">
              {formatUsdFull(input.cents)} <Usdc />
            </span>
          </span>
        </div>

        <div className="bid-ok-next">
          <svg viewBox="0 0 24 24" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
          <span>
            <b>What happens next?</b>
            If someone outbids you, your USDC comes back to your wallet in the same transaction.
            {closes ? ` The auction closes ${closes}, and the highest bid on each spot wins.` : " The highest bid on each spot at the close wins."}
          </span>
        </div>

        <div className="bid-ok-actions">
          <button type="button" className="primary bid-ok-share" disabled={!file} onClick={share}>
            Share on X
          </button>
          <button type="button" className="sl-btn light" onClick={onClose}>
            Back to the auction
          </button>
        </div>
        {note && <p className="muted bid-ok-note">{note}</p>}
      </div>
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

  fitText(ctx, spot ? `${title}, spot ${spot}` : title, left, 450, 460, 600, 38, font);

  ctx.fillStyle = "#6b6e76";
  ctx.font = `500 30px ${font}`;
  ctx.fillText("Outbid me at app.oxar.app", left, 600, 460);
  return canvas;
}

/**
 * Заставка эфира для галстука Simon: тёмная студия с размытыми огнями,
 * галстук с логотипом крупно, «LIVE» и плашка внизу, как в новостях. Всё
 * нарисовано здесь - ни кадра из эфира, ни чужого лица.
 */
function drawBroadcast(shot: HTMLCanvasElement | null, brand: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const font = getComputedStyle(document.body).fontFamily;

  // Студия: глубокий синий в чёрный и свет сверху.
  const room = ctx.createRadialGradient(420, 120, 40, 520, 320, 900);
  room.addColorStop(0, "#1d2a4a");
  room.addColorStop(0.55, "#0b1020");
  room.addColorStop(1, "#04060b");
  ctx.fillStyle = room;
  ctx.fillRect(0, 0, 1200, 675);

  // Огни в расфокусе: одни и те же для всех карточек - узор, а не шум.
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = next() * 1200;
    const y = next() * 420;
    const r = 18 + next() * 60;
    const warm = next() > 0.55;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, warm ? "rgba(255,196,120,0.22)" : "rgba(120,170,255,0.18)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Галстук крупно, чуть наклонён - висит в кадре, а не лежит на витрине.
  if (shot) {
    ctx.save();
    // Узел - в кадре: по нему галстук узнаётся с первого взгляда.
    ctx.translate(360, 300);
    ctx.rotate((-5 * Math.PI) / 180);
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 40;
    ctx.drawImage(shot, -380, -380, 760, 760);
    ctx.restore();
  }

  // LIVE в углу.
  ctx.fillStyle = "#e0381c";
  ctx.beginPath();
  ctx.roundRect(44, 40, 132, 50, 10);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(70, 65, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `700 26px ${font}`;
  ctx.letterSpacing = "3px";
  ctx.textBaseline = "middle";
  ctx.fillText("LIVE", 88, 66);
  ctx.letterSpacing = "0px";

  // Справа - чей логотип на галстуке. Без суммы: картинка про то, как это
  // выглядит в эфире, а не про торг.
  const left = 720;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = `600 30px ${font}`;
  ctx.letterSpacing = "3px";
  ctx.fillText("ON THE TIE", left, 230);
  ctx.letterSpacing = "0px";
  ctx.fillStyle = "#ffffff";
  fitText(ctx, brand.trim() || "Your logo", left, 330, 440, 700, 96, font);

  // Плашка внизу, как титр в эфире.
  ctx.fillStyle = "#f4f4f1";
  ctx.fillRect(0, 520, 1200, 110);
  ctx.fillStyle = "#e0381c";
  ctx.fillRect(0, 520, 14, 110);
  ctx.fillStyle = "#0b1020";
  ctx.font = `800 40px ${font}`;
  ctx.fillText("SOLANA ECOSYSTEM CALL", 48, 568);
  ctx.fillStyle = "#4a4f5a";
  ctx.font = `500 30px ${font}`;
  ctx.fillText("Oct 29 · with @simonmolitor · this tie, live", 48, 610);
  ctx.textAlign = "right";
  ctx.fillStyle = "#0b1020";
  ctx.font = `600 28px ${font}`;
  ctx.fillText("app.oxar.app", 1160, 590);
  ctx.textAlign = "left";

  // Тонкая полоса под титром - бегущая строка эфира.
  ctx.fillStyle = "#0b1020";
  ctx.fillRect(0, 630, 1200, 45);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = `500 22px ${font}`;
  ctx.fillText("ONE SPONSOR GETS THE WHOLE TIE  ·  BID IN USDC  ·  ESCROW UNTIL IT'S ON AIR", 48, 659);
  return canvas;
}

/**
 * Строка в ширину: длинное имя уменьшается кеглем, а не сжимается. У
 * fillText с пределом ширины буквы сплющивались - «HedgeYourFun» читался
 * чужим шрифтом.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  max: number,
  weight: number,
  size: number,
  font: string,
) {
  let px = size;
  ctx.font = `${weight} ${px}px ${font}`;
  while (px > 20 && ctx.measureText(text).width > max) {
    px -= 2;
    ctx.font = `${weight} ${px}px ${font}`;
  }
  ctx.fillText(text, x, y);
}
