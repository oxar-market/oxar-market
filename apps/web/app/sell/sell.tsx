"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";

/**
 * Страница для тех, кто продаёт место: как у backable страница для фаундеров.
 * Калькулятор, шаги, ответы на вопросы, которые нам уже задавали, и форма.
 *
 * Говорим о вещах, на которые смотрят люди, а не об ивентах и не о крипте:
 * продают и на мероприятиях, и на кампаниях, и на собственных вещах.
 */

const APP_URL = "https://app.oxar.app";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Комиссия для калькулятора. В контракте она задаётся на торг из админки,
 * для новых продавцов договорились о 15%. Поменялась - правится здесь.
 */
export const FEE = 0.15;

function usd(dollars: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(dollars);
}

export const STEPS: [string, string][] = [
  ["Tell us what you've got", "A shirt, a van, a stage, a campaign. Where people will see it, when, and roughly how many."],
  ["We mark the spots together", "We agree on how many logos fit and what each spot starts at."],
  ["The auction goes live", "Bidders pay upfront into escrow, and we bring bidders to your page."],
  ["You put the logos up", "Print and place the winning logos, then post a photo before the deadline."],
  ["You get paid", "72 hours after the photo, the money goes to you, minus the OXAR fee."],
];

export const QUESTIONS: [string, string][] = [
  ["Do I pay anything upfront?", "No. Listing is free, and OXAR takes its fee only from spots that sell."],
  ["What if a spot doesn't sell?", "Nothing happens. No fee and no obligation, and you can put it up again later."],
  [
    "Can I approve each bidder?",
    "Not one by one: the highest bid wins, which keeps the auction fair. If you can't place a winning logo, skip the photo for that spot and the winner gets an automatic refund.",
  ],
  ["When do I get paid?", "72 hours after you post the photo, unless the winner disputes it. Disputes go to an arbiter."],
  ["Who prints and places the logos?", "You do, since it's your thing. We help you plan the spots and the printing."],
];

