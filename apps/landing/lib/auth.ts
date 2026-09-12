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

export async function sendLink(email: string): Promise<"sent" | "error"> {
  if (!auth) return "error";
  const { error } = await auth.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? "error" : "sent";
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
