"use client";

import { hasBuyerProtection } from "@oxar/core";
import { PublicKey } from "@solana/web3.js";
import { permitInstruction, readLot, readSale, revokePermitInstruction } from "./chain.ts";
import { signInPhantom } from "./arbiter.ts";
import type { Application } from "./applications.ts";
import { db } from "./session.ts";
import { listedSpots, SPOT_COLUMNS, type ListedSpot } from "./listing.ts";
import { photoUrl } from "./seller.ts";
import { reviewState } from "./thing-review.ts";

/**
 * Админка: мы сами. Проверяем присланные вещи, даём им имя, прикладываем
 * 3D-модель, ставим на ней места и выводим вещь на маркет.
 *
 * Права держит база (is_admin() в политиках), а не спрятанная кнопка: чужой
 * вошедший увидит пустой список и получит отказ на запись.
 */

export type AdminThing = {
  id: string;
  title: string;
  tagline: string | null;
  active: boolean;
  /** Спрятана с маркета после одобрения: торг в цепочке идёт дальше. */
  hidden: boolean;
  /** Продавец открыл торг в цепочке: есть лот не в черновике. */
  published: boolean;
  /** Цены идущего торга по местам - их проверяем до одобрения. */
  prices: { spotId: string; reserveCents: number; stepCents: number; opensAt: string | null; closesAt: string }[];
  /** Отклонена админом - и почему. */
  declinedReason: string | null;
  photos: string[];
  model: string | null;
  spots: ListedSpot[];
  createdAt: string;
  /** Наша вещь: её не одобряют и не отклоняют, но пруф к ней кладут здесь же. */
  house: boolean;
  /** Торг без пруфа: деньги продавцу сразу по закрытию. Ставит только админ, до публикации. */
  noLockup: boolean;
  /** id торга, на который в цепочке выдано разрешение без пруфа. */
  permitSale: string | null;
  /** Вещь подготовил админ за продавца. */
  prepared: boolean;
  /** Кошелёк продавца: ему выдаётся разрешение, им он и публикует. */
  sellerWallet: string | null;
  /** Черновики цен - видны, пока продавец не опубликовал. */
  drafts: { id: string; spotId: string; reserveCents: number; stepCents: number; closesAt: string }[];
  /** Опубликованные места: их торг читаем из цепочки. */
  openLots: string[];
  /**
   * Пути фото итогов в хранилище (колонка proof_photos). Это не пруф защиты
   * покупателя: тот шлёт продавец из кабинета, и деньги отпускает он.
   */
  proof: string[];
  /** Кто носит, где, когда и в чём особенность - как написал продавец. Пусто - не написано. */
  worn: { by: string; where: string; when: string; about: string };
};

export async function amIAdmin(): Promise<boolean> {
  if (!db) return false;
  const { data } = await db.rpc("is_admin");
  return data === true;
}

/**
 * Все вещи, новые сверху: продавцов - на проверку, наши - ради пруфа. Наши
 * заводятся миграциями, но фото в деле к ним прикладывают отсюда.
 */
