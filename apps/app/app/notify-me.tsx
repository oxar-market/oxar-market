"use client";

import { useState } from "react";
import { db } from "@/lib/session";

/** Почта на следующий торг: одно письмо, когда откроются ставки. */
export function Notify({ note = "One email when the next auction opens. No newsletter." }: { note?: string } = {}) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle");
  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (state === "sending") return;
    if (!email.includes("@") || email.length < 5) return setState("failed");
    setState("sending");
    if (!db) return setState("failed");
    const { error } = await db.from("waitlist").insert({ contact: email.trim(), side: "buyer" });
    setState(!error || error.code === "23505" ? "done" : "failed");
  }
  if (state === "done") return <p className="bw-note">You are on the list.</p>;
  return (
    <>
      <p className="bw-note">{note}</p>
      <form className="join" onSubmit={join}>
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
          {state === "sending" ? "Joining…" : "Notify me"}
        </button>
      </form>
      {state === "failed" && <p className="bad">That did not go through. Check the address and try again.</p>}
    </>
  );
}
