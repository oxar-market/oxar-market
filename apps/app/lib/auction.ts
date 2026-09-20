"use client";

import { db } from "./session.ts";

/**
 * Что показывает экран торга: вещь, её места, открытые лоты и ставки.
 *
 * Всё это витрина, и она открыта всем: политики на чтение в схеме стоят без
 * условия на вошедшего. Гость должен увидеть, за что идёт борьба, раньше чем у
 * него спросят, кто он.
 *
 * Запросы живут в приложении, а не в packages/core: там только правила и
 * вычисления. Когда за теми же данными придёт мобильное приложение, отсюда
 * вырастет отдельный пакет - но не раньше, чем появится второй потребитель.
 */

export type Thing = {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
};

export type Lot = {
  id: string;
  spot_id: string;
  /** Код места: по нему лот находит своё пятно на модели. */
  spot_code: string;
  status: string;
  reserve_cents: number;
  min_step_cents: number;
  closes_at: string;
};

export type Bid = {
  id: string;
  created_at: string;
  lot_id: string;
  bidder_wallet: string;
  amount_cents: number;
  media_url: string;
};

/** Имя вещи в адресе. Пока она одна, и это её код в каталоге. */
export const THING_SLUG = "superteam-ua-tee";

/**
 * Вещь и её торги одним заходом.
 *
 * Возвращает и те места, у которых торга нет: место без лота - это «пока не
 * продаётся», и на вещи оно всё равно нарисовано. Молчать о нём значило бы
 * показать футболку, у которой часть пятен необъяснимо пропала.
 */
export async function loadThing(): Promise<{
  thing: Thing;
  lots: Lot[];
} | null> {
  if (!db) return null;

  const { data: thing } = await db
    .from("things")
    .select("id, slug, title, tagline")
    .eq("slug", THING_SLUG)
    .maybeSingle();
  // Вещи в каталоге нет - значит и торгов нет. Это не сбой: так выглядит
  // момент между выкаткой экрана и заведением первого лота.
  if (!thing) return null;

  // Места нужны только затем, чтобы перевести spot_id лота в код места:
  // разметка на модели знает коды, а лот ссылается на строку каталога.
  const { data: spots } = await db
    .from("thing_spots")
    .select("id, code")
    .eq("thing_id", thing.id);

  const { data: lots } = await db
    .from("lots")
    .select("id, spot_id, status, reserve_cents, min_step_cents, closes_at")
    .eq("thing_id", thing.id)
    .eq("status", "open");

  const codeOf = new Map((spots ?? []).map((spot) => [spot.id, spot.code]));

  return {
    thing: thing as Thing,
    lots: (lots ?? []).flatMap((lot) => {
      const spot_code = codeOf.get(lot.spot_id);
      // Лот на место, которого нет в каталоге, показать негде. База такого не
      // допустит - внешний ключ, - но данные могли приехать из будущего, где
      // место убрали.
      return spot_code ? [{ ...lot, spot_code } as Lot] : [];
    }),
  };
}

/** Ставки лота: от высокой к низкой, как их и читают. */
export async function loadBids(lotId: string): Promise<Bid[]> {
  if (!db) return [];

  const { data } = await db
    .from("lot_bids")
    .select("id, created_at, lot_id, bidder_wallet, amount_cents, media_url")
    .eq("lot_id", lotId)
    .order("amount_cents", { ascending: false })
    .order("created_at", { ascending: true });

  return (data ?? []) as Bid[];
}

/** Верхние ставки всех лотов разом: для кружков в списке мест. */
export async function loadTopBids(
  lotIds: string[],
): Promise<Record<string, Bid | undefined>> {
  if (!db || lotIds.length === 0) return {};

  const { data } = await db
    .from("lot_bids")
    .select("id, created_at, lot_id, bidder_wallet, amount_cents, media_url")
    .in("lot_id", lotIds)
    .order("amount_cents", { ascending: false });

  const top: Record<string, Bid | undefined> = {};
  for (const bid of (data ?? []) as Bid[]) {
    // Строки идут от высокой к низкой, поэтому первая встреченная для лота -
    // и есть верхняя.
    if (!top[bid.lot_id]) top[bid.lot_id] = bid;
  }
  return top;
}

/** Короткий вид кошелька: первые и последние символы, как их и узнают. */
export function shortWallet(address: string): string {
  return address.length > 10
    ? `${address.slice(0, 4)}…${address.slice(-4)}`
    : address;
}
