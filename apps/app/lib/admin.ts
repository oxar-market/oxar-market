"use client";

import { db } from "./session.ts";
import { listedSpots, SPOT_COLUMNS, type ListedSpot } from "./listing.ts";
import { photoUrl } from "./seller.ts";

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
  /** Продавец открыл торг в цепочке: есть лот не в черновике. */
  published: boolean;
  /** Отклонена админом - и почему. */
  declinedReason: string | null;
  photos: string[];
  model: string | null;
  spots: ListedSpot[];
  createdAt: string;
  /** Наша вещь: её не одобряют и не отклоняют, но пруф к ней кладут здесь же. */
  house: boolean;
  /** Пути фото пруфа в хранилище. */
  proof: string[];
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
    .select(`id, title, tagline, active, declined_reason, photos, model_url, created_at, house, proof_photos, lots(status), thing_spots(${SPOT_COLUMNS})`)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    tagline: row.tagline,
    active: row.active,
    published: ((row.lots ?? []) as { status: string }[]).some((lot) => lot.status !== "draft"),
    declinedReason: (row.declined_reason as string | null) ?? null,
    photos: ((row.photos as string[] | null) ?? []).map(photoUrl),
    model: (row.model_url as string) || null,
    spots: listedSpots((row.thing_spots ?? []) as Parameters<typeof listedSpots>[0]),
    createdAt: row.created_at,
    house: row.house === true,
    proof: (row.proof_photos as string[] | null) ?? [],
  }));
}

export async function updateThing(
  id: string,
  patch: Partial<{ title: string; tagline: string | null; active: boolean; model_url: string; proof_photos: string[] }>,
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

/** Ждёт решения: не одобрена и не отклонена. */
export function awaitsReview(thing: AdminThing): boolean {
  return !thing.active && !thing.declinedReason;
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
 * Фото пруфа: в хранилище things, папка proof/<вещь>/, и путь - в список у
 * вещи. Грузим по одному: их несколько, и отказ на одном не должен терять
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
