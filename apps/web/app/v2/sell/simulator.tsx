"use client";

import { useEffect, useRef, useState } from "react";
import { minBidCents, payoutSplit } from "@oxar/core";
import { FEE } from "../../sell/sell.tsx";

/**
 * Калькулятор, который играет торг. Продавец выбирает вещь, число мест и
 * стартовую цену, жмёт «Run a sample auction» - и ставки сыплются на места,
 * как на настоящем торге: каждая не ниже минимума по правилам контракта
 * (minBidCents), а итог делится комиссией так же, как делит программа
 * (payoutSplit). Цифры ставок случайные, и это сказано прямо.
 */

const PRESETS: { name: string; spots: number; start: number }[] = [
  { name: "Shirt", spots: 6, start: 100 },
  { name: "Van", spots: 11, start: 300 },
  { name: "Stage", spots: 8, start: 250 },
  { name: "Stream", spots: 5, start: 150 },
  { name: "Laptop", spots: 4, start: 75 },
];

const BRANDS = "ABCDEFGHJKLMNPRSTUVW";
const TICK_MS = 220;

type Feed = { spot: number; brand: string; cents: number; at: number };

function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

/** Число, которое доезжает до нового значения, а не прыгает. */
function useRolling(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 400);
      const value = Math.round(start + (target - start) * (1 - (1 - t) ** 3));
      setShown(value);
      from.current = value;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return shown;
}

export function Simulator() {
  const [preset, setPreset] = useState("Van");
  const [spots, setSpots] = useState(11);
  const [start, setStart] = useState(300);
  const [tops, setTops] = useState<(number | null)[]>(() => Array(11).fill(null));
  const [feed, setFeed] = useState<Feed[]>([]);
  const [state, setState] = useState<"idle" | "running" | "closed">("idle");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }

  // Любая правка условий сбрасывает доску: старый прогон был про другие места.
  function reset(nextSpots: number) {
    stop();
    setTops(Array(nextSpots).fill(null));
    setFeed([]);
    setState("idle");
  }

  useEffect(() => stop, []);

  function pick(name: string) {
    const one = PRESETS.find((p) => p.name === name);
    if (!one) return;
    setPreset(name);
    setSpots(one.spots);
    setStart(one.start);
    reset(one.spots);
  }

  function run() {
    stop();
    const reserve = start * 100;
    // Где каждое место остановится: от старта до примерно двух с половиной
    // стартов. Не прогноз - разброс, чтобы было видно, как идёт торг.
    const goals = Array.from({ length: spots }, () => Math.round(reserve * (1 + Math.random() * Math.random() * 1.6)));
    const now: (number | null)[] = Array(spots).fill(null);
    let count = 0;
    setTops([...now]);
    setFeed([]);
    setState("running");

    const finish = () => {
      stop();
      // Место без ставки в образце не бывает: продавцу показываем продажу.
      for (let at = 0; at < spots; at++) if (now[at] === null) now[at] = reserve;
      setTops([...now]);
      setState("closed");
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      goals.forEach((goal, at) => (now[at] = goal));
      finish();
      return;
    }

    timer.current = setInterval(() => {
      const open = now.map((top, at) => (top === null || top < goals[at] ? at : -1)).filter((at) => at >= 0);
      if (open.length === 0) return finish();
      const spot = open[Math.floor(Math.random() * open.length)];
      const least = minBidCents(reserve, now[spot]);
      const jump = Math.round(least * Math.random() * 0.25);
      const cents = Math.min(Math.max(least, goals[spot]), least + jump);
      now[spot] = cents;
      count += 1;
      setTops([...now]);
      setFeed((all) => [{ spot, brand: BRANDS[Math.floor(Math.random() * BRANDS.length)], cents, at: count }, ...all].slice(0, 5));
    }, TICK_MS);
  }

  const total = tops.reduce<number>((sum, top) => sum + (top ?? 0), 0);
  // До прогона итог - по стартовым ценам: меньше продавец не получит за проданное место.
  const shownTotal = state === "idle" ? spots * start * 100 : total;
  const split = payoutSplit(BigInt(shownTotal), Math.round(FEE * 10_000));
  const rolledTotal = useRolling(shownTotal);
  const rolledYou = useRolling(Number(split.toSeller));
  const rolledFee = useRolling(Number(split.fee));

  return (
    <div className="v2-sim">
      <div className="v2-sim-set">
        <h2>Run your auction</h2>
        <p className="v2-sim-note">Pick a thing, set the spots and the starting price, then watch a sample auction play out.</p>

        <div className="v2-sim-things" role="radiogroup" aria-label="What are you selling?">
          {PRESETS.map((one) => (
            <button
              key={one.name}
              type="button"
              role="radio"
              aria-checked={preset === one.name}
              className={preset === one.name ? "on" : ""}
              onClick={() => pick(one.name)}
            >
              {one.name}
            </button>
          ))}
        </div>

        <label className="v2-sim-range">
          <span>
            Spots <b>{spots}</b>
          </span>
          <input
            type="range"
            min={1}
            max={16}
            value={spots}
            onChange={(event) => {
              const next = Number(event.target.value);
              setSpots(next);
              setPreset("");
              reset(next);
            }}
          />
        </label>
        <label className="v2-sim-range">
          <span>
            Starting price per spot <b>{usd(start * 100)}</b>
          </span>
          <input
            type="range"
            min={25}
            max={2000}
            step={25}
            value={start}
            onChange={(event) => {
              setStart(Number(event.target.value));
              setPreset("");
              reset(spots);
            }}
          />
        </label>

        <button type="button" className="v2-btn dark wide v2-sim-run" onClick={run} disabled={state === "running"}>
          {state === "running" ? "Bidding..." : state === "closed" ? "Run it again" : "Run a sample auction"}
        </button>
        <p className="v2-sim-note">
          A sample, not a forecast: bids here are random. For scale, a road trip van drew winning bids of $300 to $1,001 on
          its 9 spots.
        </p>
      </div>

      <div className="v2-sim-board">
        <div className="v2-sim-head">
          <span className={`v2-tag ${state === "running" ? "live" : "soft"}`}>
            <span className="v2-dot" />
            {state === "running" ? "Live" : state === "closed" ? "Closed" : "Ready"}
          </span>
          <span className="v2-sim-count">{spots} spots</span>
        </div>

        <ol className="v2-sim-spots">
          {tops.map((top, at) => (
            <li key={`${at}-${top ?? 0}`} className={top === null ? "" : "bid"}>
              <i>{at + 1}</i>
              <b>{top === null ? usd(start * 100) : usd(top)}</b>
              <span>{top === null ? "starts at" : "top bid"}</span>
            </li>
          ))}
        </ol>

        <ul className="v2-sim-feed" aria-live="polite">
          {feed.length === 0 ? (
            <li className="quiet">{state === "closed" ? "Bidding closed." : "Bids will show up here."}</li>
          ) : (
            feed.map((one) => (
              <li key={one.at}>
                <i>{one.brand}</i>
                Brand {one.brand} bid {usd(one.cents)} on spot {one.spot + 1}
              </li>
            ))
          )}
        </ul>

        <dl className="v2-sim-sum">
          <div>
            <dt>{state === "idle" ? "At starting prices" : "Total bid"}</dt>
            <dd>{usd(rolledTotal)}</dd>
          </div>
          <div>
            <dt>OXAR fee ({Math.round(FEE * 100)}%)</dt>
            <dd>-{usd(rolledFee)}</dd>
          </div>
          <div className="you">
            <dt>You receive</dt>
            <dd>{usd(rolledYou)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
