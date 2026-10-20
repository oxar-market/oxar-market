"use client";

import { useEffect, useState } from "react";
import { PROOF_DAY_END, earliestProofDay, formatUsd, parseUsd, shortWallet } from "@oxar/core";
import { giveToSeller, loadSpotPlans, type AdminThing } from "@/lib/admin";
import { loadSellers, type Application } from "@/lib/applications";
import { STICKER_CAP, STICKER_PRICE_CENTS } from "@/lib/stickers";

/**
 * Передать подготовленную вещь продавцу. Места и плановые цены у вещи уже
 * есть: карточка подставляет их и дату открытия вещи, всё можно поправить.
 * Всё, что подписывает админ, - одной подписью в конце.
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
  const [noLockup, setNoLockup] = useState(true);
  const [stickers, setStickers] = useState({ price: String(STICKER_PRICE_CENTS / 100), count: String(STICKER_CAP) });
  const [stickersToAdmin, setStickersToAdmin] = useState(false);
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
  const stickerPrice = parseUsd(stickers.price);
  const stickerCount = stickers.count.trim() === "" ? 0 : Number(stickers.count);
  const problem = !chosen
    ? "Pick the seller."
    : !Number.isFinite(closesMs) || closesMs <= Math.max(Date.now(), opensMs)
      ? "The close has to be after now and after the opening."
      : closesMs > Date.now() + MONTH_MS
        ? "An auction cannot run longer than a month."
        : rows.some((row) => !row.reserveCents || !row.stepCents)
          ? "Every spot needs a starting price and a step."
          : !Number.isInteger(stickerCount) || stickerCount < 0 || stickerCount > 1000 || (stickerCount > 0 && !stickerPrice)
            ? "Stickers need a whole number from 0 to 1000 and a price."
            : !noLockup && (!proofDay || proofDay < proofMin)
              ? `Pick a proof day on ${proofMin || "the close day"} or later.`
              : null;

  async function submit() {
    if (problem || !chosen) return;
    setBusy(true);
    setError("");
    // Без пруфа срок пруфа не нужен, но в черновиках он обязателен для торга
    // с пруфом - ставим любой после закрытия, публикация его сотрёт.
    const proofBy = noLockup
      ? new Date(closesMs + 14 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(`${proofDay}T${PROOF_DAY_END}`).toISOString();
    const done = await giveToSeller({
      thing,
      seller: chosen,
      opensAt: opens ? new Date(opensMs).toISOString() : null,
      closesAt: new Date(closesMs).toISOString(),
      proofBy,
      prices: rows.map((row) => ({ spotId: row.spot.id, reserveCents: row.reserveCents!, stepCents: row.stepCents! })),
      noLockup,
      stickers: stickerCount > 0 ? { priceCents: stickerPrice!, cap: stickerCount, toAdmin: stickersToAdmin } : null,
    });
    setBusy(false);
    if (done.ok) onDone();
    else setError(done.why);
  }

  const total = rows.reduce((sum, row) => sum + (row.reserveCents ?? 0), 0);

  return (
    <div className="sl-card ad-card ad-prepare ad-give">
      <h3>Give to a seller</h3>
      <p className="muted">
        The seller signs in with their wallet, checks the prices and publishes. Their wallet opens the auction and gets
        the payout. Prices and dates come from the thing&apos;s plan - change any of them. One signature in Phantom at
        the end; the thing then shows on the Market by itself.
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

      <div className="ad-rows">
        <div className="ad-row priced ad-row-head" aria-hidden="true">
          <span>Spot</span>
          <span>Start, $</span>
          <span>Step, $</span>
        </div>
        {thing.spots.map((spot) => (
          <div className="ad-row priced" key={spot.id}>
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
      <label className="ad-check">
        <input type="checkbox" checked={noLockup} onChange={(event) => setNoLockup(event.target.checked)} />
        <span>
          <b>No money lockup</b>
          <span className="muted">The seller is paid at close, without proof.</span>
        </span>
      </label>
      {!noLockup && (
        <label className="sl-field">
          Proof by
          <input type="date" value={proofDay} min={proofMin} onChange={(event) => setProofDay(event.target.value)} />
        </label>
      )}

      <div className="ad-pair">
        <label className="sl-field">
          Sticker price, $
          <input
            value={stickers.price}
            inputMode="decimal"
            onChange={(event) => setStickers({ ...stickers, price: event.target.value })}
          />
        </label>
        <label className="sl-field">
          Stickers, 0 = none
          <input
            value={stickers.count}
            inputMode="numeric"
            onChange={(event) => setStickers({ ...stickers, count: event.target.value })}
          />
        </label>
      </div>
      <label className="sl-field">
        Sticker money goes to
        <select value={stickersToAdmin ? "admin" : "seller"} onChange={(event) => setStickersToAdmin(event.target.value === "admin")}>
          <option value="seller">The seller, minus the platform fee</option>
          <option value="admin">OXAR: the admin wallet you sign with, minus the platform fee</option>
        </select>
      </label>

      {problem && <p className="muted">{problem}</p>}
      {error && <p className="bad">{error}</p>}
      <button type="button" className="sl-btn dark ad-go" disabled={busy || problem !== null} onClick={() => void submit()}>
        {busy ? "Signing…" : "Give and sign in Phantom"}
      </button>
    </div>
  );
}
