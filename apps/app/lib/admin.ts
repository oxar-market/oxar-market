"use client";

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
    .select(`id, title, tagline, active, hidden, declined_reason, photos, model_url, created_at, house, proof_photos, worn_by, worn_where, worn_when, worn_about, lots(status, spot_id, reserve_cents, min_step_cents, opens_at, closes_at), thing_spots(${SPOT_COLUMNS})`)
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
