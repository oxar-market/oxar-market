"use client";

import type { Shape, Spot } from "@oxar/stage";
import type { Lot } from "./auction.ts";
import { db } from "./session.ts";
import { photoUrl, type Rect, type Score } from "./seller.ts";

/**
 * Вещь продавца на торге: снимки, места и, если мы уже приложили её, модель.
 *
 * Места продавец размечает на первом снимке - это прямоугольники долями
 * кадра. На модели те же места ставим мы из админки: высота, угол и размер,
 * как у мест футболки в коде. Пока хоть одно место без геометрии, вещь
 * показывается фотографией: 3D с половиной мест хуже честного фото.
 */

export type ListedSpot = {
  id: string;
  code: string;
  label: string;
  rect: Rect | null;
  /** Геометрия на модели; null - место ещё не поставлено на 3D. */
  geo: { height: number; azimuth: number; size: [number, number] } | null;
};

export type ListedThing = {
  id: string;
  title: string;
  tagline: string | null;
  photos: string[];
  /** Сцена для 3D, если модель есть и все места на ней стоят. */
  shape: Shape | null;
  spots: ListedSpot[];
  lots: Lot[];
  score: Score;
};

type SpotRow = {
  id: string;
  code: string;
  label: string;
  sort: number;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  height: number | null;
  azimuth: number | null;
  size_w: number | null;
  size_h: number | null;
};

export function listedSpots(rows: SpotRow[]): ListedSpot[] {
  return [...rows]
    .sort((a, b) => a.sort - b.sort)
    .map((row) => ({
      id: row.id,
      code: row.code,
      label: row.label,
      rect:
        row.x === null || row.y === null || row.w === null || row.h === null
          ? null
          : { x: row.x, y: row.y, w: row.w, h: row.h },
      geo:
        row.height === null || row.azimuth === null || row.size_w === null || row.size_h === null
          ? null
          : { height: row.height, azimuth: row.azimuth, size: [row.size_w, row.size_h] },
    }));
}

/** Сцена по модели вещи и местам на ней. Нет модели или мест - нет сцены. */
export function shapeOf(model: string | null, spots: ListedSpot[]): Shape | null {
  if (!model || spots.length === 0 || spots.some((spot) => !spot.geo)) return null;
  return {
    model,
    spots: spots.map(
      (spot): Spot => ({
        code: spot.code,
        label: spot.label,
        height: spot.geo!.height,
        azimuth: spot.geo!.azimuth,
        size: spot.geo!.size,
      }),
    ),
    depth: 0.05,
    cloth: false,
    noun: "thing",
  };
}

export const SPOT_COLUMNS =
  "id, code, label, sort, x, y, w, h, height, azimuth, size_w, size_h";

export async function loadListedThing(thingId: string): Promise<ListedThing | null> {
  if (!db) return null;
  const { data: thing } = await db
    .from("things")
    .select(`id, title, tagline, seller, photos, model_url, thing_spots(${SPOT_COLUMNS})`)
    .eq("id", thingId)
    .maybeSingle();
  if (!thing) return null;

  const spots = listedSpots((thing.thing_spots as SpotRow[] | null) ?? []);
  const codeOf = new Map(spots.map((spot) => [spot.id, spot.code]));

  const [{ data: lots }, { data: score }] = await Promise.all([
    db
      .from("lots")
      .select("id, spot_id, status, reserve_cents, min_step_cents, opens_at, closes_at")
      .eq("thing_id", thingId)
      .eq("status", "open"),
    thing.seller
      ? db.from("seller_scores").select("rating, deals").eq("seller", thing.seller).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    id: thing.id,
    title: thing.title,
    tagline: thing.tagline,
    photos: ((thing.photos as string[] | null) ?? []).map(photoUrl),
    shape: shapeOf((thing.model_url as string) || null, spots),
    spots,
    lots: (lots ?? []).flatMap((lot) => {
      const spot_code = codeOf.get(lot.spot_id);
      return spot_code ? [{ ...lot, spot_code } as Lot] : [];
    }),
    score: {
      rating: score?.rating === null || score?.rating === undefined ? null : Number(score.rating),
      deals: score?.deals ?? 0,
    },
  };
}
