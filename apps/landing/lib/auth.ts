"use client";

import { createClient, type Session } from "@supabase/supabase-js";

// Вход продавца: ссылка на почту, без пароля. Пароли пришлось бы восстанавливать,
// а продавцов у нас пока десятки - письмо проще и для них, и для нас.
//
// Здесь единственное место, где в лендинге живёт клиент supabase-js: сессию,
// обновление токена и его хранение писать руками нельзя.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const auth = url && anonKey ? createClient(url, anonKey) : null;

/**
 * Ссылка на вход. Новых пользователей не создаём: иначе любой адрес, введённый
 * в форму, заводил аккаунт и получал письмо от нас - то есть форма работала бы
 * рассылкой по чужим адресам. Продавца заводим руками, и с этого момента ссылка
 * ему приходит.
 */
export async function sendLink(email: string): Promise<"sent" | "unknown" | "error"> {
  if (!auth) return "error";
  const { error } = await auth.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
  });

  if (!error) return "sent";
  // Адреса нет среди заведённых. Supabase отвечает на это отдельным кодом, и
  // человеку надо сказать не «ошибка», а что делать дальше.
  return error.code === "otp_disabled" || error.status === 422 ? "unknown" : "error";
}

/**
 * Вход по коду из письма.
 *
 * Ссылка работает не везде. Во встроенном браузере кошелька почта открывает
 * ссылку в системном браузере - сессия оказывается в Safari, а человек остался
 * в Phantom, и войти туда, где лежит кошелёк, нельзя вообще никак. Код таким
 * свойством не обладает: его переносят руками.
 *
 * Письмо то же самое, это один и тот же одноразовый пароль - у Supabase ссылка
 * и код это две формы одного токена.
 */
export async function signInWithCode(
  email: string,
  code: string,
): Promise<"ok" | "bad" | "error"> {
  if (!auth) return "error";
  const { error } = await auth.auth.verifyOtp({ email, token: code, type: "email" });
  if (!error) return "ok";
  return error.status === 403 || error.status === 401 ? "bad" : "error";
}

export async function currentSession(): Promise<Session | null> {
  if (!auth) return null;
  const { data } = await auth.auth.getSession();
  return data.session;
}

export function onSessionChange(listen: (session: Session | null) => void): () => void {
  if (!auth) return () => {};
  const { data } = auth.auth.onAuthStateChange((_event, session) => listen(session));
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  await auth?.auth.signOut();
}
