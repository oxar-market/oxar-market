"use client";

import { db } from "./session.ts";
import { photoUrl } from "./seller.ts";
import { zip } from "./zip.ts";

/**
 * Что печатать: верхняя ставка каждого места вещи. После закрытия торга -
 * победитель; пока торг идёт - лидер. Ставки открыты всем, поэтому и список
 * собирается из открытых данных; видит его владелец вещи в кабинете, а
 * после закрытия - всякий, кто открыл итоги торга на маркете.
 */
export type Winner = {
  lotId: string;
  spot: string;
  /** Код места: по нему логотип встаёт на модель. */
  code: string;
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
    .select("id, status, closes_at, thing_spots(label, sort, code), lot_bids(amount_cents, created_at, brand, media_url, bidder_wallet)")
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
    const spot = lot.thing_spots as unknown as { label: string; sort: number; code: string } | null;
    out.push({
      lotId: lot.id,
      spot: spot?.label ?? "Spot",
      code: spot?.code ?? "",
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

/**
 * Наши вещи (футболка и другие): что печатать. Видит их тот, на кого они
 * записаны, - во вкладке продавца, рядом со своими вещами. Печатаем мы, и
 * логотипы нужны тому, кто печатает.
 */
export type HouseThing = {
  id: string;
  title: string;
  cover: string | null;
  /** Последний срок закрытия её торгов - по нему свежие наверху. */
  closesAt: string;
  /** Торг ещё идёт - в списке лидеры, а не победители. */
  open: boolean;
};

export async function loadHouseThings(): Promise<HouseThing[]> {
  if (!db) return [];
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];
  const { data } = await db
    .from("things")
    .select("id, title, photos, lots(status, closes_at, rehearsal)")
    .eq("house", true)
    .eq("seller", auth.user.id);
  return (data ?? [])
    .map((one) => {
      // Прогоны до первого настоящего торга печатать не нужно.
      const lots = ((one.lots ?? []) as { status: string; closes_at: string; rehearsal: boolean }[])
        .filter((lot) => !lot.rehearsal && (lot.status === "open" || lot.status === "won"));
      const photos = (one.photos as string[] | null) ?? [];
      return {
        id: one.id,
        title: one.title,
        cover: photos[0] ? photoUrl(photos[0]) : null,
        closesAt: lots.map((lot) => lot.closes_at).sort().at(-1) ?? "",
        open: lots.some((lot) => lot.status === "open"),
      };
    })
    .filter((one) => one.closesAt)
    .sort((a, b) => b.closesAt.localeCompare(a.closesAt));
}

/**
 * Все логотипы вещи одним архивом. Имя файла - номер места и бренд, чтобы в
 * типографии не путали, что куда. Файлы качаются по очереди: их десяток, и
 * параллельность здесь ничего не решает.
 */
export async function downloadLogos(title: string, list: Winner[]): Promise<boolean> {
  const entries: { name: string; data: Uint8Array }[] = [];
  const taken = new Set<string>();
  for (const one of list) {
    const response = await fetch(one.mediaUrl);
    if (!response.ok) return false;
    const ext = (one.mediaUrl.split("?")[0]!.split(".").pop() ?? "png").toLowerCase().slice(0, 5);
    const base = `${one.spot} - ${one.brand}`.replace(/[\\/:*?"<>|]+/g, " ").trim();
    let name = `${base}.${ext}`;
    for (let k = 2; taken.has(name); k++) name = `${base} (${k}).${ext}`;
    taken.add(name);
    entries.push({ name, data: new Uint8Array(await response.arrayBuffer()) });
  }
  const blob = new Blob([zip(entries)], { type: "application/zip" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${title.replace(/[\\/:*?"<>|]+/g, " ").trim()} - logos.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  return true;
}
