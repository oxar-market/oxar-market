"use client";

import { useState } from "react";
import { estimate, formatUsd, parseFollowers } from "@oxar/core";
import { Waitlist } from "./Waitlist";

/**
 * Сколько можно просить за свои места. Считает estimate из core, подписчиков
 * человек вводит руками: серверного кода в лендинге нет вообще (output:
 * "export"), а API X отдаёт профили только на платном тарифе - дорого ради
 * числа, которое человек и так знает наизусть.
 *
 * Везде «сколько просить», а не «сколько заработаешь»: продажу мы не
 * гарантируем, а обещание, которое не сбылось, человек пересказывает там же,
 * где мы его нашли.
 *
 * Вейтлист появляется по кнопке, а не сразу под расчётом: к этому моменту
 * число подписчиков уже окончательное, и подставленный текст не расходится с
 * тем, что видно выше.
 */

export function Rate() {
  const [input, setInput] = useState("");
  const [listing, setListing] = useState(false);

  const followers = parseFollowers(input);
  const typed = input.trim().length > 0;
  const result = followers && followers > 0 ? estimate(followers) : null;

  return (
    <div className="card">
      <h2>What can you charge?</h2>
      <p className="small muted">
        Your follower count is enough. We show what you could ask for each spot.
        These are starting points, not quotes - you name your own price.
      </p>

      <label>
        Followers
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="12.4k"
          inputMode="numeric"
          autoComplete="off"
        />
      </label>

      {typed && !result && (
        <p className="small muted">A number, like 12400 or 12.4k.</p>
      )}

      {result && (
        <>
          <div className="rate-rows">
            {result.perPlacement.map((spot) => (
              <span className="rate-row" key={spot.kind}>
                <span className="rate-spot">
                  {spot.label}
                  <span className="rate-days">{spot.days} days</span>
                </span>
                <strong>{formatUsd(spot.pricePerTerm * 100)}</strong>
              </span>
            ))}
          </div>

          <p className="rate-month">
            Booked about a third of the time, the three together come to{" "}
            <strong>
              {formatUsd(result.monthlyLow * 100)} to{" "}
              {formatUsd(result.monthlyHigh * 100)}
            </strong>{" "}
            a month. The fee is 10% out of that.
          </p>

          {listing ? (
            <Waitlist
              initialPitch={`Avatar, banner and bio link on my X profile, ${input.trim()} followers`}
            />
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => setListing(true)}
            >
              Put these spots up
            </button>
          )}
        </>
      )}
    </div>
  );
}
