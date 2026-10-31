"use client";

import { closeDay, imageExt, isCreativeUrl, originalUrl } from "@oxar/core";
import { db } from "./session.ts";
import { photoUrl } from "./seller.ts";
import { zip } from "./zip.ts";

const STORAGE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

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
  /** Чем торг разобрали в цепочке. Пусто у разобранных до того, как её стали хранить. */
  settleSignature: string | null;
};

export async function loadWinners(thingId: string): Promise<Winner[]> {
  if (!db) return [];
  const { data } = await db
    .from("lots")
    .select("id, status, closes_at, settle_signature, thing_spots(label, sort, code), lot_bids(amount_cents, created_at, brand, media_url, bidder_wallet)")
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
      settleSignature: lot.settle_signature ?? null,
    });
  }
  return out.sort((a, b) => a.sort - b.sort);
}

/**
 * Фото каждой ставки вещи, а не только верхней: всё, что участники
 * загружали, когда ставили. Смотрят админ (любая вещь) и продавец (своя).
 * Прогоны не берём - это наши тесты.
 */
export type BidPhoto = {
  spot: string;
  brand: string;
  amountCents: number;
  mediaUrl: string;
  wallet: string;
  at: string;
  /** Выиграла, ведёт сейчас или её перебили. */
  tag: "won" | "leading" | "outbid";
};

export async function loadBidPhotos(thingId: string): Promise<BidPhoto[]> {
  if (!db) return [];
  const { data } = await db
    .from("lots")
    .select("status, thing_spots(label, sort), lot_bids(amount_cents, created_at, brand, media_url, bidder_wallet)")
    .eq("thing_id", thingId)
    .eq("rehearsal", false);
  const out: (BidPhoto & { sort: number })[] = [];
  for (const lot of data ?? []) {
    const spot = lot.thing_spots as unknown as { label: string; sort: number } | null;
    const bids = ((lot.lot_bids as unknown as {
      amount_cents: number; created_at: string; brand: string; media_url: string; bidder_wallet: string;
    }[] | null) ?? []).sort(
      (a, b) => b.amount_cents - a.amount_cents || a.created_at.localeCompare(b.created_at),
    );
    bids.forEach((bid, i) =>
      // Чужой адрес вместо файла из нашего бакета - не показываем.
      isCreativeUrl(bid.media_url, STORAGE) &&
      out.push({
        spot: spot?.label ?? "Spot",
        sort: spot?.sort ?? 0,
        brand: bid.brand,
        amountCents: bid.amount_cents,
        mediaUrl: bid.media_url,
        wallet: bid.bidder_wallet,
        at: bid.created_at,
        tag: i === 0 && lot.status === "won" ? "won" : i === 0 && lot.status === "open" ? "leading" : "outbid",
      }),
    );
  }
  return out.sort((a, b) => a.sort - b.sort || b.amountCents - a.amountCents);
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
export async function downloadLogos(
  title: string,
  list: { spot: string; brand: string; mediaUrl: string }[],
): Promise<boolean> {
  const entries: { name: string; data: Uint8Array }[] = [];
  const taken = new Set<string>();
  for (const one of list) {
    // Типографии - оригинал, а не лёгкая копия сайта.
    const url = originalUrl(one.mediaUrl);
    // Ссылку пишет участник: качаем только файлы из нашего бакета.
    if (!isCreativeUrl(url, STORAGE)) continue;
    const response = await fetch(url);
    if (!response.ok) return false;
    const ext = imageExt(url);
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

/**
 * Размещения без торга: место, бренд, логотип. На экране итогов - те же
 * строки, что победители, только без суммы и подписи: ставок не было.
 */
export async function loadPlacements(thingId: string): Promise<Winner[]> {
  if (!db) return [];
  const { data } = await db
    .from("placements")
    .select("id, code, label, brand, media_url, sort")
    .eq("thing_id", thingId)
    .order("sort");
  return (data ?? []).map((one) => ({
    lotId: one.id,
    spot: one.label,
    code: one.code,
    status: "won" as const,
    brand: one.brand,
    amountCents: 0,
    mediaUrl: photoUrl(one.media_url),
    wallet: "",
    closesAt: "",
    settleSignature: null,
  }));
}

/** Фото вещи в деле - адресами. Пусто - пруфа ещё нет. */
export async function loadProof(thingId: string): Promise<string[]> {
  if (!db) return [];
  const { data } = await db.from("things").select("proof_photos").eq("id", thingId).maybeSingle();
  return ((data?.proof_photos as string[] | null) ?? []).map(photoUrl);
}

/** Одна ставка в истории торга: кто, на какое место, когда и сколько. */
export type BidEvent = {
  at: string;
  code: string;
  spot: string;
  brand: string;
  amountCents: number;
  mediaUrl: string;
};

/** Торг целиком для экрана итогов: ставки по времени и цифры полосы. */
export type Timeline = {
  events: BidEvent[];
  /** Сколько мест было на торгах в этот день. */
  spots: number;
  /** Сумма стартовых цен проданных мест - от неё считается рост. */
  startCents: number;
};

/**
 * Все ставки вещи за один торг, по времени. Из них экран итогов
 * проматывает, как менялись логотипы на местах. Торг - это день закрытия:
 * у вещи их бывает несколько, и чужие сюда не подмешиваем.
 */
export async function loadBidTimeline(thingId: string, closesOn: string): Promise<Timeline> {
  if (!db) return { events: [], spots: 0, startCents: 0 };
  const { data } = await db
    .from("lots")
    .select("closes_at, status, reserve_cents, thing_spots(label, code), lot_bids(created_at, amount_cents, brand, media_url)")
    .eq("thing_id", thingId)
    .in("status", ["won", "unsold", "refunded"])
    .eq("rehearsal", false);
  const out: BidEvent[] = [];
  let spots = 0;
  let startCents = 0;
  for (const lot of data ?? []) {
    if (closeDay(lot.closes_at) !== closeDay(closesOn)) continue;
    spots += 1;
    if (lot.status === "won") startCents += (lot.reserve_cents as number | null) ?? 0;
    const spot = lot.thing_spots as unknown as { label: string; code: string } | null;
    for (const bid of (lot.lot_bids as unknown as {
      created_at: string; amount_cents: number; brand: string; media_url: string;
    }[] | null) ?? []) {
      out.push({
        at: bid.created_at,
        code: spot?.code ?? "",
        spot: spot?.label ?? "Spot",
        brand: bid.brand,
        amountCents: bid.amount_cents,
        mediaUrl: bid.media_url,
      });
    }
  }
  return { events: out.sort((a, b) => a.at.localeCompare(b.at)), spots, startCents };
}
