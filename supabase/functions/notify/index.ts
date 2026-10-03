// Разносчик уведомлений: берёт событие из очереди notification_events и шлёт
// пуш на все устройства человека и письмо на привязанную почту.
//
// Будит его триггер на новой строке очереди. Телу запроса не верим: из него -
// только id, а событие функция забирает себе отметкой pushed_at, и только
// если его ещё никто не разнёс. Поэтому позвать её снаружи бесполезно: она
// разнесёт лишь то, что база сама положила в очередь, и ровно один раз.
//
// Текст уведомлений - здесь, по виду события; в базе только факты.
//
// Полезная нагрузка шифруется под каждое устройство - таково устройство
// веб-пушей. Протухшие подписки (устройство отписалось или переустановило
// браузер) убираются по ответу самой службы.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
// Нет ключа - писем нет, пуши идут как прежде.
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = "OXAR <notifications@oxar.app>";
// «Перебили» письмом - не чаще раза в столько на место: в торге под конец
// перебивают поминутно, и пачка писем хуже одного.
const OUTBID_EMAIL_GAP_MS = 15 * 60_000;

webpush.setVapidDetails("mailto:daniel.l@oxar.app", VAPID_PUBLIC, VAPID_PRIVATE);

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

const APP = "https://app.oxar.app/";

// Подпись места - как spotName в packages/core: слово «spot» получает только
// номер клетки футболки, у вещи продавца оно уже есть («Spot 1»).
const spotName = (label: string) => (/^\d+$/.test(label) ? `spot ${label}` : label);

/**
 * Название вещи и подпись места задаёт продавец, а уходят они в пуш и в
 * письмо от нашего адреса. Поэтому - одной строкой, без ссылок и не длиннее
 * шестидесяти знаков: письмо OXAR не должно нести чужую ссылку или перенос
 * строки в теме.
 */
function clean(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\b(?:https?:\/\/|www\.)\S*/gi, "")
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?:\/\S*)?/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

type Event = { id: number; user_id: string; kind: string; data: Record<string, unknown> };

/** Место и вещь лота - для текста. */
async function spotOf(lotId: unknown): Promise<{ spot: string; thing: string }> {
  if (typeof lotId !== "string") return { spot: "", thing: "" };
  const { data } = await db.from("lots").select("thing_spots(label), things:thing_id(title)").eq("id", lotId).maybeSingle();
  const label = (data?.thing_spots as { label?: string } | null)?.label ?? "";
  return {
    spot: label ? spotName(clean(label)) : "",
    thing: clean((data?.things as { title?: string } | null)?.title ?? ""),
  };
}

async function message(event: Event): Promise<{ title: string; body: string; url: string } | null> {
  const { spot, thing } = await spotOf(event.data.lot_id);
  if (event.kind === "outbid") {
    const cents = Number(event.data.amount_cents);
    return {
      title: `You've been outbid${spot ? ` on ${spot}` : ""}`,
      body: `The bid is now $${(cents / 100).toFixed(2)}. There is still time to take it back.`,
      url: APP,
    };
  }
  if (event.kind === "proof") {
    return {
      title: `Proof is in${spot ? ` for ${spot}` : ""}`,
      body: `The seller showed ${thing || "the thing"} with your logo. Check it within 72 hours, or the payment goes to the seller.`,
      url: APP,
    };
  }

  // Остальное - про место на вещи: «Spot 1 on Test Tee».
  const where = [spot, thing].filter(Boolean).join(" on ") || "Your spot";
  const What = where.charAt(0).toUpperCase() + where.slice(1);
  switch (event.kind) {
    case "ending":
      return {
        title: "Bidding ends in an hour",
        body: `${thing || "The auction"} closes at ${when(event.data.closes_at)}. A late bid moves the close by five minutes.`,
        url: APP,
      };
    case "won":
      return {
        title: `You won ${spot || "a spot"}`,
        body: `${What}: your logo goes on it.${
          event.data.proof_by
            ? ` The seller has until ${when(event.data.proof_by)} to show it in use; your payment waits for that proof.`
            : ""
        }`,
        url: APP,
      };
    case "appeal_last_day":
      return {
        title: "Last day to check the proof",
        body: `${What}: if you do nothing, the payment goes to the seller at ${when(event.data.until)}. Not what you paid for? Dispute it in the app.`,
        url: APP,
      };
    case "refunded":
      return { title: "Your bid came back", body: `${What}: the bid was returned to your wallet.`, url: APP };
    case "decided": {
      const bps = Number(event.data.seller_bps);
      const split =
        bps === 10_000
          ? "the payment goes to the seller"
          : bps === 0
            ? "the bid goes back to the winner"
            : `${bps / 100}% goes to the seller, the rest back to the winner`;
      return { title: "The dispute is decided", body: `${What}: OXAR reviewed it, ${split}.`, url: APP };
    }
    case "sold":
      return {
        title: "Your auction ended",
        body: `${thing || "Your thing"}: the results and the logos to print are in your seller cabinet.${
          event.data.proof_by ? ` Show it in use with the logos by ${when(event.data.proof_by)}.` : ""
        }`,
        url: APP,
      };
    case "proof_due": {
      const days = Number(event.data.days);
      return {
        title: `Proof due in ${days === 1 ? "a day" : `${days} days`}`,
        body: `${thing || "Your thing"}: show it in use with the logos by ${when(event.data.proof_by)}, or the winners get their bids back.`,
        url: APP,
      };
    }
    case "paid":
      return { title: "Payment received", body: `${What}: the winning bid, minus the fee, is in your wallet.`, url: APP };
    case "disputed":
      return {
        title: "A winner disputed the proof",
        body: `${What}: OXAR reviews it and decides. The payment for this spot waits until then.`,
        url: APP,
      };
    case "dispute_admin":
      return { title: "New dispute", body: `${What}: review it in You > Admin > Disputes.`, url: APP };
  }
  return null;
}

