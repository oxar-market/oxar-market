// Запись ставки в базу - только по подтверждённой транзакции в цепочке.
//
// Раньше браузер писал ставку в lot_bids сам, и политика проверяла лишь «ставишь
// за себя» и «торг открыт». Любой вошедший мог записать ставку на любую сумму,
// ничего не заплатив: на витрине вставал фальшивый лидер, честный участник не
// мог поставить, а в печать ушёл бы чужой логотип. Теперь браузер присылает
// только подпись транзакции, логотип и имя, а кто, на какой лот и сколько -
// функция читает из самой транзакции программы.
//
// Кошелёк из транзакции должен быть привязан к этому человеку (wallet_owners):
// связь заводит privy-session по подписанному Privy identity-токену.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { readBid, unitsToCents } from "./bid.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RPC = Deno.env.get("SOLANA_RPC") || "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = "4zBp61iGL7f9zybTfrtwydUZmM2WxRsskedqFNdHiDpe";

// Тот же список, что у privy-session: функцию зовёт только наш сайт.
const ORIGINS = new Set([
  "https://oxar.app",
  "https://app.oxar.app",
  "https://oxar-app.pages.dev",
  // Тестовый стенд на devnet: своя база, но функции те же.
  "https://oxar-test.pages.dev",
  "http://localhost:3000",
]);

function cors(origin: string | null): Record<string, string> {
  if (!origin || !ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "3600",
    Vary: "Origin",
  };
}

const UUID = /^[0-9a-f-]{36}$/;
const SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,100}$/;

/** Транзакция по подписи. Сразу после подтверждения нода может её ещё не отдать - пробуем несколько раз. */
async function transaction(signature: string): Promise<unknown> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
      }),
    });
    const body = await response.json().catch(() => null);
    if (body?.result) return body.result;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return null;
}

Deno.serve(async (request) => {
  const allow = cors(request.headers.get("Origin"));
  const reply = (status: number, error?: string) =>
    new Response(error ? JSON.stringify({ error }) : null, {
      status,
      headers: { ...allow, ...(error ? { "Content-Type": "application/json" } : {}) },
    });

  if (request.method === "OPTIONS") return reply(204);
  if (request.method !== "POST") return reply(405, "method");

  // Кто ставит - по его сессии Supabase, а не по присланному.
  const auth = request.headers.get("Authorization") ?? "";
  const asUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: who } = await asUser.auth.getUser();
  if (!who.user) return reply(401, "sign in");

  const body = await request.json().catch(() => null);
  const lotId = String(body?.lotId ?? "");
  const signature = String(body?.signature ?? "");
  const mediaUrl = String(body?.mediaUrl ?? "");
  const brand = String(body?.brand ?? "").trim().replace(/\s+/g, " ");
  if (!UUID.test(lotId) || !SIGNATURE.test(signature)) return reply(400, "bad request");
  // Логотип - только из нашего хранилища креативов.
  if (!mediaUrl.startsWith(`${SUPABASE_URL}/storage/v1/object/public/creatives/`)) return reply(400, "artwork");
  if (brand.length < 1 || brand.length > 40) return reply(400, "brand");

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: lot } = await admin.from("lots").select("id, chain_lot").eq("id", lotId).maybeSingle();
  if (!lot?.chain_lot) return reply(404, "lot");

  const bid = readBid((await transaction(signature)) as Parameters<typeof readBid>[0], PROGRAM_ID);
  if (!bid || bid.lot !== lot.chain_lot) return reply(422, "not a bid on this lot");
  const cents = unitsToCents(bid.units);
  if (cents === null) return reply(422, "amount");

  const { data: owner } = await admin.from("wallet_owners").select("user_id").eq("wallet", bid.bidder).maybeSingle();
  if (owner?.user_id !== who.user.id) return reply(403, "wallet");

  const { error } = await admin.from("lot_bids").insert({
    lot_id: lot.id,
    bidder: who.user.id,
    bidder_wallet: bid.bidder,
    amount_cents: cents,
    media_url: mediaUrl,
    brand,
    signature,
  });
  // Та же подпись уже записана - повтор того же запроса, а не новая ставка.
  if (error?.code === "23505") return reply(200);
  if (error) return reply(409, "rejected");
  return reply(200);
});
