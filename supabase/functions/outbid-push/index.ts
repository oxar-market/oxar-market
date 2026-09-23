// Пуш перебитому: «твоё место ушло вперёд, ещё не поздно вернуть».
//
// Будит функцию триггер на новой ставке, но телу запроса здесь не верят ни в
// одном поле: из него берётся только id, а всё остальное перечитывается из
// базы серверным ключом. Поэтому подделка вызова бесполезна - разослать можно
// только то, что действительно записано ставкой.
//
// Перебитый - тот, кто держал верхнюю ставку этого места до пришедшей. Если
// человек перебил сам себя, уведомлять некого: письмо самому себе о самом
// себе - это шум.
//
// Полезная нагрузка шифруется под каждое устройство - таково устройство
// веб-пушей, без этого пуш-служба не примет и байта. Протухшие подписки
// (устройство отписалось или переустановило браузер) убираются по ответу
// самой службы, чтобы не стучаться в пустоту вечно.

import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;

webpush.setVapidDetails("mailto:daniel.l@oxar.app", VAPID_PUBLIC, VAPID_PRIVATE);

const db = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (request) => {
  const body = await request.json().catch(() => null);
  const bidId = body?.record?.id;
  if (typeof bidId !== "string") {
    return new Response("нет id ставки", { status: 400 });
  }

  // Сама ставка - из базы, не из запроса.
  const { data: bid } = await db
    .from("lot_bids")
    .select("id, lot_id, bidder, amount_cents, created_at")
    .eq("id", bidId)
    .single();
  if (!bid) return new Response("ставки нет", { status: 404 });

  // Кого перебили: верхняя ставка этого места из тех, что были раньше.
  const { data: before } = await db
    .from("lot_bids")
    .select("bidder, amount_cents")
    .eq("lot_id", bid.lot_id)
    .lt("created_at", bid.created_at)
    .order("amount_cents", { ascending: false })
    .limit(1);
  const loser = before?.[0];
  if (!loser || loser.bidder === bid.bidder) {
    return new Response("уведомлять некого", { status: 200 });
  }

  const { data: subs } = await db
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", loser.bidder);
  if (!subs?.length) return new Response("подписок нет", { status: 200 });

  // Подпись места - для человека, номером: «03», а не uuid.
  const { data: lot } = await db
    .from("lots")
    .select("thing_spots(label)")
    .eq("id", bid.lot_id)
    .single();
  const label = (lot?.thing_spots as { label?: string } | null)?.label ?? "";

  const payload = JSON.stringify({
    title: `You've been outbid${label ? ` on spot ${label}` : ""}`,
    body: `The bid is now $${(bid.amount_cents / 100).toFixed(2)}. There is still time to take it back.`,
    url: "https://app.oxar.app/",
  });

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
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
