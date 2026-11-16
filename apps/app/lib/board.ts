import { rankBidders, type Bidder } from "@oxar/core";
import { db } from "./session.ts";

/**
 * Рейтинг кабинета из публичных ставок - то же видит любой посетитель торга.
 * Как считать и в каком порядке - правило core.
 */
export async function loadBidders(): Promise<Bidder[]> {
  if (!db) return [];
  const [{ data: lots }, { data: bids }] = await Promise.all([
    db.from("lots").select("id, status, rehearsal, thing_id"),
    db.from("lot_bids").select("lot_id, amount_cents, bidder_wallet, brand, created_at"),
  ]);
  return rankBidders(lots ?? [], bids ?? []);
}
