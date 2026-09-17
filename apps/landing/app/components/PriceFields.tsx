"use client";

import { useState } from "react";
import { placementSpec, type PlacementKind, type Pricing } from "@oxar/core";

// Поля цены: пакет или ставка за сутки. Одни и те же при создании места и при
// правке, поэтому живут отдельно - иначе два места разошлись бы в проверках.

export type PriceValue = {
  pricing: Pricing;
  price_cents: number;
  term_days: number;
  /** Поток по секундам или разовый перевод. */
  payment: "stream" | "transfer";
};

export function usePriceFields(kind: PlacementKind, initial?: PriceValue) {
  const spec = placementSpec(kind);
  const [daily, setDaily] = useState(initial?.pricing === "daily");
  const [price, setPrice] = useState(
    initial ? (initial.price_cents / 100).toString() : "",
  );
  const [days, setDays] = useState(initial ? String(initial.term_days) : "");
  // Поток осмыслен там, где состояние места читается автоматически. У ткани
  // такой проверки нет, поэтому у зон футболки умолчание другое.
  const [transfer, setTransfer] = useState(
    initial ? initial.payment === "transfer" : spec.proof === "image" && kind.includes("_"),
  );

  /** Строка или готовые центы: цену считаем целыми центами, как везде. */
  function read(): { value: PriceValue } | { error: string } {
    const dollars = Number(price.replace(",", "."));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      return { error: "Enter the price in dollars, like 250." };
    }

    const term = days.trim() ? Number(days) : daily ? 1 : spec.defaultDays;
    if (!Number.isInteger(term) || term < 1 || term > 90) {
      return {
        error: daily
          ? "Minimum days: a whole number, 1 to 90."
          : "Term: 1 to 90 days.",
      };
    }

    return {
      value: {
        pricing: daily ? "daily" : "term",
        price_cents: Math.round(dollars * 100),
        term_days: term,
        payment: transfer ? "transfer" : "stream",
      },
    };
  }

  function reset() {
    setPrice("");
    setDays("");
  }

  const fields = (
    <>
      {/* Как платят за это место. Выбор продавца, а не свойство платформы:
          поток защищает покупателя только там, где мы умеем проверить, стоит
          ли размещение. */}
      <div className="sides">
        <button
          type="button"
          className={transfer ? "side" : "side active"}
          onClick={() => setTransfer(false)}
        >
          Stream by the second
        </button>
        <button
          type="button"
          className={transfer ? "side active" : "side"}
          onClick={() => setTransfer(true)}
        >
          Pay once
        </button>
      </div>

      <div className="sides">
        <button
          type="button"
          className={daily ? "side" : "side active"}
          onClick={() => setDaily(false)}
        >
          Price for a term
        </button>
        <button
          type="button"
          className={daily ? "side active" : "side"}
          onClick={() => setDaily(true)}
        >
          Price per day
        </button>
      </div>

      <label>
        {daily ? "Price per day, $" : "Price for the whole term, $"}
        <input
          value={price}
          onChange={(event) => setPrice(event.target.value.replace(/[^\d.,]/g, ""))}
          placeholder="250"
          inputMode="decimal"
        />
      </label>

      <label>
        {daily ? "Minimum days" : "Term in days"}
        <input
          value={days}
          onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
          placeholder={daily ? "1" : String(spec.defaultDays)}
          inputMode="numeric"
        />
      </label>
    </>
  );

  return { fields, read, reset };
}
