"use client";

import { db } from "./session.ts";
import type { Bid, Lot } from "./auction.ts";

/**
 * Демо по ссылке `app.oxar.app/?demo`: торг футболки Superteam Ukraine, как
 * будто он ещё идёт. Нужен, чтобы показать интерфейс живого торга, когда
 * настоящего сейчас нет.
 *
 * Данные - настоящий закрытый торг 1 октября, сдвинутый во времени в самом
 * браузере: закрытие через двое суток, последняя ставка - сорок минут назад.
 * В базу и в цепочку ничего не пишется, ставка в демо не уходит. Ссылки на
 * демо на сайте нет - его видит только тот, кому её дали.
 */
export const DEMO = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("demo");

const DEMO_THING = "superteam-ua-tee";
/** День, когда закрылся показываемый торг. */
const DEMO_CLOSED_ON = "2026-10-01";

type Snapshot = { lots: (Lot & { thing_id: string })[]; bids: Bid[] };
let snapshot: Promise<Snapshot> | null = null;

export function demoSnapshot(): Promise<Snapshot> {
  snapshot ??= load();
  return snapshot;
}

async function load(): Promise<Snapshot> {
  if (!db) return { lots: [], bids: [] };
  const { data: thing } = await db.from("things").select("id").eq("slug", DEMO_THING).maybeSingle();
  if (!thing) return { lots: [], bids: [] };
  const { data: lots } = await db
    .from("lots")
    .select("id, spot_id, status, reserve_cents, min_step_cents, opens_at, closes_at, thing_id, thing_spots(code)")
    .eq("thing_id", thing.id)
    .eq("status", "won")
    .eq("rehearsal", false)
    .gte("closes_at", `${DEMO_CLOSED_ON}T00:00:00Z`)
    .lt("closes_at", `${DEMO_CLOSED_ON}T23:59:59Z`);
  const ids = (lots ?? []).map((one) => one.id);
  const { data: bids } = ids.length
    ? await db
        .from("lot_bids")
        .select("id, created_at, lot_id, bidder_wallet, amount_cents, media_url, brand")
        .in("lot_id", ids)
    : { data: [] };

  // Сдвиг времени: последняя ставка - сорок минут назад, закрытие - через
  // двое суток, по часу ровно. Порядок и промежутки между ставками свои.
  const last = Math.max(...((bids ?? []) as Bid[]).map((one) => Date.parse(one.created_at)), 0);
  const shift = last ? Date.now() - 40 * 60_000 - last : 0;
  const closes = new Date(Math.ceil((Date.now() + 2 * 86_400_000) / 3_600_000) * 3_600_000).toISOString();

  return {
    lots: (lots ?? []).flatMap((one) => {
      const code = (one.thing_spots as unknown as { code?: string } | null)?.code;
      if (!code) return [];
      return [
        {
          id: one.id,
          spot_id: one.spot_id,
          spot_code: code,
          status: "open",
          reserve_cents: one.reserve_cents,
          min_step_cents: one.min_step_cents,
          opens_at: null,
          closes_at: closes,
          thing_id: one.thing_id,
        },
      ];
    }),
    bids: ((bids ?? []) as Bid[]).map((one) => ({
      ...one,
      created_at: new Date(Date.parse(one.created_at) + shift).toISOString(),
    })),
  };
}

/** Ставки демо-лота: от высокой к низкой, как и настоящие. */
export async function demoBids(lotId: string): Promise<Bid[]> {
  const { bids } = await demoSnapshot();
  return bids
    .filter((one) => one.lot_id === lotId)
    .sort((a, b) => b.amount_cents - a.amount_cents || a.created_at.localeCompare(b.created_at));
}
