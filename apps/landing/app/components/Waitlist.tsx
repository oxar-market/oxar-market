"use client";

import { useState } from "react";
import {
  estimate,
  isValidContact,
  isValidHandle,
  normalizeContact,
  normalizeHandle,
  parseFollowers,
} from "@oxar/core";
import { submitWaitlist } from "@/lib/waitlist";
import { Notice } from "./Notice";

type Side = "seller" | "buyer";
type Status = "idle" | "sending" | "done" | "already" | "error";

export function Waitlist() {
  const [handle, setHandle] = useState("");
  const [side, setSide] = useState<Side>("seller");
  const [followers, setFollowers] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const cleanHandle = normalizeHandle(handle);
  const followerCount = parseFollowers(followers);
  const preview =
    side === "seller" && followerCount !== null && followerCount >= 100
      ? estimate(followerCount)
      : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!cleanHandle) {
      setError("Your X handle goes here, without the @.");
      return;
    }
    if (!isValidHandle(cleanHandle)) {
      setError("A handle is letters, numbers or underscores, up to 15 of them.");
      return;
    }
    if (!followers.trim()) {
      setError("How many followers does the account have?");
      return;
    }
    if (followers.trim() && followerCount === null) {
      setError("Followers should be a number, like 12400 or 12.4k.");
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
      x_handle: cleanHandle,
      side,
      follower_count: followerCount,
      contact: normalizeContact(contact),
    });

    if (result === "created") {
      setStatus("done");
    } else if (result === "duplicate") {
      setStatus("already");
    } else {
      setStatus("error");
      setError("Could not save that. Try again in a minute.");
    }
  }

  if (status === "done" || status === "already") {
    return (
      <div className="card" id="waitlist">
        <Notice
          tone="success"
          title={status === "done" ? "You're on the list" : "You're already on the list"}
        >
          We&apos;ll reach out on X to @{cleanHandle} before launch.
        </Notice>
        {preview && (
          <p className="estimate">
            Based on {(followerCount ?? 0).toLocaleString("en-US")} followers, your profile
            could bring <strong>${preview.monthlyLow}-${preview.monthlyHigh}</strong>{" "}
            a month. Estimate, not a promise.
          </p>
        )}
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

      <label>
        Your X handle
        <span className="prefixed">
          <span className="prefix" aria-hidden>
            @
          </span>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="yourhandle"
            autoComplete="off"
            spellCheck={false}
          />
        </span>
      </label>

      <label>
        Followers
        <input
          value={followers}
          onChange={(e) => setFollowers(e.target.value.replace(/[^\d.,\skmKM]/g, ""))}
          placeholder="12400"
          inputMode="numeric"
        />
      </label>

      <label>
        Email or Telegram
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder="you@mail.com or @telegram"
          autoComplete="off"
        />
      </label>

      {preview && (
        <p className="estimate">
          At {(followerCount ?? 0).toLocaleString("en-US")} followers, renting out your
          avatar, banner and bio link could bring{" "}
          <strong>
            ${preview.monthlyLow}-${preview.monthlyHigh}
          </strong>{" "}
          a month. Estimate, not a promise.
        </p>
      )}

      {error && <Notice tone="error">{error}</Notice>}

      <button type="submit" className="primary" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Join the waitlist"}
      </button>
    </form>
  );
}