/** Время для текста: по UTC, люди читают из разных зон. */
function when(at: unknown): string {
  const date = new Date(String(at));
  if (Number.isNaN(date.getTime())) return "the deadline";
  return `${date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })} UTC`;
}

Deno.serve(async (request) => {
  const body = await request.json().catch(() => null);
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return new Response("нет id события", { status: 400 });

  // Забрать событие себе: отметка ставится, только если её ещё нет.
  const { data: claimed } = await db
    .from("notification_events")
    .update({ pushed_at: new Date().toISOString() })
    .eq("id", id)
    .is("pushed_at", null)
    .select("id, user_id, kind, data");
  const event = claimed?.[0] as Event | undefined;
  if (!event) return new Response("уже разнесено или нет такого", { status: 200 });

  const payload = await message(event);
  if (!payload) return new Response("неизвестный вид события", { status: 200 });

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", event.user_id);

  let sent = 0;
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (error) {
      const gone = (error as { statusCode?: number }).statusCode;
      // 404 и 410 - служба говорит «этого устройства больше нет».
      if (gone === 404 || gone === 410) {
        await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      } else {
        console.error("пуш не ушёл:", sub.endpoint.slice(0, 40), error);
      }
    }
  }
  const emailed = await email(event, payload);
  return new Response(`пушей: ${sent}, письмо: ${emailed}`, { status: 200 });
});

/** Письмо по событию, если человек его хочет. Возвращает, что вышло. */
async function email(event: Event, payload: { title: string; body: string; url: string }): Promise<string> {
  if (!RESEND_API_KEY) return "нет ключа";
  const { data: settings } = await db
    .from("notification_settings")
    .select("email, email_on, email_outbid")
    .eq("user_id", event.user_id)
    .maybeSingle();
  if (!settings?.email || !settings.email_on) return "не хочет";
  if (event.kind === "outbid") {
    if (!settings.email_outbid) return "не хочет";
    const { data: recent } = await db
      .from("notification_events")
      .select("id")
      .eq("user_id", event.user_id)
      .eq("kind", "outbid")
      .eq("data->>lot_id", String(event.data.lot_id))
      .gte("emailed_at", new Date(Date.now() - OUTBID_EMAIL_GAP_MS).toISOString())
      .limit(1);
    if (recent?.length) return "недавно писали";
  }

  // Забрать письмо себе, как и пуш: второй вызов его не повторит.
  const { data: claimed } = await db
    .from("notification_events")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", event.id)
    .is("emailed_at", null)
    .select("id");
  if (!claimed?.length) return "уже";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: settings.email,
      subject: payload.title,
      text: `${payload.body}\n\nOpen OXAR: ${payload.url}\n\nTo change or stop these emails, open You > Notifications in the app.`,
    }),
  });
  if (!response.ok) {
    // Отметку снимаем: письмо не ушло, и повторный вызов по этому событию
    // попробует снова, а не решит, что оно отправлено.
    await db.from("notification_events").update({ emailed_at: null }).eq("id", event.id);
    console.error("письмо не ушло:", response.status, await response.text());
    return "ошибка";
  }
  return "ушло";
}