export async function loadAdminThings(): Promise<AdminThing[]> {
  if (!db) return [];
  const { data } = await db
    .from("things")
    .select(`id, title, tagline, active, hidden, declined_reason, photos, model_url, created_at, house, permit_sale, prepared, seller_wallet, proof_photos, worn_by, worn_where, worn_when, worn_about, lots(id, status, spot_id, reserve_cents, min_step_cents, opens_at, closes_at), thing_spots(${SPOT_COLUMNS})`)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    tagline: row.tagline,
    active: row.active,
    hidden: row.hidden === true,
    published: ((row.lots ?? []) as { status: string }[]).some((lot) => lot.status !== "draft"),
    // Черновики админу не видны (политика лотов), а закрытые - прошлые торги.
    prices: ((row.lots ?? []) as {
      status: string; spot_id: string; reserve_cents: number; min_step_cents: number;
      opens_at: string | null; closes_at: string;
    }[])
      .filter((lot) => lot.status === "open")
      .map((lot) => ({
        spotId: lot.spot_id,
        reserveCents: lot.reserve_cents,
        stepCents: lot.min_step_cents,
        opensAt: lot.opens_at,
        closesAt: lot.closes_at,
      })),
    declinedReason: (row.declined_reason as string | null) ?? null,
    photos: ((row.photos as string[] | null) ?? []).map(photoUrl),
    model: (row.model_url as string) || null,
    spots: listedSpots((row.thing_spots ?? []) as Parameters<typeof listedSpots>[0]),
    createdAt: row.created_at,
    house: row.house === true,
    noLockup: row.permit_sale != null,
    permitSale: (row.permit_sale as string | null) ?? null,
    prepared: row.prepared === true,
    sellerWallet: (row.seller_wallet as string | null) ?? null,
    drafts: ((row.lots ?? []) as {
      id: string; status: string; spot_id: string; reserve_cents: number; min_step_cents: number; closes_at: string;
    }[])
      .filter((lot) => lot.status === "draft")
      .map((lot) => ({
        id: lot.id,
        spotId: lot.spot_id,
        reserveCents: lot.reserve_cents,
        stepCents: lot.min_step_cents,
        closesAt: lot.closes_at,
      })),
    openLots: ((row.lots ?? []) as { id: string; status: string }[])
      .filter((lot) => lot.status === "open")
      .map((lot) => lot.id),
    proof: (row.proof_photos as string[] | null) ?? [],
    worn: {
      by: (row.worn_by as string | null) ?? "",
      where: (row.worn_where as string | null) ?? "",
      when: (row.worn_when as string | null) ?? "",
      about: (row.worn_about as string | null) ?? "",
    },
  }));
}

export async function updateThing(
  id: string,
  patch: Partial<{
    title: string;
    tagline: string | null;
    active: boolean;
    hidden: boolean;
    permit_sale: string | null;
    model_url: string;
    proof_photos: string[];
    worn_by: string | null;
    worn_where: string | null;
    worn_when: string | null;
    worn_about: string | null;
  }>,
): Promise<boolean> {
  if (!db) return false;
  const { error } = await db.from("things").update(patch).eq("id", id);
  return !error;
}

/**
 * Решение по вещи продавца: одобрить (вещь выйдет на маркет, когда её торг
 * открыт) или отклонить - только с причиной, её увидит продавец.
 */
export async function reviewThing(id: string, approve: boolean, reason?: string): Promise<boolean> {
  if (!db) return false;
  const { data, error } = await db.rpc("admin_reviews_thing", { thing: id, approve, reason: reason ?? null });
  return !error && data === true;
}

/**
 * Режим торгов в цепочке совпадает с флагом вещи. Программа откроет торг без
 * пруфа любому продавцу, подписавшему его сам, мимо кабинета, - на маркет
 * такой торг выходит только у вещи, которой админ поставил «no money lockup».
 * Торг берём из самого места в цепочке, а не из chain_sale в базе: тот
 * пишет продавец. Не прочиталось - не одобряем: лучше переспросить, чем
 * пропустить. Ставка проверяет то же самое ещё раз - места продавец может
 * открыть и после одобрения.
 */
export async function saleModeOk(thing: AdminThing): Promise<boolean> {
  if (thing.noLockup) return true;
  const sales = await Promise.all(
    thing.openLots.map(async (lotId) => {
      const lot = await readLot(lotId).catch(() => null);
      return lot ? readSale(lot.sale).catch(() => null) : null;
    }),
  );
  return sales.every((sale) => sale !== null && hasBuyerProtection(sale));
}

/**
 * Выдать продавцу разрешение на торг без пруфа: id торга - новый, подпись -
 * админа в Phantom. Записываем в вещь только после того, как разрешение легло
 * в цепочку: без него кабинет открыл бы торг, который программа отвергнет.
 */
export async function grantPermit(thing: AdminThing): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!thing.sellerWallet) return { ok: false, why: "The seller has no wallet on this thing yet." };
  const seller = new PublicKey(thing.sellerWallet);
  const saleId = crypto.randomUUID();
  const sent = await signInPhantom((admin) => [permitInstruction(admin, saleId, seller)]);
  if (!sent.ok) return sent;
  return (await updateThing(thing.id, { permit_sale: saleId }))
    ? { ok: true }
    : { ok: false, why: `The permit is on chain (sale ${saleId}), but the thing did not save it. Try again.` };
}

