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

type Event = { id: number; user_id: string; kind: string; data: Record<string, unknown> };

/** Место и вещь лота - для текста. */
async function spotOf(lotId: unknown): Promise<{ spot: string; thing: string }> {
  if (typeof lotId !== "string") return { spot: "", thing: "" };
  const { data } = await db.from("lots").select("thing_spots(label), things:thing_id(title)").eq("id", lotId).maybeSingle();
  const label = (data?.thing_spots as { label?: string } | null)?.label ?? "";
  return {
    spot: label ? spotName(label) : "",
    thing: (data?.things as { title?: string } | null)?.title ?? "",
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
  return null;
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
