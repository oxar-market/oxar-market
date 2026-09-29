"use client";

import { useEffect, useState } from "react";
import type { Score } from "@/lib/seller";
import { loadReviews, loadScoreOf, loadSellerName, scoreText, type Review } from "@/lib/reviews";

/**
 * Кто продаёт и его счёт - строкой под именем вещи. Тап открывает отзывы.
 *
 * Продавец подписан своим никнеймом, без него - кошельком. Если нет ни
 * того ни другого - «OXAR» у наших вещей и «Seller» у остальных.
 */
export function SellerLine({ seller, house }: { seller: string; house: boolean }) {
  const [score, setScore] = useState<Score | null>(null);
  const [open, setOpen] = useState(false);
  const [named, setNamed] = useState<string | null>(null);
  useEffect(() => {
    void loadScoreOf(seller).then(setScore);
    void loadSellerName(seller).then(setNamed);
  }, [seller]);
  const name = named ?? (house ? "OXAR" : "Seller");

  return (
    <>
      <button type="button" className="seller-line" onClick={() => setOpen(true)}>
        Sold by <b>{name}</b>
        {score && <span> · {scoreText(score)}</span>}
      </button>
      {open && score && (
        <Reviews seller={seller} name={name} score={score} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

const STOOD = { yes: "Spot stood", partly: "Stood partly", no: "Did not stand" } as const;

/** Отзывы покупателей о продавце, поверх экрана. */
export function Reviews({
  seller,
  name,
  score,
  onClose,
}: {
  seller: string;
  name: string;
  score: Score;
  onClose: () => void;
}) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  useEffect(() => {
    void loadReviews(seller).then(setReviews);
  }, [seller]);

  return (
    <div className="reviews-dim" onClick={onClose}>
      <div className="reviews" role="dialog" aria-label={`Reviews of ${name}`} onClick={(event) => event.stopPropagation()}>
        <div className="reviews-head">
          <div>
            <h2>{name}</h2>
            <p className="muted">{scoreText(score)}</p>
          </div>
          <button type="button" className="case-back" onClick={onClose}>
            Close
          </button>
        </div>
        {reviews?.length === 0 && <p className="muted">No reviews yet.</p>}
        {reviews?.map((one, at) => (
          <div className="review" key={at}>
            <span className="review-stars" aria-label={`${one.rating} of 5`}>
              {"★".repeat(one.rating)}
              <i>{"★".repeat(5 - one.rating)}</i>
            </span>
            {one.body && <p>{one.body}</p>}
            <small className="muted">
              {one.spot} · {one.thing} ·{" "}
              {new Date(one.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {one.stood ? ` · ${STOOD[one.stood]}` : ""}
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
