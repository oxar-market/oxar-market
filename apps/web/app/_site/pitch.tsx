"use client";

import { useState, type FormEvent } from "react";

/**
 * Комиссия, вопросы и форма заявки - всё, что осталось от прежней /sell.
 * Калькулятор и шаги ушли вместе со старой страницей.
 */

const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Комиссия площадки - для схемы на главной и страницы продавца. В контракте
 * она задаётся на торг из админки, для новых продавцов договорились о 15%.
 * Поменялась - правится здесь.
 */
export const FEE = 0.15;

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
