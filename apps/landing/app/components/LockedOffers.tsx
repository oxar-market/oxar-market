"use client";

import { Lock } from "./icons";

/**
 * Что видит на месте цен тот, кого мы ещё не пустили дальше вейтлиста.
 *
 * Барьер стоит здесь, а не на входе в витрину: человек успевает выбрать место
 * и понять, что вообще продаётся, и только потом встречает стену. Стена на
 * входе читается как «нам нечего показать», а место без реакции на клик - как
 * сломанный сайт.
 *
 * Под размытием заполнители, а не придуманные цены. Нечитаемое число всё равно
 * остаётся утверждением и лежит в разметке открытым текстом, а живых ставок у
 * нас пока нет ни одной.
 */

export function LockedOffers({ onWaitlist }: { onWaitlist: () => void }) {
  return (
    <div className="locked">
      <div className="locked-rows" aria-hidden>
        {[74, 52, 88].map((width) => (
          <span className="locked-row" key={width}>
            <span className="locked-side">
              @<span className="locked-bar" style={{ width }} />
            </span>
            <span className="locked-side">
              $<span className="locked-bar locked-price" />
            </span>
          </span>
        ))}
      </div>

      <div className="locked-over">
        <Lock className="locked-lock" />
        <strong>Prices open with the waitlist</strong>
        <button type="button" className="primary" onClick={onWaitlist}>
          Join the waitlist
        </button>
      </div>
    </div>
  );
}
