"use client";

import { useState } from "react";
import { db } from "@/lib/session";

/**
 * Маркетплейс. Его ещё нет, и страница об этом говорит прямо, а не делает вид,
 * что что-то грузится.
 *
 * Почта собирается здесь же: человек, дошедший до пустой вкладки, - это
 * человек, которому маркетплейс нужен, и второго такого повода спросить не
 * будет.
 */

type State = "idle" | "sending" | "done" | "failed";

export function Market() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;

    // Проверка нарочно грубая: тонкая отбивает живые адреса, а настоящую
    // проверку всё равно делает письмо, которого мы пока не шлём.
    if (!email.includes("@") || email.length < 5) {
      setState("failed");
      return;
    }

    setState("sending");
    if (!db) return setState("failed");

    const { error } = await db
      .from("waitlist")
      .insert({ contact: email.trim(), side: "buyer" });

    // 23505 - этот адрес уже в списке. Для человека это не ошибка, а тот же
    // успех: он записан. Показывать отказ значило бы гнать его записываться
    // второй раз.
    setState(!error || error.code === "23505" ? "done" : "failed");
  }

  if (state === "done") {
    return (
      <section className="screen">
        <h1>Market</h1>
        <p className="lead">You are on the list. We will write when it opens.</p>
      </section>
    );
  }

  return (
    <section className="screen">
      <h1>Market</h1>
      <p className="lead">Coming soon.</p>
      <p className="muted">
        One thing at a time. Right now there is a single auction, and it is the
        whole product.
      </p>

      <form className="join" onSubmit={submit}>
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (state === "failed") setState("idle");
          }}
          placeholder="you@example.com"
          aria-label="Your email"
          autoComplete="email"
        />
        <button type="submit" className="primary" disabled={state === "sending"}>
          {state === "sending" ? "Joining…" : "Join the waitlist"}
        </button>
      </form>

      {state === "failed" && (
        <p className="bad">That did not go through. Check the address and try again.</p>
      )}
    </section>
  );
}