/** Отозвать разрешение до публикации: аренда возвращается админу. */
export async function dropPermit(thing: AdminThing): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!thing.permitSale) return { ok: true };
  const saleId = thing.permitSale;
  const sent = await signInPhantom((admin) => [revokePermitInstruction(admin, saleId)]);
  if (!sent.ok) return sent;
  return (await updateThing(thing.id, { permit_sale: null }))
    ? { ok: true }
    : { ok: false, why: "The permit is revoked on chain, but the thing did not save it. Try again." };
}

export type PreparedSpot = { label: string; reserveCents: number; stepCents: number };

/**
 * Подготовить аукцион за продавца: вещь, места и черновики цен. Публикует его
 * сам продавец - своим кошельком, - и выплата уходит ему. Модель и
 * расположение мест на ней админ задаёт потом на странице вещи.
 */
export async function prepareThing(input: {
  seller: Application;
  title: string;
  closesAt: string;
  proofBy: string;
  spots: PreparedSpot[];
  worn: { by: string; where: string; when: string; about: string };
}): Promise<string | null> {
  if (!db || input.spots.length === 0) return null;
  const id = crypto.randomUUID();
  const { error } = await db.from("things").insert({
    id,
    slug: `thing-${id.slice(0, 8)}`,
    title: input.title,
    model_url: "",
    seller: input.seller.userId,
    seller_wallet: input.seller.wallet,
    stage: "ready",
    active: false,
    prepared: true,
    worn_by: input.worn.by || null,
    worn_where: input.worn.where || null,
    worn_when: input.worn.when || null,
    worn_about: input.worn.about || null,
  });
  if (error) return null;
  const spots = input.spots.map((spot, at) => ({
    id: crypto.randomUUID(),
    thing_id: id,
    code: `spot_${at + 1}`,
    label: spot.label,
    sort: at,
  }));
  const { error: spotError } = await db.from("thing_spots").insert(spots);
  if (spotError) return null;
  const { error: lotError } = await db.from("lots").insert(
    input.spots.map((spot, at) => ({
      thing_id: id,
      spot_id: spots[at]!.id,
      kind: "auction",
      status: "draft",
      reserve_cents: spot.reserveCents,
      min_step_cents: spot.stepCents,
      closes_at: input.closesAt,
      proof_by: input.proofBy,
    })),
  );
  return lotError ? null : id;
}

/** Ждёт решения: не одобрена, не спрятана после одобрения и не отклонена. */
export function awaitsReview(thing: AdminThing): boolean {
  const state = reviewState(thing);
  return state === "draft" || state === "awaiting";
}

/** Модель уезжает в публичное хранилище models; в вещь пишется её адрес. */
export async function uploadModel(thingId: string, file: File): Promise<string | null> {
  if (!db) return null;
  const path = `${thingId}/${crypto.randomUUID()}.glb`;
  const { error } = await db.storage
    .from("models")
    .upload(path, file, { contentType: "model/gltf-binary", upsert: false });
  if (error) return null;
  const url = db.storage.from("models").getPublicUrl(path).data.publicUrl;
  return (await updateThing(thingId, { model_url: url })) ? url : null;
}

/**
 * Фото итогов (колонка по старой памяти зовётся proof_photos): в хранилище
 * things, папка proof/<вещь>/, и путь - в список у вещи. Грузим по одному: их несколько, и отказ на одном не должен терять
 * остальные.
 */
export async function uploadProof(thingId: string, files: File[], had: string[]): Promise<boolean> {
  if (!db) return false;
  const paths = [...had];
  for (const file of files) {
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
    const path = `proof/${thingId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await db.storage
      .from("things")
      .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
    if (error) return false;
    paths.push(path);
  }
  return updateThing(thingId, { proof_photos: paths });
}

export async function saveSpotGeo(spotId: string, geo: NonNullable<ListedSpot["geo"]>): Promise<boolean> {
  if (!db) return false;
  const { error } = await db
    .from("thing_spots")
    .update({ height: geo.height, azimuth: geo.azimuth, size_w: geo.size[0], size_h: geo.size[1] })
    .eq("id", spotId);
  return !error;
}
