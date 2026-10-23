"use client";

import { db } from "./session.ts";
import { readOrders, readSheet, type ChainSheet } from "./chain.ts";

/**
 * Стикеры на вещи: цена одна, перебить нельзя.
 *
 * Деньги и лимит - в цепочке: лист знает цену, сколько всего и сколько
 * продано, а покупка сама делит деньги между продавцом и площадкой. В базе
 * только то, что печатать. Строка показывается, только если в цепочке есть
 * покупка с её id тегом: строка без оплаты - черновик, которого никто не видит.
 */

/** Ван: сто по $100 - их админка предлагает по умолчанию; цена и лимит уходят в лист. */
export const STICKER_PRICE_CENTS = 10_000;
export const STICKER_CAP = 100;

/**
 * Размер в сантиметрах. Выбора нет: все стикеры 10 на 10. Полоса 12 на 6
 * осталась в схеме базы и у ранних тестовых покупок, поэтому тип её знает.
 */
export type StickerSize = "10x10" | "12x6";

export type PaidSticker = {
  id: string;
  name: string;
  size: StickerSize;
  logoUrl: string;
  count: number;
};

/** Лист в цепочке и оплаченные стикеры. null - листа нет или не прочитался. */
export async function loadStickers(
  thingId: string,
  sheetId: string,
): Promise<{ sheet: ChainSheet; paid: PaidSticker[] } | null> {
  const sheet = await readSheet(sheetId).catch(() => null);
  if (!sheet || !db) return null;
  const orders = await readOrders(sheetId, sheet.cap);
  if (orders.length === 0) return { sheet, paid: [] };

  const { data } = await db
    .from("stickers")
    .select("id, name, size, logo_url")
    .eq("thing_id", thingId)
    .in("id", orders.map((order) => order.tag));
  const rows = new Map((data ?? []).map((row) => [row.id as string, row]));

  // Порядок - как покупали: по первому номеру покупки.
  const paid = orders
    .sort((a, b) => a.first - b.first)
    .flatMap((order) => {
      const row = rows.get(order.tag);
      return row
        ? [{ id: row.id, name: row.name, size: row.size as StickerSize, logoUrl: row.logo_url, count: order.count }]
        : [];
    });
  return { sheet, paid };
}

/**
 * Завести строку стикера до оплаты. Её id уходит в покупку тегом; заведи
 * строку после, и подсмотревший покупку успел бы занять тег своей строкой.
 */
export async function draftSticker(row: {
  id: string;
  thingId: string;
  name: string;
  size: StickerSize;
  logoUrl: string;
}): Promise<boolean> {
  if (!db) return false;
  const { error } = await db.from("stickers").insert({
    id: row.id,
    thing_id: row.thingId,
    name: row.name,
    size: row.size,
    logo_url: row.logoUrl,
  });
  return !error;
}
