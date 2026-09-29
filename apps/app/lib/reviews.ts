"use client";

import { db } from "./session.ts";
import type { Score } from "./seller.ts";

/** Отзыв покупателя о продавце, как его видят все. */
export type Review = {
  rating: number;
  stood: "yes" | "partly" | "no" | null;
  body: string | null;
  createdAt: string;
  thing: string;
  spot: string;
};

/** Счёт стороны: средняя оценка другой стороны и число сделок. */
export async function loadScoreOf(id: string, side: "seller" | "buyer" = "seller"): Promise<Score> {
  if (!db) return { rating: null, deals: 0 };
  const { data } = await db
    .from(side === "seller" ? "seller_scores" : "buyer_scores")
    .select("rating, deals")
    .eq(side, id)
    .maybeSingle();
  return {
    rating: data?.rating === null || data?.rating === undefined ? null : Number(data.rating),
    deals: data?.deals ?? 0,
  };
}

/**
 * Имя продавца на маркете: его никнейм, без него - кошелёк коротко, а если
 * нет и кошелька - null, и экран пишет «Seller».
 */
export async function loadSellerName(seller: string): Promise<string | null> {
  if (!db) return null;
  const { data } = await db
    .from("seller_cards")
    .select("handle, wallet")
    .eq("seller", seller)
    .maybeSingle();
  if (data?.handle) return `@${data.handle}`;
  if (data?.wallet) return `${data.wallet.slice(0, 4)}…${data.wallet.slice(-4)}`;
  return null;
}

/** Свой никнейм: что стоит сейчас. */
export async function loadMyHandle(): Promise<string | null> {
  if (!db) return null;
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return null;
  const { data } = await db.from("profiles").select("handle").eq("user_id", auth.user.id).maybeSingle();
  return data?.handle ?? null;
}

/**
 * Задать себе никнейм. Правила те же, что у хэндла в базе: латиница, цифры
 * и подчёркивание, до пятнадцати знаков; занятый не пройдёт.
 */
export async function saveMyHandle(handle: string): Promise<"ok" | "taken" | "bad"> {
  if (!db || !/^[A-Za-z0-9_]{1,15}$/.test(handle)) return "bad";
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return "bad";
  // Не upsert: он переписал бы и user_id, а право на запись есть только у
  // handle. Профиль есть - правим, нет - заводим.
  const { data: updated, error } = await db
    .from("profiles")
    .update({ handle })
    .eq("user_id", auth.user.id)
    .select("user_id");
  const failure = error ?? (updated?.length ? null : (await db.from("profiles").insert({ user_id: auth.user.id, handle })).error);
  if (!failure) return "ok";
  return failure.code === "23505" ? "taken" : "bad";
}

/** Отзывы о продавце, новые сверху. */
export async function loadReviews(seller: string): Promise<Review[]> {
  if (!db) return [];
  const { data } = await db
    .from("seller_reviews")
    .select("rating, stood, body, created_at, thing, spot")
    .eq("seller", seller)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((row) => ({
    rating: row.rating,
    stood: row.stood,
    body: row.body,
    createdAt: row.created_at,
    thing: row.thing,
    spot: row.spot,
  }));
}

/**
 * Счёт одной строкой. Меньше трёх сделок - «New seller»: две пятёрки
 * подряд ещё не репутация (правило борда «Where scores live»).
 */
export function scoreText(score: Score, side: "seller" | "buyer" = "seller"): string {
  if (score.deals < 3) return `New ${side}`;
  if (score.rating === null) return `${score.deals} deals, no ratings yet`;
  return `★ ${score.rating.toFixed(1)} · ${score.deals} deals`;
}
