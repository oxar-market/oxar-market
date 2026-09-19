"use client";

import { auth } from "./auth";

// Отзывы по завершённым сделкам. Кто и о ком вправе написать, решает база:
// функция may_review проверяет, что сделка состоялась и что вошедший был её
// стороной. Интерфейс той же функцией решает, показывать ли форму - иначе
// кнопка появлялась бы там, где запись всё равно отлетит.

export type ReviewSide = "buyer" | "seller";

export type Review = {
  id: string;
  created_at: string;
  booking_id: string;
  author: ReviewSide;
  rating: number;
  body: string | null;
};

/** Отзывы по своим сделкам. Пустой список - значит ещё никто не написал. */
export async function reviewsFor(bookingIds: string[]): Promise<Review[]> {
  if (!auth || bookingIds.length === 0) return [];
  const { data } = await auth
    .from("reviews")
    .select("id,created_at,booking_id,author,rating,body")
    .in("booking_id", bookingIds)
    .order("created_at");
  return (data ?? []) as Review[];
}

/**
 * Оставить отзыв. Один на сторону: второй не пройдёт, и это не ошибка связи, а
 * ответ базы.
 */
export async function leaveReview(input: {
  bookingId: string;
  author: ReviewSide;
  rating: number;
  body: string;
}): Promise<"saved" | "already" | "error"> {
  if (!auth) return "error";
  const { error } = await auth.from("reviews").insert({
    booking_id: input.bookingId,
    author: input.author,
    rating: input.rating,
    body: input.body.trim() || null,
  });

  if (!error) return "saved";
  return error.code === "23505" ? "already" : "error";
}

/** Средняя оценка продавца и число отзывов. Считается только по покупателям. */
export type SellerRating = { seller_id: string; rating: number; reviews: number };

export async function ratingsOf(sellerIds: string[]): Promise<SellerRating[]> {
  if (!auth || sellerIds.length === 0) return [];
  const { data } = await auth
    .from("seller_rating")
    .select("seller_id,rating,reviews")
    .in("seller_id", sellerIds);
  return (data ?? []) as SellerRating[];
}
