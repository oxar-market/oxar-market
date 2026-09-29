"use client";

import { useState } from "react";
import { Bar, Thumb } from "./parts.tsx";

/** Сделка, которую оценивают: одна строка карточкой наверху. */
export type RatedDeal = {
  lotId?: string;
  requestId?: string;
  title: string;
  line: string;
  cover: string | null;
  /** Оплата прошла через эскроу программы - только у торгов. */
  escrow: boolean;
};

function Stars({ value, onPick }: { value: number; onPick: (value: number) => void }) {
  return (
    <div className="sl-stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          type="button"
          key={star}
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} of 5`}
          className={star <= value ? "on" : ""}
          onClick={() => onPick(star)}
        >
          ★
        </button>
      ))}
    </div>
  );
}

/** Покупатель оценивает продавца: простояло ли место и продавец в целом. */
export function RateSeller({
  deal,
  onBack,
  onSend,
  busy,
  failed,
}: {
  deal: RatedDeal;
  onBack: () => void;
  onSend: (rating: { stood: "yes" | "partly" | "no"; rating: number; body: string }) => void;
  busy: boolean;
  failed: boolean;
}) {
  const [stood, setStood] = useState<"yes" | "partly" | "no" | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  return (
    <>
      <Bar title="Rate this deal" onBack={onBack} />
      <div className="sl-card sl-deal">
        <Thumb src={deal.cover} />
        <b>{deal.title}</b>
        <small>{deal.line}</small>
      </div>

      <h2 className="sl-h2">Did the spot actually stand?</h2>
      <div className="sl-options">
        {(
          [
            ["yes", "Yes, the whole week"],
            ["partly", "Partly"],
            ["no", "No"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            className={stood === value ? "sl-option on" : "sl-option"}
            onClick={() => setStood(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <h2 className="sl-h2">The seller, overall</h2>
      <Stars value={rating} onPick={setRating} />

      <input
        className="sl-line"
        value={body}
        maxLength={280}
        placeholder="A line for other buyers (optional)"
        onChange={(event) => setBody(event.target.value)}
      />

      {failed && <p className="bad">That did not go through. A deal takes one rating per side.</p>}

      <button
        type="button"
        className="sl-btn dark"
        disabled={!stood || rating === 0 || busy}
        onClick={() => stood && onSend({ stood, rating, body })}
      >
        Send rating
      </button>
      <p className="sl-small-note">Ratings are one per deal and cannot be edited later.</p>
    </>
  );
}

/** Продавец оценивает покупателя: картинка как договорились, без драмы. */
export function RateBuyer({
  deal,
  onBack,
  onSend,
  busy,
  failed,
}: {
  deal: RatedDeal;
  onBack: () => void;
  onSend: (rating: { artworkOk: boolean; noDrama: boolean; rating: number }) => void;
  busy: boolean;
  failed: boolean;
}) {
  const [artworkOk, setArtworkOk] = useState<boolean | null>(null);
  const [noDrama, setNoDrama] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  return (
    <>
      <Bar title="Rate the buyer" onBack={onBack} />
      <div className="sl-card sl-deal">
        <Thumb src={deal.cover} />
        <b>{deal.title}</b>
        <small>{deal.line}</small>
      </div>

      <div className="sl-card sl-checks">
        {deal.escrow && (
          <div>
            <span>Paid</span>
            <small>✓ Through escrow</small>
          </div>
        )}
        <div>
          <span>Artwork as agreed</span>
          <YesNo value={artworkOk} onPick={setArtworkOk} />
        </div>
        <div>
          <span>No drama</span>
          <YesNo value={noDrama} onPick={setNoDrama} />
        </div>
      </div>

      <h2 className="sl-h2">The buyer, overall</h2>
      <Stars value={rating} onPick={setRating} />

      {failed && <p className="bad">That did not go through. A deal takes one rating per side.</p>}

      <button
        type="button"
        className="sl-btn dark"
        disabled={artworkOk === null || noDrama === null || rating === 0 || busy}
        onClick={() =>
          artworkOk !== null && noDrama !== null && onSend({ artworkOk, noDrama, rating })
        }
      >
        Send rating
      </button>
    </>
  );
}

function YesNo({ value, onPick }: { value: boolean | null; onPick: (value: boolean) => void }) {
  return (
    <span className="sl-yesno">
      <button type="button" className={value === true ? "on" : ""} onClick={() => onPick(true)}>
        Yes
      </button>
      <button type="button" className={value === false ? "on" : ""} onClick={() => onPick(false)}>
        No
      </button>
    </span>
  );
}
