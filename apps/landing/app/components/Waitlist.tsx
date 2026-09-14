"use client";

import { useState } from "react";
import { isValidContact, normalizeContact } from "@oxar/core";
import { submitWaitlist } from "@/lib/waitlist";
import { Notice } from "./Notice";

type Side = "seller" | "buyer";
type Status = "idle" | "sending" | "done" | "error";

export function Waitlist() {
  const [pitch, setPitch] = useState("");
  const [side, setSide] = useState<Side>("seller");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const said = pitch.trim();
    if (said.length < 3) {
      setError(
        side === "seller"
          ? "Tell us what you would sell and where."
          : "Tell us what you are looking for and where.",
      );
      return;
    }
    if (said.length > 500) {
      setError("Keep it under 500 characters.");
      return;
    }
    // Связаться с человеком нам нечем, если он не оставил ни почты, ни
    // телеграма: хэндл в X - это не канал связи, в личку к нам он не пишет.
    // Поэтому контакт обязателен, и одинаково для обеих сторон.
    if (!contact.trim()) {
      setError("Leave an email or a Telegram so we can reach you.");
      return;
    }
    if (!isValidContact(contact)) {
      setError(
        "Use an email with a domain, like you@mail.com, or a Telegram handle with the @.",
      );
      return;
    }

    setStatus("sending");
    const result = await submitWaitlist({
      pitch: said,
      side,
      contact: normalizeContact(contact),
    });

    if (result === "created") {
      setStatus("done");
    } else if (result === "duplicate") {
      // Заявку не создали, поэтому и экрана «готово» быть не должно: зелёная
      // галочка на отказе читается как ещё одна успешная запись, и человек
      // жмёт кнопку снова.
      setStatus("idle");
      setError(
        "That email or Telegram is already on the list. One contact, one spot in the queue - on either side.",
      );
    } else {
      setStatus("error");
      setError("Could not save that. Try again in a minute.");
    }
  }

  if (status === "done") {
    return (
      <div className="card" id="waitlist">
        <Notice tone="success" title="You're on the list">
          We&apos;ll reach out on {normalizeContact(contact)} before launch.
        </Notice>
      </div>
    );
  }

  return (
    <form className="card" id="waitlist" onSubmit={submit} noValidate>
      <h2>Join the waitlist</h2>

      <div className="sides">
        <button
          type="button"
          className={side === "seller" ? "side active" : "side"}
          onClick={() => setSide("seller")}
        >
          I want to sell space
        </button>
        <button
          type="button"
          className={side === "buyer" ? "side active" : "side"}
          onClick={() => setSide("buyer")}
        >
          I want to buy space
        </button>
      </div>

      {/* Своими словами, а не хэндлом: площадка может быть любой - профиль в X,
          канал, подкаст, витрина в кофейне. Разбираем мы это руками, поэтому
          свободный текст честнее списка из трёх вариантов. */}
      <label>
        {side === "seller" ? "What would you sell, and where?" : "What are you looking for, and where?"}{" "}
        <span className="need">required</span>
        <textarea
          value={pitch}
          onChange={(event) => setPitch(event.target.value)}
          placeholder={
            side === "seller"
              ? "Avatar and bio link on my X profile, 12k followers"
              : "Avatars for a week, crypto accounts with 10k+ followers"
          }
          rows={3}
        />
      </label>

      <label>
        Email or Telegram <span className="need">either one</span>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@mail.com or @telegram"
          autoComplete="off"
        />
      </label>

      {error && <Notice tone="error">{error}</Notice>}

      <button type="submit" className="primary" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Join the waitlist"}
      </button>
    </form>
  );
}
