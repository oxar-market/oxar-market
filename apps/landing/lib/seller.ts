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
  /** Куда течёт стрим. Без него покупатель не может открыть оплату. */
  payout_wallet: string | null;
};

export type MyListing = {
  id: string;
  kind: PlacementKind;
  pricing: Pricing;
  /** Как платят за это место: потоком или разом. */
  payment: "stream" | "transfer";
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

/**
 * Пустили ли этот аккаунт дальше вейтлиста. Решает база: список адресов ведём
 * мы руками, и продавец в нём не нужен - его пускает собственная строка.
 */
export async function hasAccess(): Promise<boolean> {
  if (!auth) return false;
  const { data } = await auth.rpc("has_access");
  return data === true;
}

/** Свои места. Фильтр по продавцу обязателен: витрина отдаёт и чужие активные. */
export async function myListings(sellerId: string): Promise<MyListing[]> {
  if (!auth) return [];
  const { data } = await auth
    .from("listings")
    .select("id,kind,pricing,payment,price_cents,term_days,active")
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

/**
 * Сменить свой хэндл. Уникальность держит индекс в базе: повтор приходит
 * кодом 23505. Смена снимает галочку - это делает триггер, тоже в базе.
 */
export async function setXHandle(
  sellerId: string,
  handle: string,
): Promise<"done" | "taken" | "error"> {
  if (!auth) return "error";
  const { error } = await auth
    .from("sellers")
    .update({ x_handle: handle })
    .eq("id", sellerId);

  if (!error) return "done";
  return error.code === "23505" ? "taken" : "error";
}

/** Снять с продажи или вернуть. */
export async function setActive(
  listingId: string,
  active: boolean,
): Promise<"done" | "error"> {
  if (!auth) return "error";
  const { error } = await auth.from("listings").update({ active }).eq("id", listingId);
  return error ? "error" : "done";
}

/**
 * Удалить место. Получится только у того, по которому не было ни одной брони и
 * ни одного торга: политика в базе отдаёт на удаление ровно такие. Место с
 * историей остаётся и просто снимается с продажи - иначе прошлые сделки
 * ссылались бы в пустоту.
 *
 * Ноль удалённых строк - это не сбой, а ответ «на нём уже что-то было».
 */
export async function deleteListing(
  listingId: string,
): Promise<"done" | "has_history" | "error"> {
  if (!auth) return "error";
  const { data, error } = await auth
    .from("listings")
    .delete()
    .eq("id", listingId)
    .select("id");

  if (error) return "error";
  return (data ?? []).length > 0 ? "done" : "has_history";
}

export type MyLot = {
  id: string;
  listing_id: string;
  start_date: string;
  end_date: string;
  reserve_cents: number;
  closes_at: string;
  status: string;
};

export async function myLots(): Promise<MyLot[]> {
  if (!auth) return [];
  const { data } = await auth
    .from("auctions")
    .select("id,listing_id,start_date,end_date,reserve_cents,closes_at,status")
    .order("closes_at", { ascending: false });
  return (data ?? []) as MyLot[];
}

export type LotBid = {
  id: string;
  created_at: string;
  bidder_handle: string;
  bidder_contact: string | null;
  amount_cents: number;
  creative_url: string | null;
  creative_text: string | null;
};

/** Ставки со контактом и креативом - только по своему лоту, отбор в базе. */
export async function lotBidsForSeller(lotId: string): Promise<LotBid[]> {
  if (!auth) return [];
  const { data } = await auth.rpc("bids_for_my_auction", { lot: lotId });
  return (data ?? []) as LotBid[];
}

export type LotDraft = {
  listing_id: string;
  start_date: string;
  end_date: string;
  reserve_cents: number;
  closes_at: string;
};

export async function openLot(
  draft: LotDraft,
): Promise<"done" | "overlap" | "too_late" | "error"> {
  if (!auth) return "error";
  const { error } = await auth.from("auctions").insert(draft);

  if (!error) return "done";
  if (error.code === "23505") return "overlap";
  // Торг обязан кончиться не позже, чем за сутки до начала размещения.
  if (error.message.includes("auctions_closes_before_start")) return "too_late";
  return "error";
}

export async function cancelLot(lotId: string): Promise<"done" | "error"> {
  if (!auth) return "error";
  const { error } = await auth
    .from("auctions")
    .update({ status: "cancelled" })
    .eq("id", lotId);
  return error ? "error" : "done";
}

/** Правка цены своего места. Тип места не меняем: это уже другое место. */
export async function updateListing(
  listingId: string,
  draft: Omit<ListingDraft, "kind">,
): Promise<"done" | "error"> {
  if (!auth) return "error";
  const { error } = await auth
    .from("listings")
    .update({
      pricing: draft.pricing,
      price_cents: draft.price_cents,
      term_days: draft.term_days,
    })
    .eq("id", listingId);
  return error ? "error" : "done";
}
