"use client";

import type { PlacementKind, Pricing } from "@oxar/core";
import { auth } from "./auth";

// Запросы кабинета. Прав на них у анонима нет: RLS отдаёт свои места и свои
// заявки только тому, чей адрес в токене совпадает с адресом продавца.

export type MySeller = {
  id: string;
  x_handle: string;
  display_name: string;
  follower_count: number;
  /** Онбординг ручной: пока мы не проверили аккаунт, места в витрину не идут. */
  verified: boolean;
};

export type MyListing = {
  id: string;
  kind: PlacementKind;
  pricing: Pricing;
  price_cents: number;
  term_days: number;
  active: boolean;
};

export type MyBooking = {
  id: string;
  listing_id: string;
  buyer_handle: string;
  buyer_contact: string | null;
  creative_url: string | null;
  creative_text: string | null;
  start_date: string;
  end_date: string;
  price_cents: number;
  status: string;
};

/**
 * Продавец, привязанный к вошедшему адресу. null - вошёл, но продавцом не
 * заведён: онбординг ручной. Отбирает база, потому что адрес входа от API
 * закрыт и отфильтровать по нему на клиенте нельзя.
 */
export async function mySeller(): Promise<MySeller | null> {
  if (!auth) return null;
  const { data } = await auth.rpc("my_seller");
  const rows = (data ?? []) as MySeller[];
  return rows[0] ?? null;
}

/** Свои места. Фильтр по продавцу обязателен: витрина отдаёт и чужие активные. */
export async function myListings(sellerId: string): Promise<MyListing[]> {
  if (!auth) return [];
  const { data } = await auth
    .from("listings")
    .select("id,kind,pricing,price_cents,term_days,active")
    .eq("seller_id", sellerId)
    .order("kind");
  return (data ?? []) as MyListing[];
}

export async function myBookings(): Promise<MyBooking[]> {
  if (!auth) return [];
  const { data } = await auth
    .from("bookings")
    .select(
      "id,listing_id,buyer_handle,buyer_contact,creative_url,creative_text,start_date,end_date,price_cents,status",
    )
    .order("start_date");
  return (data ?? []) as MyBooking[];
}

export async function decide(
  bookingId: string,
  status: "approved" | "rejected",
): Promise<"done" | "taken" | "error"> {
  if (!auth) return "error";
  const { error } = await auth.from("bookings").update({ status }).eq("id", bookingId);

  if (!error) return "done";
  // Констрейнт на пересечение: те же дни уже отданы другому покупателю.
  return error.code === "23P01" ? "taken" : "error";
}

export type ListingDraft = {
  kind: PlacementKind;
  pricing: Pricing;
  price_cents: number;
  term_days: number;
};

/** Выставить место. Одно место одного типа на продавца - повтор ловит база. */
export async function addListing(
  sellerId: string,
  draft: ListingDraft,
): Promise<"done" | "duplicate" | "error"> {
  if (!auth) return "error";
  const { error } = await auth
    .from("listings")
    .insert({ seller_id: sellerId, ...draft });

  if (!error) return "done";
  return error.code === "23505" ? "duplicate" : "error";
}

/** Снять с продажи или вернуть. Место не удаляем: на нём висят прошлые сделки. */
export async function setActive(
  listingId: string,
  active: boolean,
): Promise<"done" | "error"> {
  if (!auth) return "error";
  const { error } = await auth.from("listings").update({ active }).eq("id", listingId);
  return error ? "error" : "done";
}
