// Текст уведомлений: заголовок, текст, кнопка и куда она ведёт - по виду
// события; и само письмо, текстом и в HTML.
//
// Чистые функции без Deno и без сети: их гоняет node --test, а index.ts
// только достаёт факты из базы и рассылает.

const APP = "https://app.oxar.app/";
// Знак OXAR с лендинга: картинка по адресу, вложений в письме нет.
const LOGO = "https://oxar.app/mark.png";
const FOOTER = "To change or stop these emails, open You > Notifications in the app.";

/** Вкладка приложения по ссылке: page.tsx читает ?tab=. */
const tab = (id: "market" | "auction" | "you") => `${APP}?tab=${id}`;

/** Лот события, как он лежит в базе сейчас. Подписи - сырые, от продавца. */
export type Lot = { spot: string; thing: string; house: boolean; closesAt: string | null };

export type Message = { title: string; body: string; action: string; url: string };

// Подпись места - как spotName в packages/core: слово «spot» получает только
// номер клетки футболки, у вещи продавца оно уже есть («Spot 1»).
const spotName = (label: string) => (/^\d+$/.test(label) ? `spot ${label}` : label);

/**
 * Название вещи и подпись места задаёт продавец, а уходят они в пуш и в
 * письмо от нашего адреса. Поэтому - одной строкой, без ссылок и не длиннее
 * шестидесяти знаков: письмо OXAR не должно нести чужую ссылку или перенос
 * строки в теме.
 */
export function clean(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S*/gi, "")
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?:\/\S*)?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Время для текста: по UTC, люди читают из разных зон. */
function when(at: unknown): string {
  const date = new Date(String(at));
  if (Number.isNaN(date.getTime())) return "the deadline";
  return `${date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** Сколько осталось, словами: «14 minutes», «an hour», «2 hours». */
function timeLeft(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / MINUTE));
  if (minutes === 1) return "a minute";
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}

/** Срок по календарю UTC: «today, by 23:59 UTC», «tomorrow, by …», «in 3 days». */
function dueIn(due: Date, now: number): string {
  const days = Math.floor(due.getTime() / DAY) - Math.floor(now / DAY);
  const by = `by ${String(due.getUTCHours()).padStart(2, "0")}:${String(due.getUTCMinutes()).padStart(2, "0")} UTC`;
  if (days <= 0) return `today, ${by}`;
  if (days === 1) return `tomorrow, ${by}`;
  return `in ${days} days`;
}

/** Валидное время или null. */
function time(at: unknown): number | null {
  if (typeof at !== "string") return null;
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Уведомление по событию. null - слать нечего: вид незнаком или срок, о
 * котором напоминаем, уже прошёл (событие разносят и с опозданием).
 */
export function message(kind: string, data: Record<string, unknown>, lot: Lot, now: number): Message | null {
  const spot = lot.spot ? spotName(clean(lot.spot)) : "";
  const thing = clean(lot.thing);
  // Торг нашей вещи - на вкладке Auction; вещи продавца там нет, она на Market.
  const auction = tab(lot.house ? "auction" : "market");
  const you = tab("you");

  if (kind === "outbid") {
    const cents = Number(data.amount_cents);
    return {
      title: `You've been outbid${spot ? ` on ${spot}` : ""}`,
      body: `The bid is now $${(cents / 100).toFixed(2)}. There is still time to take it back.`,
      action: "Bid again",
      url: auction,
    };
  }
  if (kind === "proof") {
    return {
      title: `Proof is in${spot ? ` for ${spot}` : ""}`,
      body: `The seller showed ${thing || "the thing"} with your logo. Check it within 72 hours, or the payment goes to the seller.`,
      action: "Check the proof",
      url: you,
    };
  }

  // Остальное - про место на вещи: «Spot 1 on Test Tee».
  const where = [spot, thing].filter(Boolean).join(" on ") || "Your spot";
  const What = where.charAt(0).toUpperCase() + where.slice(1);
  switch (kind) {
    case "ending": {
      // Поздняя ставка отодвигает конец, а напоминание могло лечь давно:
      // берём позднее из события и из лота.
      const closes = Math.max(time(data.closes_at) ?? -Infinity, time(lot.closesAt) ?? -Infinity);
      if (!Number.isFinite(closes) || closes <= now) return null;
      return {
        title: `Bidding ends in ${timeLeft(closes - now)}`,
        body: `${thing || "The auction"} closes at ${when(new Date(closes).toISOString())}. A late bid moves the close by five minutes.`,
        action: "Open the auction",
        url: auction,
      };
    }
    case "won":
      return {
        title: `You won ${spot || "a spot"}`,
        body: `${What}: your logo goes on it.${
          data.proof_by
            ? ` The seller has until ${when(data.proof_by)} to show it in use; your payment waits for that proof.`
            : ""
        }`,
        action: "Open your wins",
        url: you,
      };
    case "appeal_last_day":
      return {
        title: "Last day to check the proof",
        body: `${What}: if you do nothing, the payment goes to the seller at ${when(data.until)}. Not what you paid for? Dispute it in the app.`,
        action: "Check the proof",
        url: you,
      };
    case "refunded":
      return {
        title: "Your bid came back",
        body: `${What}: the bid was returned to your wallet.`,
        action: "See your bids",
        url: you,
      };
    case "decided": {
      const bps = Number(data.seller_bps);
      const split =
        bps === 10_000
          ? "the payment goes to the seller"
          : bps === 0
            ? "the bid goes back to the winner"
            : `${bps / 100}% goes to the seller, the rest back to the winner`;
      return {
        title: "The dispute is decided",
        body: `${What}: OXAR reviewed it, ${split}.`,
        action: "See the decision",
        url: you,
      };
    }
    case "sold":
      return {
        title: "Your auction ended",
        body: `${thing || "Your thing"}: the results and the logos to print are in your seller cabinet.${
          data.proof_by ? ` Show it in use with the logos by ${when(data.proof_by)}.` : ""
        }`,
        action: "Open your seller cabinet",
        url: you,
      };
    case "proof_due": {
      // Окно напоминания («неделя», «сутки») - не срок: считаем от срока.
      const due = time(data.proof_by);
      if (due === null || due <= now) return null;
      return {
        title: `Proof due ${dueIn(new Date(due), now)}`,
        body: `${thing || "Your thing"}: show it in use with the logos by ${when(data.proof_by)}, or the winners get their bids back.`,
        action: "Send the proof",
        url: you,
      };
    }
    case "paid":
      return {
        title: "Payment received",
        body: `${What}: the winning bid, minus the fee, is in your wallet.`,
        action: "Open your seller cabinet",
        url: you,
      };
    case "disputed":
      return {
        title: "A winner disputed the proof",
        body: `${What}: OXAR reviews it and decides. The payment for this spot waits until then.`,
        action: "See the dispute",
        url: you,
      };
    case "dispute_admin":
      return {
        title: "New dispute",
        body: `${What}: review it in You > Admin > Disputes.`,
        action: "Review the dispute",
        url: you,
      };
  }
  return null;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Письмо текстом - для почты без HTML и для фильтров спама. */
