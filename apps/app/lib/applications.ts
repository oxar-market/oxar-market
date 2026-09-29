"use client";

import { db } from "./session.ts";

/** Заявка в продавцы: подаёт человек, решает админ. */
export type Application = {
  userId: string;
  createdAt: string;
  wallet: string | null;
  contact: string;
  about: string | null;
  status: "waiting" | "approved" | "declined";
};

type Row = {
  user_id: string;
  created_at: string;
  wallet: string | null;
  contact: string;
  about: string | null;
  status: Application["status"];
};

const COLUMNS = "user_id, created_at, wallet, contact, about, status";

function fromRow(row: Row): Application {
  return {
    userId: row.user_id,
    createdAt: row.created_at,
    wallet: row.wallet,
    contact: row.contact,
    about: row.about,
    status: row.status,
  };
}

/** Своя заявка, если подавал. */
export async function myApplication(): Promise<Application | null> {
  if (!db) return null;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db
    .from("seller_applications")
    .select(COLUMNS)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  return data ? fromRow(data as Row) : null;
}

export async function applyAsSeller(input: {
  contact: string;
  about: string;
  wallet: string | null;
}): Promise<boolean> {
  if (!db) return false;
  const { error } = await db.from("seller_applications").insert({
    contact: input.contact.trim(),
    about: input.about.trim() || null,
    wallet: input.wallet,
  });
  return !error;
}

/** Ждущие решения заявки, старые сверху. Видны только админу. */
export async function loadApplications(): Promise<Application[]> {
  if (!db) return [];
  const { data } = await db
    .from("seller_applications")
    .select(COLUMNS)
    .eq("status", "waiting")
    .order("created_at");
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function decideSeller(userId: string, approve: boolean): Promise<boolean> {
  if (!db) return false;
  const { data, error } = await db.rpc("admin_decide_seller", { applicant: userId, approve });
  return !error && data === true;
}
