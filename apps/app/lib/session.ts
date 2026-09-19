"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Обмен личности Privy на сессию Supabase.
 *
 * Зачем это вообще. Supabase доверяет чужим токенам только от пяти провайдеров
 * (Clerk, Firebase, Auth0, Cognito, WorkOS); Privy в списке нет, и вписать
 * произвольный JWKS в дашборде нельзя. Поэтому токен Privy меняется на
 * настоящую сессию Supabase, и дальше RLS работает штатно через auth.uid().
 *
 * Почему не подписываем свой JWT сами: проект уже переехал на асимметричные
 * ключи (ES256), и токен, подписанный старым общим секретом, он не примет.
 * Вместо этого просим Supabase выпустить сессию самому - она подписана его же
 * ключом, обновляется штатным refresh, и своей криптографии у нас нет.
 *
 * Обмен делает edge-функция: только у неё есть service_role, и только она
 * умеет проверить подпись Privy. Браузер к ключу от базы не прикасается.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Клиент без сессии: им читают то, что открыто всем. */
export const db: SupabaseClient | null =
  url && anon
    ? createClient(url, anon, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export type Exchange =
  | { ok: true }
  | { ok: false; reason: "no-config" | "rejected" | "network" };

/**
 * Поменять токен Privy на сессию Supabase.
 *
 * Токен Privy живёт около часа, сессия Supabase обновляется сама, поэтому
 * звать это надо один раз после входа, а не на каждый запрос.
 */
export async function exchange(privyToken: string): Promise<Exchange> {
  if (!db || !url) return { ok: false, reason: "no-config" };

  try {
    const response = await fetch(`${url}/functions/v1/privy-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Анонимный ключ - для шлюза Supabase, он проверяет его сам. Токен
        // Privy идёт своим заголовком: чужой токен в Authorization шлюз
        // проверить не может и отбил бы запрос до функции.
        Authorization: `Bearer ${anon}`,
        "X-Privy-Token": privyToken,
      },
    });

    if (!response.ok) return { ok: false, reason: "rejected" };

    const { token_hash } = (await response.json()) as { token_hash: string };
    const { error } = await db.auth.verifyOtp({
      type: "email",
      token_hash,
    });

    return error ? { ok: false, reason: "rejected" } : { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}