export function emailText(m: Message): string {
  return `${m.body}\n\n${m.action}: ${m.url}\n\n${FOOTER}`;
}

/**
 * Письмо в HTML. Таблицами и встроенными стилями: почтовые клиенты режут
 * блоки style и внешние таблицы стилей. Ни пикселей слежения, ни чужих
 * шрифтов. Цвета - из светлой темы приложения (globals.css).
 */
export function emailHtml(m: Message): string {
  const font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(m.title)}</title>
</head>
<body style="margin:0;padding:0;background:#fbfbf9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fbfbf9;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td style="padding:0 4px 20px;${font}">
<img src="${LOGO}" width="20" height="29" alt="" style="display:inline-block;vertical-align:middle;border:0;">
<span style="display:inline-block;vertical-align:middle;margin-left:8px;font-size:17px;font-weight:700;letter-spacing:0.08em;color:#16181d;">OXAR</span>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e3e3df;border-radius:16px;padding:28px 24px;${font}">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:#16181d;">${escapeHtml(m.title)}</h1>
<p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#16181d;">${escapeHtml(m.body)}</p>
<a href="${escapeHtml(m.url)}" style="display:inline-block;background:#16181d;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;line-height:1;padding:14px 22px;border-radius:999px;">${escapeHtml(m.action)}</a>
</td></tr>
<tr><td style="padding:20px 4px 0;font-size:13px;line-height:1.5;color:#6b6b73;${font}">${escapeHtml(FOOTER)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
