"use client";

import { db } from "./session.ts";

/**
 * Что печатать: верхняя ставка каждого места вещи. После закрытия торга -
 * победитель; пока торг идёт - лидер. Ставки открыты всем, поэтому и список
 * собирается из открытых данных; видит его владелец вещи в кабинете и мы в
 * админке.
 */
export type Winner = {
  lotId: string;
  spot: string;
  /** Торг закрыт с победителем - или ещё идёт, и это лидер. */
  status: "won" | "leading";
  brand: string;
  amountCents: number;
  mediaUrl: string;
  wallet: string;
  closesAt: string;
};

export async function loadWinners(thingId: string): Promise<Winner[]> {
  if (!db) return [];
  const { data } = await db
    .from("lots")
    .select("id, status, closes_at, thing_spots(label, sort), lot_bids(amount_cents, created_at, brand, media_url, bidder_wallet)")
    .eq("thing_id", thingId)
    .in("status", ["open", "won"])
    .eq("rehearsal", false);
  const out: (Winner & { sort: number })[] = [];
  for (const lot of data ?? []) {
    const bids = ((lot.lot_bids as unknown as {
      amount_cents: number; created_at: string; brand: string; media_url: string; bidder_wallet: string;
    }[] | null) ?? []).sort(
      (a, b) => b.amount_cents - a.amount_cents || a.created_at.localeCompare(b.created_at),
    );
    const top = bids[0];
    if (!top) continue;
    const spot = lot.thing_spots as unknown as { label: string; sort: number } | null;
    out.push({
      lotId: lot.id,
      spot: spot?.label ?? "Spot",
      sort: spot?.sort ?? 0,
      status: lot.status === "won" ? "won" : "leading",
      brand: top.brand,
      amountCents: top.amount_cents,
      mediaUrl: top.media_url,
      wallet: top.bidder_wallet,
      closesAt: lot.closes_at,
    });
  }
  return out.sort((a, b) => a.sort - b.sort);
}
