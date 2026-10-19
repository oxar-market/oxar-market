"use client";

import { useEffect, useState } from "react";
import { PROOF_DAY_END, earliestProofDay, formatUsd, parseUsd, shortWallet } from "@oxar/core";
import { giveToSeller, loadSpotPlans, type AdminThing } from "@/lib/admin";
import { loadSellers, type Application } from "@/lib/applications";

/**
 * Передать подготовленную вещь продавцу. Места и плановые цены у вещи уже
 * есть: карточка подставляет их и дату открытия вещи, всё можно поправить.
 */

/** Время для поля datetime-local - в местном часовом поясе, как его и вводят. */
function localInput(iso: string | null): string {
  if (!iso) return "";
  const at = new Date(iso);
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export function GiveToSeller({ thing, onDone }: { thing: AdminThing; onDone: () => void }) {
  const [sellers, setSellers] = useState<Application[] | null>(null);
  const [seller, setSeller] = useState("");
  const [opens, setOpens] = useState(() => localInput(thing.opensAt));
  const [closes, setCloses] = useState("");
  const [proofDay, setProofDay] = useState("");
  const [prices, setPrices] = useState<Record<string, { reserve: string; step: string }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => void loadSellers().then(setSellers), []);
  useEffect(() => {
    void loadSpotPlans(thing.spots.map((spot) => spot.id)).then((plans) =>
      setPrices(
        Object.fromEntries(
          thing.spots.map((spot) => {
            const plan = plans[spot.id];
            return [spot.id, { reserve: plan ? String(plan.reserveCents / 100) : "", step: plan ? String(plan.stepCents / 100) : "" }];
          }),
        ),
      ),
    );
  }, [thing.spots]);

  const chosen = sellers?.find((one) => one.userId === seller) ?? null;
  const closesMs = Date.parse(closes);
  const opensMs = opens ? Date.parse(opens) : Date.now();
  const proofMin = Number.isFinite(closesMs) ? earliestProofDay(closes, "") : "";
  const rows = thing.spots.map((spot) => ({
    spot,
    reserveCents: parseUsd(prices[spot.id]?.reserve ?? ""),
    stepCents: parseUsd(prices[spot.id]?.step ?? ""),
  }));
  const problem = !chosen
    ? "Pick the seller."
    : !Number.isFinite(closesMs) || closesMs <= Math.max(Date.now(), opensMs)
      ? "The close has to be after now and after the opening."
      : closesMs > Date.now() + MONTH_MS
        ? "An auction cannot run longer than a month."
        : rows.some((row) => !row.reserveCents || !row.stepCents)
          ? "Every spot needs a starting price and a step."
          : !proofDay || proofDay < proofMin
            ? `Pick a proof day on ${proofMin || "the close day"} or later. With No money lockup it is not used.`
            : null;

  async function submit() {
    if (problem || !chosen) return;
    setBusy(true);
    setError("");
    const done = await giveToSeller({
      thing,
      seller: chosen,
      opensAt: opens ? new Date(opensMs).toISOString() : null,
      closesAt: new Date(closesMs).toISOString(),
      proofBy: new Date(`${proofDay}T${PROOF_DAY_END}`).toISOString(),
      prices: rows.map((row) => ({ spotId: row.spot.id, reserveCents: row.reserveCents!, stepCents: row.stepCents! })),
    });
    setBusy(false);
    if (done) onDone();
    else setError("Could not give it to the seller. Nothing was published - try again.");
  }

  const total = rows.reduce((sum, row) => sum + (row.reserveCents ?? 0), 0);

  return (
    <div className="sl-card ad-card ad-prepare">
      <h3>Give to a seller</h3>
      <p className="muted">
        The seller signs in with their wallet, checks the prices and publishes. Their wallet opens the auction and gets
        the payout. Prices and dates come from the thing&apos;s plan - change any of them.
      </p>

      <label className="sl-field">
        Seller
        <select value={seller} onChange={(event) => setSeller(event.target.value)}>
          <option value="">{sellers === null ? "Loading…" : sellers.length === 0 ? "No approved sellers" : "Pick one"}</option>
          {(sellers ?? []).map((one) => (
            <option key={one.userId} value={one.userId}>
              {one.contact} · {one.wallet ? shortWallet(one.wallet) : "no wallet"}
            </option>
          ))}
        </select>
      </label>

      <div className="ad-rows">
        <div className="ad-row ad-row-head" aria-hidden="true">
          <span>Spot</span>
          <span>Start, $</span>
          <span>Step, $</span>
          <span />
        </div>
        {thing.spots.map((spot) => (
          <div className="ad-row" key={spot.id}>
            <span className="ad-row-name">{spot.label}</span>
            <input
              value={prices[spot.id]?.reserve ?? ""}
              inputMode="decimal"
              aria-label={`${spot.label}: starting price, $`}
              onChange={(event) => setPrices({ ...prices, [spot.id]: { ...prices[spot.id]!, reserve: event.target.value } })}
            />
            <input
              value={prices[spot.id]?.step ?? ""}
              inputMode="decimal"
              aria-label={`${spot.label}: bid step, $`}
              onChange={(event) => setPrices({ ...prices, [spot.id]: { ...prices[spot.id]!, step: event.target.value } })}
            />
            <span />
          </div>
        ))}
        <p className="muted">Starting prices add up to {formatUsd(total)}.</p>
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

      {problem && <p className="muted">{problem}</p>}
      {error && <p className="bad">{error}</p>}
      <div className="ad-decide">
        <button type="button" className="sl-btn dark" disabled={busy || problem !== null} onClick={() => void submit()}>
          {busy ? "Giving…" : "Give to the seller"}
        </button>
      </div>
    </div>
  );
}
