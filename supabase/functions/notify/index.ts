// Разносчик уведомлений: берёт событие из очереди notification_events и шлёт
// пуш на все устройства человека.
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
  return new Response(`отправлено: ${sent}`, { status: 200 });
});
