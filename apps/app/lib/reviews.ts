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
