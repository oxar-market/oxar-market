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
