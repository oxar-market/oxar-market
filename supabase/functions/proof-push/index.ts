// Пуш победителям: «продавец показал пруф, у тебя 72 часа проверить».
//
// Окно на спор короткое, и молчание в нём - это «да»: не заметил пруф -
// деньги ушли продавцу. Поэтому победителю нужен сигнал в тот же момент, а не
// когда он сам откроет приложение.
//
// Будит функцию триггер на новом пруфе. Телу запроса не верим: из него берётся
// только адрес торга, остальное перечитывается из базы серверным ключом.

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
  const sale = body?.record?.sale;
  if (typeof sale !== "string") return new Response("нет торга", { status: 400 });

  // Пуш - один на торг. Функцию можно позвать снаружи: анонимный ключ
  // публичен. Поэтому сначала атомарно ставим отметку, и только тот вызов,
  // что её поставил, рассылает - остальные уходят ни с чем.
  const { data: claimed } = await db
    .from("proofs")
    .update({ pushed_at: new Date().toISOString() })
    .eq("sale", sale)
    .is("pushed_at", null)
    .select("sale, thing_id");
  if (!claimed?.length) return new Response("пруфа нет или пуш уже ушёл", { status: 200 });

  // Места этого торга с победителем и их верхние ставки.
  const { data: lots } = await db
    .from("lots")
    .select("id, thing_spots(label), things:thing_id(title)")
    .eq("chain_sale", sale)
    .eq("status", "won");
  if (!lots?.length) return new Response("победителей нет", { status: 200 });

  let sent = 0;
  for (const lot of lots) {
    const { data: top } = await db
      .from("lot_bids")
      .select("bidder")
      .eq("lot_id", lot.id)
      .order("amount_cents", { ascending: false })
      .limit(1);
    const winner = top?.[0]?.bidder;
    if (!winner) continue;

    const { data: subs } = await db
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", winner);
    const label = (lot.thing_spots as { label?: string } | null)?.label ?? "";
    const title = (lot.things as { title?: string } | null)?.title ?? "";
    const payload = JSON.stringify({
      title: `Proof is in${label ? ` for spot ${label}` : ""}`,
      body: `The seller showed ${title || "the thing"} with your logo. Check it within 72 hours, or the payment goes to the seller.`,
      url: "https://app.oxar.app/",
    });

    for (const sub of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        sent += 1;
      } catch (error) {
        const gone = (error as { statusCode?: number }).statusCode;
        if (gone === 404 || gone === 410) {
          await db.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          console.error("пуш не ушёл:", sub.endpoint.slice(0, 40), error);
        }
      }
    }
  }
  return new Response(`отправлено: ${sent}`, { status: 200 });
});
