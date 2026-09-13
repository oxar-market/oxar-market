"use client";

import type { PlacementKind } from "@oxar/core";
import { auth } from "./auth";

// Лоты и ставки закрыты так же, как витрина: их видит только одобренный
// аккаунт, поэтому запросы идут под токеном сессии. Суммы ставок внутри
// открыты всем, кого пустили, а контакт с креативом - только продавцу лота.

export type Lot = {
  id: string;
  start_date: string;
  end_date: string;
  reserve_cents: number;
  closes_at: string;
  status: string;
  listing: {
    kind: PlacementKind;
    seller: { x_handle: string; follower_count: number; is_org: boolean };
  };
};

export type PublicBid = {
  id: string;
  created_at: string;
  bidder_handle: string;
  amount_cents: number;
};

/**
 * Закрыть то, у чего вышел срок. Дёргаем перед чтением лотов: закрытие не
 * должно зависеть от того, жив ли планировщик.
 */
export async function closeDueLots(): Promise<void> {
  if (!auth) return;
  await auth.rpc("close_due_auctions");
}

export async function openLots(kind: PlacementKind): Promise<Lot[]> {
  if (!auth) return [];

  const { data } = await auth
    .from("auctions")
    .select(
      "id,start_date,end_date,reserve_cents,closes_at,status," +
        "listing:listings!inner(kind,seller:sellers!inner(x_handle,follower_count,is_org))",
    )
    .eq("status", "open")
    .eq("listing.kind", kind)
    .order("closes_at");

  // Как и в витрине: без типов схемы вложенные листинг и продавец выводятся
  // массивами, хотя запрос отдаёт по одному.
  return (data ?? []) as unknown as Lot[];
}

export async function lotBids(lotId: string): Promise<PublicBid[]> {
  if (!auth) return [];

  const { data } = await auth
    .from("bids")
    .select("id,created_at,bidder_handle,amount_cents")
    .eq("auction_id", lotId)
    .order("amount_cents", { ascending: false })
    .order("created_at");

  return (data ?? []) as PublicBid[];
}

export type NewBid = {
  auction_id: string;
  bidder_handle: string;
  bidder_contact: string | null;
  amount_cents: number;
  creative_url: string | null;
  creative_text: string | null;
};

/**
 * Поставить. Проверки шага и срока живут в базе, поэтому её отказ - это не
 * ошибка связи, а ответ: «поздно» или «мало».
 */
export async function placeBid(
  bid: NewBid,
): Promise<"placed" | "closed" | "low" | "error"> {
  if (!auth) return "error";

  const { error } = await auth.from("bids").insert(bid);
  if (!error) return "placed";

  const text = error.message;
  if (text.includes("has closed") || text.includes("not taking bids")) return "closed";
  if (text.includes("bid must be at least")) return "low";
  return "error";
}
