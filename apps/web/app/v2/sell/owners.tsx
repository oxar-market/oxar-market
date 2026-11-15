"use client";

import { useEffect, useState } from "react";
import { FEE, Pitch, QUESTIONS } from "../../sell/sell.tsx";
import { APP_URL, load, usd, type Data } from "../data.ts";
import { Foot, Top } from "../landing.tsx";
import { MoneyFlow } from "./money.tsx";

/**
 * Шаги для самостоятельного выставления: вещь продавец заводит сам в
 * приложении (вкладка You, раздел Seller), а мы одобряем её перед торгом -
 * admin_reviews_thing. Писать нам заранее не нужно.
 */
const STEPS: [string, string][] = [
  ["List your thing", "Sign in, photograph it and mark the spots yourself. A shirt, a van, a stage, anything people look at."],
  ["Set your prices", "Pick a starting price for each spot and when bidding ends."],
  ["We approve it", "We check every listing before it goes live, so brands know what they're bidding on."],
  ["Brands bid", "Bidders pay upfront into escrow, and outbid bids go straight back."],
  ["Logos up, you get paid", "Place the winning logos and post a photo. 72 hours later the money is yours, minus the OXAR fee."],
];

/** Куда ведёт «выставить»: кабинет продавца в приложении. */
const LIST_URL = `${APP_URL}/?tab=you`;

/**
 * Страница продавца в стиле нового лендинга. Вопросы, форма и комиссия - те
 * же, что на /sell. Калькулятора нет намеренно: владелец вбивал бы цифры
 * наугад, а настоящий торг на первом экране убеждает сильнее.
 */
export function Owners() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    void load().then(setData);
  }, []);
  // Пример для продавца - последний проданный торг, с настоящими цифрами.
  const last = data?.auctions.find((one) => one.status === "sold") ?? null;

  return (
    <div className="v2 v2-sell">
      <Top />

      <section className="v2-hero">
        <div className="v2-hero-text">
          <h1>
            Got something
            <br />
            people look at?
            <span> Sell the spots on it.</span>
          </h1>
          <div className="v2-hero-foot">
            <p>
              A shirt, a van, a stage, a campaign. List it, mark the spots, set the prices. Brands bid, and you get paid
              once the logos are up.
            </p>
            <div className="v2-sell-go">
              <a className="v2-btn dark" href={LIST_URL}>
                List your thing
              </a>
              <a className="v2-btn light line" href="#pitch">
                Talk to us first
              </a>
            </div>
            <ul className="v2-sell-terms">
              <li>Nothing to pay us upfront</li>
              <li>We approve every listing</li>
              <li>{Math.round(FEE * 100)}% only on sold spots</li>
            </ul>
          </div>
        </div>

        <div className="v2-feature">
          <div className="v2-feature-media">
            <img src="/v2/van-card.jpg" alt="" />
          </div>
          <div className="v2-feature-top">
            <span className="v2-meta">A real sale</span>
          </div>
          <div className="v2-feature-title">
            <h2>{last ? `${usd(last.raisedCents)} for ${last.spots} spots` : " "}</h2>
            <p>{last ? `${last.owner} · ${last.title}` : " "}</p>
          </div>
        </div>
      </section>

      <section className="v2-section">
        <p className="v2-label">The money</p>
        <div className="v2-head">
          <h2>
            The money is there
            <span> before you print anything.</span>
          </h2>
        </div>
        <MoneyFlow />
      </section>

      <section className="v2-section">
        <p className="v2-label">How it works</p>
        <div className="v2-head">
          <h2>
            List it yourself.
            <span> We approve it.</span>
          </h2>
        </div>
        <ol className="v2-sell-steps">
          {STEPS.map(([title, text], at) => (
            <li key={title}>
              <span className="v2-node-at">{String(at + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="v2-section v2-sell-qa">
        <div>
          <p className="v2-label">Questions</p>
          <h2>
            What owners
            <span> ask us first.</span>
          </h2>
        </div>
        <div className="sell-qa">
          {QUESTIONS.map(([question, answer]) => (
            <details key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <Pitch />
      <Foot />
    </div>
  );
}