export function Sell() {
  // Тема - та же, что выбрана на главной.
  useEffect(() => {
    if (window.localStorage.getItem("oxar.theme") === "dark") document.documentElement.dataset.theme = "dark";
  }, []);

  return (
    <main className="sell">
      <header className="land-top">
        <a className="wordmark" href="/">
          OXAR
        </a>
        <a className="top-link" href={APP_URL}>
          Find a spot
        </a>
      </header>

      <section className="sell-intro">
        <h1>Your guide to selling ad space on OXAR.</h1>
        <p className="sub">
          Got something people look at? A shirt, a van, a stage, a campaign. Mark the spots, set starting prices, get
          paid once the logos are up.
        </p>
      </section>

      <Calculator />

      <section className="sell-block">
        <h2>How it works</h2>
        <ol className="sell-steps">
          {STEPS.map(([title, text], at) => (
            <li key={title}>
              <span className="sell-num">{at + 1}</span>
              <div>
                <b>{title}</b>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="sell-block">
        <h2>Questions</h2>
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
    </main>
  );
}

export function Calculator() {
  const [spots, setSpots] = useState(9);
  const [start, setStart] = useState(300);
  const [average, setAverage] = useState(450);
  // Средняя выигрышная не бывает ниже стартовой: торг ниже старта не уходит.
  const winning = Math.max(average, start);
  const total = spots * winning;
  const fee = Math.round(total * FEE);

  return (
    <section className="sell-calc">
      <div className="sell-inputs">
        <h2>Model your sale</h2>
        <p className="sell-note">Move the sliders to see what your spots could bring in and what you keep.</p>
        <Slider label="Spots" value={spots} min={1} max={20} step={1} show={String(spots)} onChange={setSpots}>
          How many logos fit on your thing.
        </Slider>
        <Slider label="Starting price per spot" value={start} min={50} max={2000} step={50} show={usd(start)} onChange={setStart}>
          No spot sells below this.
        </Slider>
        <Slider
          label="Average winning bid"
          value={winning}
          min={start}
          max={3000}
          step={50}
          show={usd(winning)}
          onChange={setAverage}
        >
          For scale: a road trip van drew winning bids of $300 to $1,001 on its 9 spots.
        </Slider>
      </div>

      <div className="sell-sum">
        {/* Каждое место - квадрат, как деньги на схеме главной: ползунок
            двигаешь - квадраты добавляются, полоса под ними делится на твою
            часть и комиссию. */}
        <div className="sell-spots" aria-hidden>
          {Array.from({ length: spots }, (_, at) => (
            <i key={at} data-tip={`Spot ${at + 1}: ${usd(winning)}`} />
          ))}
        </div>
        <div className="sell-split" aria-hidden>
          <span className="you" style={{ flexGrow: total - fee }} data-tip={`You keep ${usd(total - fee)}`} />
          <span className="fee" style={{ flexGrow: fee }} data-tip={`OXAR fee ${usd(fee)}`} />
        </div>
        <dl>
          <div>
            <dt>Total bid</dt>
            <dd>{usd(total)}</dd>
          </div>
          <div>
            <dt>OXAR fee ({Math.round(FEE * 100)}%)</dt>
            <dd>-{usd(fee)}</dd>
          </div>
          <div className="you">
            <dt>You receive</dt>
            <dd>{usd(total - fee)}</dd>
          </div>
        </dl>
        <p className="sell-note">Paid out 72 hours after you post the photo. Unsold spots cost you nothing.</p>
        <a className="find" href="#pitch">
          Put my spot up
        </a>
      </div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  show,
  onChange,
  children,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  show: string;
  onChange: (value: number) => void;
  children: string;
}) {
  return (
    <label className="sell-slider">
      <span className="sell-row">
        <span>{label}</span>
        <b>{show}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        // Сколько полосы залито до ползунка: браузер сам этого не рисует.
        style={{ "--fill": `${max === min ? 100 : ((value - min) / (max - min)) * 100}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="sell-note">{children}</span>
    </label>
  );
}

/**
 * Заявка уходит в ту же таблицу waitlist, что и прежняя форма лендинга:
 * у неё уже есть сторона «seller», поле «что продаю» и RLS только на insert.
 * Полей три: длинная форма в конце страницы отпугивала, а где и когда
 * человек и так напишет в «что это». Ссылка - строкой в notes.
 */
export function Pitch() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const notes = [
      ["Link", field("link")],
    ]
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n")
      .slice(0, 1000);

    if (!SUPABASE || !ANON) {
      setState("failed");
      return;
    }
    setState("sending");
    try {
      const response = await fetch(`${SUPABASE}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          side: "seller",
          pitch: field("what"),
          contact: field("contact"),
          source: "sell",
          notes: notes || null,
        }),
      });
      setState(response.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "sent") {
    return (
      <section className="sell-block sell-pitch" id="pitch">
        <h2>Got it.</h2>
        <p className="sub">We&apos;ll look at your spot and get back to you soon.</p>
      </section>
    );
  }

  return (
    <section className="sell-block sell-pitch" id="pitch">
      <h2>Got something people look at? Tell us.</h2>
      <form className="sell-form" onSubmit={submit}>
        <label className="wide">
          <span>What is it, and where will people see it?</span>
          <input
            name="what"
            required
            minLength={3}
            maxLength={500}
            placeholder="Flags at a Saturday run club in London, about 300 runners"
          />
        </label>
        <label>
          <span>How do we reach you?</span>
          <input name="contact" required minLength={3} maxLength={320} placeholder="Email, Telegram or X" />
        </label>
        <label>
          <span>Link (optional)</span>
          <input name="link" maxLength={200} placeholder="Website, page or post" />
        </label>
        <div className="wide sell-send">
          <button className="find" type="submit" disabled={state === "sending"}>
            {state === "sending" ? "Sending..." : "Put my spot up"}
          </button>
          {state === "failed" && <span className="sell-error">Couldn&apos;t send. Try again, or write to support@oxar.app.</span>}
        </div>
      </form>
    </section>
  );
}
