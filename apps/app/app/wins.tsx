"use client";

import { useEffect, useState } from "react";
import { useConnectedStandardWallets, useStandardSignTransaction } from "@privy-io/react-auth/solana";
import { PublicKey } from "@solana/web3.js";
import { APPEAL_SECONDS, ARBITER_SECONDS, formatUsd, settledOutcome, spotName, spotStage } from "@oxar/core";
import { WALLET_CHAIN } from "@/lib/chain";
import { NoEmailHint } from "./notify.tsx";
import { Gallery } from "./gallery.tsx";
import { photoUrl } from "@/lib/seller";
import { confirmWin, disputeWin, loadMyWins, type Win } from "@/lib/wins";
import type { MyStand } from "@/lib/auction";

/**
 * Выигранные места под защитой покупателя. Деньги держит программа, пока
 * продавец не покажет вещь в деле; дальше у победителя 72 часа сказать «да»
 * (выплата сразу) или «нет» (решает OXAR). Молчание - тоже «да», после окна.
 */
export function YourWins({ stands }: { stands: MyStand[] }) {
  const [wins, setWins] = useState<Win[] | null>(null);
  const { wallets } = useConnectedStandardWallets();
  const { signTransaction } = useStandardSignTransaction();
  const wallet = wallets[0];
  const reload = () => void loadMyWins(stands).then(setWins);
  useEffect(reload, [stands]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!wins || wins.length === 0) return null;
  const sign = async (transaction: import("@solana/web3.js").VersionedTransaction) => {
    const { signedTransaction } = await signTransaction({ transaction: transaction.serialize(), wallet: wallet!, chain: WALLET_CHAIN });
    return signedTransaction;
  };
  return (
    <>
      <div className="bids-head">
        <span className="hist-title">Your wins</span>
      </div>
      <NoEmailHint text="Proof arrives on its own schedule, and you have 72 hours to check it. Add an email so the window does not pass silently." />
      <div className="wins">
        {wins.map((win) => (
          <WinCard
            key={win.lotId}
            win={win}
            winner={wallet ? new PublicKey(wallet.address) : null}
            sign={sign}
            onDone={reload}
          />
        ))}
      </div>
    </>
  );
}

function WinCard({
  win,
  winner,
  sign,
  onDone,
}: {
  win: Win;
  winner: PublicKey | null;
  sign: (transaction: import("@solana/web3.js").VersionedTransaction) => Promise<Uint8Array>;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");

  const day = (seconds: number) =>
    new Date(seconds * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const now = Math.floor(Date.now() / 1000);
  const head = (
    <span className="win-what">
      {spotName(win.spot)} · {win.thing} · {formatUsd(win.cents)}
    </span>
  );

  // Аккаунт места закрыт - деньги ушли: продавцу или назад победителю.
  if (!win.lot || !win.sale) {
    const share = win.dispute?.sellerBps ?? null;
    const outcome = settledOutcome({ sellerBps: share, proved: win.proof !== null, refunded: win.refunded });
    const text =
      share === null
        ? outcome === "paid"
          ? "Paid to the seller. Done."
          : "Settled. Your bid came back to your wallet."
        : outcome === "paid"
          ? "OXAR reviewed it: paid to the seller."
          : outcome === "refunded"
            ? "OXAR reviewed it: your bid came back to your wallet."
            : `OXAR reviewed it: ${share / 100}% to the seller, the rest came back to your wallet.`;
    return (
      <div className="win-card">
        {head}
        <p className="muted">{text}</p>
      </div>
    );
  }

  const stage = spotStage(win.sale, win.lot, now);
  async function run(job: () => Promise<boolean>, failure: string) {
    setBusy(true);
    setProblem("");
    const ok = await job();
    setBusy(false);
    if (ok) onDone();
    else setProblem(failure);
  }

  return (
    <div className="win-card">
      {head}
      {stage === "awaiting_proof" && (
        <p className="muted">
          Your money is in escrow. The seller shows the thing in use by {day(win.sale.proofDeadline)}; no proof by
          then, and your bid comes back.
        </p>
      )}
      {stage === "proof_missed" && <p className="muted">No proof by the deadline. Your bid is on its way back.</p>}
      {stage === "disputed" && (
        // Что будет дальше - первой строкой: после спора человек остаётся с
        // замороженными деньгами и должен знать, кто решает и до какого дня.
        <>
          <p className="muted">
            You disputed this. OXAR reviews it and decides. Your {formatUsd(win.cents)} stays locked until then.
          </p>
          {win.dispute && <p className="muted">Your reason: {win.dispute.reason}</p>}
          <p className="muted">
            Opened {day(win.lot.disputedAt)}. If there is no decision by {day(win.lot.disputedAt + ARBITER_SECONDS)},
            your bid comes back.
          </p>
        </>
      )}
      {stage === "dispute_lapsed" && <p className="muted">No decision in 30 days. Your bid is on its way back.</p>}
      {stage === "payable" && <p className="muted">The check window is over. Your bid goes to the seller.</p>}
      {stage === "appeal" && (
        <>
          <p className="muted">
            The seller sent proof. Check it by {day(win.sale.provedAt + APPEAL_SECONDS)}: if it is fine, release the
            payment; if not, dispute it and OXAR decides. No answer by then counts as fine.
          </p>
          {win.proof && (
            <>
              {win.proof.photos.length > 0 && (
                <Gallery urls={win.proof.photos.map(photoUrl)} listClass="sl-minis" itemClass="sl-mini" />
              )}
              {win.proof.links.map((link) => (
                <a key={link} className="win-link" href={link} target="_blank" rel="noreferrer">
                  {link}
                </a>
              ))}
              {win.proof.note && <p className="muted">{win.proof.note}</p>}
            </>
          )}
          {disputing ? (
            <>
              <label className="sl-field wide">
                What is wrong
                <span className="sl-input tall">
                  <textarea
                    rows={3}
                    value={reason}
                    maxLength={1000}
                    placeholder="My logo is not on the thing in these photos."
                    onChange={(event) => setReason(event.target.value)}
                  />
                </span>
              </label>
              <div className="win-actions">
                <button type="button" className="sl-pill" disabled={busy} onClick={() => setDisputing(false)}>
                  Back
                </button>
                <button
                  type="button"
                  className="sl-btn dark"
                  disabled={busy || !winner || reason.trim().length < 3}
                  onClick={() => run(() => disputeWin(win, winner!, reason, sign), "The dispute was not sent. Try again.")}
                >
                  {busy ? "Sending…" : "Send dispute"}
                </button>
              </div>
            </>
          ) : (
            // Два ответа одного веса: крупная тёмная «выплатить» рядом с
            // мелкой «спорить» подталкивала победителя к выплате.
            <div className="win-pair">
              <button type="button" className="sl-btn light" disabled={busy} onClick={() => setDisputing(true)}>
                Open a dispute
              </button>
              <button
                type="button"
                className="sl-btn light"
                disabled={busy || !winner}
                onClick={() => run(() => confirmWin(win, winner!, sign), "The payment was not released. Try again.")}
              >
                {busy ? "Releasing…" : "Release payment"}
              </button>
            </div>
          )}
        </>
      )}
      {problem && <p className="bad">{problem}</p>}
    </div>
  );
}
