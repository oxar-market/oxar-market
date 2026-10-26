"use client";

import { useEffect, useState } from "react";
import { percentToBps, shortWallet } from "@oxar/core";
import { changeFee } from "@/lib/arbiter";
import { readTerms, type Terms } from "@/lib/chain";

/**
 * Условия площадки: комиссия с каждого проданного места. Меняет её только
 * админ программы, подписью в Phantom. Касса и монета остаются прежними,
 * админство отсюда не передаётся - это необратимо, и кнопки для него нет.
 */
export function FeeTerms() {
  const [terms, setTerms] = useState<Terms | null | undefined>(undefined);
  const [percent, setPercent] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState("");

  function reload() {
    void readTerms()
      .catch(() => null)
      .then(setTerms);
  }
  useEffect(reload, []);

  const bps = percentToBps(percent);
  const changed = bps !== null && terms && bps !== terms.feeBps;

  async function sign() {
    if (bps === null) return;
    setBusy(true);
    setProblem("");
    const result = await changeFee(bps);
    setBusy(false);
    setConfirming(false);
    if (result.ok) {
      setDone(`Fee set to ${bps / 100}%. Auctions opened from now on use it.`);
      setPercent("");
      reload();
    } else {
      setProblem(result.why);
    }
  }

  return (
    <>
      <div className="sl-head">
        <h2>Fee</h2>
      </div>
      <div className="sl-card ad-card">
        {terms === undefined && <p className="muted">Reading the terms from the network…</p>}
        {terms === null && <p className="bad">Could not read the terms from the network.</p>}
        {terms && (
          <>
            <p className="ad-fee-now">
              <b>{terms.feeBps / 100}%</b> of every sold spot and every sticker
            </p>
            <p className="muted small">
              Goes to {shortWallet(terms.platform.toBase58())}. Admin {shortWallet(terms.admin.toBase58())}.
            </p>
            <p className="muted">
              A new fee applies only to auctions opened after the change. Auctions already open keep the
              fee they opened with: it is locked in when the seller opens the auction.
            </p>
            <label className="sl-field">
              New fee, percent
              <span className="sl-input">
                <input
                  inputMode="decimal"
                  placeholder={String(terms.feeBps / 100)}
                  value={percent}
                  onChange={(event) => {
                    setPercent(event.target.value.replace(/[^\d.]/g, ""));
                    setConfirming(false);
                    setDone("");
                  }}
                />
              </span>
            </label>
            {!confirming ? (
              <button
                type="button"
                className="sl-btn light"
                disabled={!changed || busy}
                onClick={() => setConfirming(true)}
              >
                {changed ? `Change to ${(bps as number) / 100}%` : "Change fee"}
              </button>
            ) : (
              <div className="ad-choice">
                <p>
                  Change the fee from <b>{terms.feeBps / 100}%</b> to <b>{(bps as number) / 100}%</b> for
                  every auction opened from now on?
                </p>
                <button type="button" className="sl-btn dark" disabled={busy} onClick={sign}>
                  {busy ? "Waiting for Phantom…" : "Sign in Phantom"}
                </button>
                <button type="button" className="sl-btn light" disabled={busy} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            )}
            <p className="muted small">Signed in Phantom with the program admin key.</p>
          </>
        )}
        {done && <p className="muted">{done}</p>}
        {problem && <p className="bad">{problem}</p>}
      </div>
    </>
  );
}
