import { rankBidders, type Bidder } from "@oxar/core";
import { db } from "./session.ts";

/**
 * Рейтинг кабинета из публичных ставок - то же видит любой посетитель торга.
 * Как считать и в каком порядке - правило core.
 */
export async function loadBidders(): Promise<Bidder[]> {
  if (!db) return [];
  const [{ data: lots }, { data: bids }, { data: back }] = await Promise.all([
    db.from("lots").select("id, status, rehearsal, thing_id"),
    db.from("lot_bids").select("lot_id, amount_cents, bidder_wallet, brand, created_at"),
    // Вещи, деньги за которые вернули мимо программы: их места не оплачены.
    db.from("things").select("id").not("refunded_at", "is", null),
  ]);
  const refunded = new Set((back ?? []).map((one) => one.id as string));
  return rankBidders((lots ?? []).map((lot) => ({ ...lot, refunded: refunded.has(lot.thing_id) })), bids ?? []);
}
