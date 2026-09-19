"use client";

import { useState } from "react";
import { leaveReview, type Review, type ReviewSide } from "@/lib/reviews.ts";

/**
 * Отзыв по завершённой сделке: свой и второй стороны.
 *
 * Один блок на обе роли. Покупатель и продавец пишут об одном и том же - как
 * прошла сделка, - и разводить это на два похожих компонента значит завести им
 * два разных набора ошибок.
 *
 * Оценка обязательна, текст нет: звезду ставят все, писать словами - немногие,
 * и требовать текст значит не получить ни того, ни другого.
 */
export function Review({
  bookingId,
  side,
  mine,
  theirs,
  onSaved,
}: {
  bookingId: string;
  side: ReviewSide;
  /** Уже оставленный мой отзыв, если он есть. */
  mine?: Review;
  /** Что написала вторая сторона. */
  theirs?: Review;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const about = side === "buyer" ? "the seller" : "the buyer";

  async function send() {
    if (rating === 0) {
      setError("Pick a rating first.");
      return;
    }
    setBusy(true);
    setError("");
    const result = await leaveReview({ bookingId, author: side, rating, body });
    setBusy(false);

    if (result === "error") {
      setError("Could not save that. Try again in a minute.");
      return;
    }
    // «already» значит, что отзыв уже лежит: перечитываем и показываем его.
    onSaved();
  }

  return (
    <div className="review">
      {theirs && (
        <p className="small">
          <Stars value={theirs.rating} />{" "}
          <span className="muted">
            from {theirs.author === "buyer" ? "the buyer" : "the seller"}
          </span>
          {theirs.body && <span className="review-body">{theirs.body}</span>}
        </p>
      )}

      {mine ? (
        <p className="small">
          <Stars value={mine.rating} /> <span className="muted">you rated {about}</span>
          {mine.body && <span className="review-body">{mine.body}</span>}
        </p>
      ) : (
        <div className="review-form">
          <span className="muted small">How did it go with {about}?</span>
          <div className="review-stars">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= rating ? "review-star on" : "review-star"}
                onClick={() => setRating(value)}
                aria-label={`${value} out of 5`}
              >
                ★
              </button>
            ))}
          </div>
          <input
            value={body}
            onChange={(event) => setBody(event.target.value.slice(0, 1000))}
            placeholder="A line about how it went, if you want"
          />
          <button type="button" className="primary" disabled={busy} onClick={send}>
            {busy ? "Saving…" : "Leave the review"}
          </button>
          {error && <span className="small review-error">{error}</span>}
        </div>
      )}
    </div>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="review-rating" aria-label={`${value} out of 5`}>
      {"★".repeat(value)}
      <span className="review-rating-off">{"★".repeat(5 - value)}</span>
    </span>
  );
}
