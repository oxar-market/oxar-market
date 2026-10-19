"use client";

import { useEffect, useState } from "react";
import { PROOF_DAY_END, earliestProofDay, parseUsd, shortWallet } from "@oxar/core";
import { prepareThing } from "@/lib/admin";
import { loadSellers, type Application } from "@/lib/applications";

/**
 * Подготовленный аукцион: админ заводит за продавца вещь, места и цены,
 * продавец входит своим кошельком, проверяет и публикует. Модель и
 * расположение мест на ней - потом, на странице вещи; там же и торг без
 * пруфа, если он нужен.
 */

type Row = { label: string; reserve: string; step: string };

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function PrepareThing({ onCancel, onPrepared }: { onCancel: () => void; onPrepared: (id: string) => void }) {
  const [sellers, setSellers] = useState<Application[] | null>(null);
  const [seller, setSeller] = useState("");
  const [title, setTitle] = useState("");
  const [opens, setOpens] = useState("");
  const [closes, setCloses] = useState("");
  const [proofDay, setProofDay] = useState("");
  const [rows, setRows] = useState<Row[]>([{ label: "", reserve: "", step: "5" }]);
  const [worn, setWorn] = useState({ by: "", where: "", when: "", about: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => void loadSellers().then(setSellers), []);

  const chosen = sellers?.find((one) => one.userId === seller) ?? null;
  const closesMs = Date.parse(closes);
  const opensMs = opens ? Date.parse(opens) : Date.now();
  const proofMin = Number.isFinite(closesMs) ? earliestProofDay(closes, "") : "";
  const spots = rows.map((row) => ({
    label: row.label.trim(),
    reserveCents: parseUsd(row.reserve),
    stepCents: parseUsd(row.step),
  }));
  // Что не так - словами, а не серой кнопкой.
  const problem = !chosen
    ? "Pick the seller."
    : !title.trim()
      ? "Name the thing."
      : !Number.isFinite(closesMs) || closesMs <= Math.max(Date.now(), opensMs)
        ? "The close has to be after now and after the opening."
        : closesMs > Date.now() + MONTH_MS
          ? "An auction cannot run longer than a month."
          : spots.some((spot) => !spot.label || !spot.reserveCents || !spot.stepCents)
            ? "Every spot needs a name, a starting price and a step."
            : !proofDay || proofDay < proofMin
              ? `Pick a proof day on ${proofMin || "the close day"} or later. With No money lockup it is not used.`
              : !worn.by.trim() || !worn.where.trim() || !worn.when.trim()
                ? "Fill in who has it, where and when."
                : null;

  async function submit() {
    if (problem || !chosen) return;
    setBusy(true);
    setError("");
    const id = await prepareThing({
      seller: chosen,
      title: title.trim(),
      opensAt: opens ? new Date(opensMs).toISOString() : null,
      closesAt: new Date(closesMs).toISOString(),
      proofBy: new Date(`${proofDay}T${PROOF_DAY_END}`).toISOString(),
      spots: spots.map((spot) => ({
        label: spot.label,
        reserveCents: spot.reserveCents!,
        stepCents: spot.stepCents!,
      })),
      worn: { by: worn.by.trim(), where: worn.where.trim(), when: worn.when.trim(), about: worn.about.trim() },
    });
    setBusy(false);
    if (id) onPrepared(id);
    else setError("Could not prepare it. Nothing was published - try again.");
  }

  return (
    <div className="sl-card ad-card ad-prepare">
      <h3>Prepare an auction for a seller</h3>
      <p className="muted">
        The seller signs in with their wallet, checks it and publishes. Their wallet opens the auction and gets
        the payout. Add the 3D model and place the spots on the thing page after this.
      </p>

      <label className="sl-field">
        Seller
        <select value={seller} onChange={(event) => setSeller(event.target.value)}>
          <option value="">{sellers === null ? "Loading…" : sellers.length === 0 ? "No approved sellers" : "Pick one"}</option>
          {(sellers ?? []).map((one) => (
            <option key={one.userId} value={one.userId}>
              {one.handle ? `@${one.handle} (${one.contact})` : one.contact} · {one.wallet ? shortWallet(one.wallet) : "no wallet"}
            </option>
          ))}
        </select>
      </label>

      <label className="sl-field">
        Thing
        <input value={title} maxLength={80} placeholder="The van" onChange={(event) => setTitle(event.target.value)} />
      </label>

      <div className="ad-rows">
        {/* Подписи колонок: на телефоне подсказки внутри полей обрезались до
            «Sta», и цифра в третьем поле читалась загадкой. */}
        <div className="ad-row ad-row-head" aria-hidden="true">
          <span>Spot</span>
          <span>Start, $</span>
          <span>Step, $</span>
          <span />
        </div>
        {rows.map((row, at) => (
          <div className="ad-row" key={at}>
            <input
              value={row.label}
              maxLength={40}
              placeholder="Hood"
              aria-label="Spot name"
              onChange={(event) => setRows(rows.map((one, i) => (i === at ? { ...one, label: event.target.value } : one)))}
            />
            <input
              value={row.reserve}
              inputMode="decimal"
              placeholder="100"
              aria-label="Starting price, $"
              onChange={(event) => setRows(rows.map((one, i) => (i === at ? { ...one, reserve: event.target.value } : one)))}
            />
            <input
              value={row.step}
              inputMode="decimal"
              placeholder="5"
              aria-label="Bid step, $"
              onChange={(event) => setRows(rows.map((one, i) => (i === at ? { ...one, step: event.target.value } : one)))}
            />
            <button
              type="button"
              className="sl-btn light ad-row-drop"
              aria-label="Remove this spot"
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((_, i) => i !== at))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="sl-btn light"
          onClick={() => setRows([...rows, { label: "", reserve: rows.at(-1)?.reserve ?? "", step: rows.at(-1)?.step ?? "5" }])}
        >
          Add a spot
        </button>
      </div>

      <label className="sl-field">
        Opens (your local time, empty - right after the seller publishes)
        <input type="datetime-local" value={opens} onChange={(event) => setOpens(event.target.value)} />
      </label>
      <label className="sl-field">
        Closes (your local time)
        <input type="datetime-local" value={closes} onChange={(event) => setCloses(event.target.value)} />
      </label>
      <label className="sl-field">
        Proof by (not used with No money lockup, pick any day)
        <input type="date" value={proofDay} min={proofMin} onChange={(event) => setProofDay(event.target.value)} />
      </label>

      <label className="sl-field">
        Who has it
        <input value={worn.by} maxLength={120} onChange={(event) => setWorn({ ...worn, by: event.target.value })} />
      </label>
      <label className="sl-field">
        Where
        <input value={worn.where} maxLength={120} onChange={(event) => setWorn({ ...worn, where: event.target.value })} />
      </label>
      <label className="sl-field">
        When
        <input value={worn.when} maxLength={120} onChange={(event) => setWorn({ ...worn, when: event.target.value })} />
      </label>
      <label className="sl-field">
        What is special (optional)
        <input value={worn.about} maxLength={120} onChange={(event) => setWorn({ ...worn, about: event.target.value })} />
      </label>

      {problem && <p className="muted">{problem}</p>}
      {error && <p className="bad">{error}</p>}
      <div className="ad-decide">
        <button type="button" className="sl-btn light" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="sl-btn dark" disabled={busy || problem !== null} onClick={() => void submit()}>
          {busy ? "Preparing…" : "Prepare"}
        </button>
      </div>
    </div>
  );
}
