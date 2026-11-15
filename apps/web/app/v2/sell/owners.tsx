"use client";

import { useEffect, useState } from "react";
import { Calculator, FEE, Pitch, QUESTIONS, STEPS } from "../../sell/sell.tsx";
import { load, usd, type Data } from "../data.ts";
import { Foot, Top } from "../landing.tsx";

/**
 * Страница продавца в стиле нового лендинга. Калькулятор, шаги, вопросы и
 * форма - те же, что на /sell, отсюда только новая обёртка: правила и
 * комиссия живут в одном месте.
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
              A shirt, a van, a stage, a campaign. We mark the spots with you, brands bid on them, and you get paid once
              the logos are up.
            </p>
            <a className="v2-btn dark wide" href="#pitch">
              Put my spot up
            </a>
            <ul className="v2-sell-terms">
              <li>Free to list</li>
              <li>{Math.round(FEE * 100)}% only on sold spots</li>
              <li>Paid 72h after the photo</li>
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
        <p className="v2-label">Your numbers</p>
        <Calculator />
      </section>

      <section className="v2-section">
        <p className="v2-label">How it works</p>
        <div className="v2-head">
          <h2>
            Five steps,
            <span> and we do them with you.</span>
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
