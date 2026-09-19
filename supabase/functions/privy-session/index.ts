// Обмен токена Privy на сессию Supabase.
//
// Браузер присылает токен Privy, функция проверяет его подпись по открытому
// JWKS Privy и, если он настоящий, просит Supabase выпустить сессию для того
// же человека. Обратно уходит одноразовый token_hash, который браузер меняет
// на сессию через verifyOtp.
//
// Почему так, а не «Supabase доверяет токену Privy напрямую»: Supabase
// принимает чужие токены только от пяти провайдеров, Privy среди них нет.
// Почему не подписываем свой JWT: проект на асимметричных ключах, свой токен
// он не примет, да и своя криптография тут лишняя.
//
// Ключ service_role живёт только здесь. В браузер он не попадает никогда.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5";

const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Ключи Privy тянутся один раз и кэшируются самим jose: на каждый вход в сеть
// ходить незачем, а ротацию он подхватит сам.
const jwks = createRemoteJWKSet(
  new URL(`https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json`),
);

/**
 * Почта, под которой человек живёт в Supabase.
 *
 * Настоящей почты у нас может и не быть - человек мог войти кошельком. Поэтому
 * адрес собирается из его идентификатора Privy: он уникален, неизменен и
 * никому не отправляется. Домен намеренно несуществующий, чтобы письмо туда
 * невозможно было отправить даже по ошибке.
 *
 * ЭТО КОНТРАКТ, А НЕ ДЕТАЛЬ. По этому адресу человек опознаётся при каждом
 * следующем входе. Поменяется формула - для того же человека заведётся новый
 * аккаунт, и он потеряет свои ставки.
 *
 * Но тихо это не пройдёт: privy_id в identities уникален, поэтому вставка
 * строки с новым user_id и старым privy_id упрётся в ограничение, и функция
 * вернёт 500. Ошибка будет громкой - это и есть страховка.
 *
 * В packages/core не вынесено и вынесено не будет, пока вызывающий один:
 * edge-функции собираются в бандл только из supabase/functions, импорт извне
 * туда не попадёт. Понадобится второй вызывающий внутри функций - появится
 * supabase/functions/_shared.
 */
function mailbox(privyId: string): string {
  return `${privyId.replace(/[^a-zA-Z0-9]/g, "-")}@privy.invalid`;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Токен Privy идёт своим заголовком, а не в Authorization. Authorization
  // проверяет сама платформа Supabase и чужой токен туда класть нельзя: запрос
  // отбивался бы на шлюзе, не доходя сюда. Заодно так остаётся включённой
  // штатная проверка анонимного ключа - лишний барьер перед функцией.
  const token = request.headers.get("X-Privy-Token") ?? "";
  if (!token) return new Response("No token", { status: 401 });

  // Подпись, издатель и получатель - все три. Без проверки aud чужое
  // приложение Privy могло бы войти к нам своим токеном.
  let privyId: string;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: "privy.io",
      audience: PRIVY_APP_ID,
    });
    if (!payload.sub) throw new Error("no sub");
    privyId = payload.sub;
  } catch {
    return new Response("Bad token", { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  // generateLink заодно заводит человека, если его ещё нет, поэтому отдельной
  // регистрации не требуется: первый вход и есть регистрация.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: mailbox(privyId),
  });

  if (error || !data.properties?.hashed_token) {
    return new Response("Could not issue a session", { status: 500 });
  }

  // Связь «кто это у Privy» с «кто это у нас». Нужна, чтобы политики RLS и
  // остальная база знали человека по одному идентификатору.
  await admin
    .from("identities")
    .upsert(
      { user_id: data.user.id, privy_id: privyId },
      { onConflict: "user_id" },
    );

  return new Response(
    JSON.stringify({ token_hash: data.properties.hashed_token }),
    { headers: { "Content-Type": "application/json" } },
  );
});
