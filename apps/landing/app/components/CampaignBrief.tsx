"use client";

import { useState } from "react";
import {
  formatUsd,
  isValidContact,
  normalizeContact,
  parseBudgetCents,
  parseFollowers,
  placementSpec,
  type PlacementKind,
} from "@oxar/core";
import { submitCampaign } from "@/lib/campaigns";
import { Notice } from "./Notice";

/**
 * Покупатель говорит, какая кампания ему нужна, вместо того чтобы выбирать из
 * пустой витрины.
 *
 * Корзину показать нельзя: наполнить её нечем, а выдуманные аккаунты с
 * выдуманными ценами - ровно то, за что мы сняли калькулятор. Зато все числа
 * заявки принадлежат самому покупателю, поэтому её можно показать целиком, не
 * подделывая ничего.
 *
 * Итоговой суммы здесь нет намеренно: посчитать её мы могли бы только по своим
 * ставкам, а ставок с источником у нас нет. Вместо суммы - его бюджет, и рядом
 * деление бюджета на число размещений, потому что это тоже его число.
 */

type Status = "idle" | "sending" | "done" | "error";

export function CampaignBrief({ kind }: { kind: PlacementKind }) {
  const spec = placementSpec(kind);
  const [wanted, setWanted] = useState("");
  const [minFollowers, setMinFollowers] = useState("");
  const [days, setDays] = useState(String(spec.defaultDays));
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const count = Number.parseInt(wanted, 10);
  const budgetCents = parseBudgetCents(budget);
  const perPlacement =
    budgetCents && count > 0 ? Math.round(budgetCents / count) : null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      setError("How many accounts do you need? Anything from 1 to 1000.");
      return;
    }
    const termDays = Number.parseInt(days, 10);
    if (!Number.isInteger(termDays) || termDays < 1 || termDays > 365) {
      setError("How long should it run? Anything from 1 to 365 days.");
      return;
    }
    if (budgetCents === null) {
      setError("Give a budget for the whole campaign, like 2000 or 2k.");
      return;
    }
    // Порог аудитории необязателен, но если его набрали - он должен быть числом,
    // иначе заявка уедет с молча выброшенным требованием.
    const floor = minFollowers.trim() ? parseFollowers(minFollowers) : null;
    if (minFollowers.trim() && floor === null) {
      setError("Minimum followers should be a number, like 10000 or 10k.");
      return;
    }
    if (!isValidContact(contact)) {
      setError(
        "Use an email with a domain, like you@mail.com, or a Telegram handle with the @.",
      );
      return;
    }

    setStatus("sending");
    const result = await submitCampaign({
      placement: kind,
      placements_wanted: count,
      min_followers: floor,
      term_days: termDays,
      budget_cents: budgetCents,
      contact: normalizeContact(contact),
      notes: notes.trim() || null,
    });

    if (result === "created") {
      setStatus("done");
    } else {
      setStatus("error");
      setError("Could not send that. Try again in a minute.");
    }
  }

  if (status === "done") {
    return (
      <div className="card">
        <Notice tone="success" title="We have it">
          We&apos;ll be in touch on {normalizeContact(contact)}. We put campaigns
          together by hand right now, so you see exactly which accounts we got
          before any money moves.
        </Notice>
      </div>
    );
  }

  return (
    <form className="card brief" onSubmit={submit} noValidate>
      {/* Название места не повторяем: оно стоит заголовком строкой выше, а
          «Need avatar at scale» и «Need bio link at scale» читаются криво. */}
      <h2>Need this at scale?</h2>

      {/* Состояние названо прямо, но так, чтобы не спорить с барьером на ценах
          рядом: «никто не выставлен» и «цены открываются с вейтлистом» на одном
          экране противоречат друг другу, а «собираем руками» верно всегда. */}
      <p className="small muted">
        We put campaigns together by hand right now. Say what you need and we
        come back with who is in.
      </p>

      <div className="brief-pair">
        <label>
          How many accounts <span className="need">required</span>
          <input
            value={wanted}
            onChange={(event) => setWanted(event.target.value)}
            placeholder="50"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>

        <label>
          For how many days <span className="need">required</span>
          <input
            value={days}
            onChange={(event) => setDays(event.target.value)}
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="brief-pair">
        <label>
          Minimum followers <span className="need">optional</span>
          <input
            value={minFollowers}
            onChange={(event) => setMinFollowers(event.target.value)}
            placeholder="10k"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>

        <label>
          Budget for the campaign <span className="need">required</span>
          <input
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            placeholder="2000"
            inputMode="numeric"
            autoComplete="off"
          />
        </label>
      </div>

      {perPlacement !== null && (
        <p className="small muted">
          That is {formatUsd(perPlacement)} per account. You set the number, we
          tell you who says yes at it.
        </p>
      )}

      <label>
        Anything else <span className="need">optional</span>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Crypto accounts, launch week of Oct 5"
          autoComplete="off"
        />
      </label>

      <label>
        Email or Telegram <span className="need">either one</span>
        <input
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="you@mail.com or @telegram"
          autoComplete="off"
        />
      </label>

      {error && <Notice tone="error">{error}</Notice>}

      <button type="submit" className="primary" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Send the brief"}
      </button>
    </form>
  );
}
