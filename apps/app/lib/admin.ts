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
  photos: string[];
  model: string | null;
  spots: ListedSpot[];
  createdAt: string;
};

export async function amIAdmin(): Promise<boolean> {
  if (!db) return false;
  const { data } = await db.rpc("is_admin");
  return data === true;
}

/** Вещи продавцов, новые сверху. Наши вещи (house) заводятся миграциями, их тут нет. */
export async function loadAdminThings(): Promise<AdminThing[]> {
  if (!db) return [];
  const { data } = await db
    .from("things")
    .select(`id, title, tagline, active, photos, model_url, created_at, thing_spots(${SPOT_COLUMNS})`)
    .not("seller", "is", null)
    .eq("house", false)
    .order("created_at", { ascending: false });
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    tagline: row.tagline,
    active: row.active,
    photos: ((row.photos as string[] | null) ?? []).map(photoUrl),
    model: (row.model_url as string) || null,
    spots: listedSpots((row.thing_spots ?? []) as Parameters<typeof listedSpots>[0]),
    createdAt: row.created_at,
  }));
}

export async function updateThing(
  id: string,
  patch: Partial<{ title: string; tagline: string | null; active: boolean; model_url: string }>,
): Promise<boolean> {
  if (!db) return false;
  const { error } = await db.from("things").update(patch).eq("id", id);
  return !error;
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

export async function saveSpotGeo(spotId: string, geo: NonNullable<ListedSpot["geo"]>): Promise<boolean> {
  if (!db) return false;
  const { error } = await db
    .from("thing_spots")
    .update({ height: geo.height, azimuth: geo.azimuth, size_w: geo.size[0], size_h: geo.size[1] })
    .eq("id", spotId);
  return !error;
}
