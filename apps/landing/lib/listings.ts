"use client";

import type { DayRange, PlacementKind, Pricing } from "@oxar/core";
import { auth } from "./auth";

// Витрина закрыта за вейтлистом: RLS отдаёт продавцов, листинги и занятые даты
// только одобренному аккаунту. Поэтому запросы идут под токеном сессии, а не
// публичным ключом - клиент supabase-js подставляет его сам.

export type Offer = {
  id: string;
  kind: PlacementKind;
  /** term - цена за весь срок, daily - за сутки. См. @oxar/core. */
  pricing: Pricing;
  price_cents: number;
  term_days: number;
  seller: {
    x_handle: string;
    display_name: string;
    follower_count: number;
    is_org: boolean;
  };
};

export async function offersFor(kind: PlacementKind): Promise<Offer[]> {
  if (!auth) return [];

  const { data } = await auth
    .from("listings")
    .select(
      "id,kind,pricing,price_cents,term_days,seller:sellers(x_handle,display_name,follower_count,is_org)",
    )
    .eq("active", true)
    .eq("kind", kind)
    .order("price_cents", { ascending: false });

  // Типов схемы у клиента нет, поэтому вложенного продавца он считает
  // массивом. Форму ответа задаёт сам запрос: один листинг - один продавец.
  return (data ?? []) as unknown as Offer[];
}

type BusyRow = { start_date: string; end_date: string };

/** Занятые отрезки листинга, без данных покупателя: их не отдаёт и сама view. */
export async function busyRanges(listingId: string): Promise<DayRange[]> {
  if (!auth) return [];

  const { data } = await auth
    .from("listing_busy")
    .select("start_date,end_date")
    .eq("listing_id", listingId);

  const rows = (data ?? []) as BusyRow[];
  return rows.map((row) => ({ startDate: row.start_date, endDate: row.end_date }));
}

export type PlacementRequest = {
  listing_id: string;
  buyer_handle: string;
  buyer_contact: string | null;
  creative_url: string | null;
  creative_text: string | null;
  start_date: string;
  end_date: string;
  price_cents: number;
};

export async function requestPlacement(
  request: PlacementRequest,
): Promise<"created" | "error"> {
  if (!auth) return "error";

  // Статус задаём здесь же: RLS не даст вставить ничего, кроме requested,
  // то есть покупатель не может сам себе одобрить бронь.
  const { error } = await auth
    .from("bookings")
    .insert({ ...request, status: "requested" });

  return error ? "error" : "created";
}
