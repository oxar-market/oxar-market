"use client";

import { db } from "./session.ts";

/**
 * Настройки уведомлений человека. Почту сюда кладёт только сервер (из
 * identity-токена Privy), здесь - чтение и два переключателя писем.
 */

export type NotifySettings = { email: string | null; emailOn: boolean; emailOutbid: boolean };

export async function loadNotifySettings(): Promise<NotifySettings | null> {
  if (!db) return null;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db
    .from("notification_settings")
    .select("email, email_on, email_outbid")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!data) return null;
  return { email: data.email, emailOn: data.email_on, emailOutbid: data.email_outbid };
}

export async function saveNotifySetting(column: "email_on" | "email_outbid", value: boolean): Promise<boolean> {
  if (!db) return false;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return false;
  const { error } = await db.from("notification_settings").update({ [column]: value }).eq("user_id", auth.user.id);
  return !error;
}
