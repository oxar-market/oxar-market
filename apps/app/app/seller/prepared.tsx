"use client";

import { formatUsd, shortWallet } from "@oxar/core";
import type { PricingThing } from "@/lib/seller";
import { Bar } from "./parts.tsx";

/**
 * Подготовленный аукцион глазами продавца: всё уже стоит - места, цены,
 * закрытие. Он проверяет и публикует своим кошельком: его подпись открывает
 * торг, он платит залог за аккаунты и получает выплату.
 */
export function PreparedReview({
  thing,
  wallet,
  publishing,
  problem,
  onBack,
  onPublish,
}: {
  thing: PricingThing;
  wallet: string | null;
  publishing: boolean;
  problem: string;
  onBack: () => void;
  onPublish: () => void;
}) {
  const closes = thing.drafts[0]?.closesAt ?? null;
  // Разрешение без пруфа выдано одному кошельку: другим торг не откроется.
  const wrongWallet = thing.noLockup && thing.sellerWallet !== null && wallet !== null && wallet !== thing.sellerWallet;
  const ready = thing.drafts.length > 0 && wallet !== null && !wrongWallet;

  return (
    <>
      <Bar title={thing.title} onBack={onBack} />
      <div className="sl-card sl-plan">
        <div className="sl-plan-head">
          <h3>Prepared by OXAR</h3>
        </div>
        <p className="sl-plan-note">
          Check it and publish. The auction opens from your wallet, and the winning bids are paid to it.
        </p>
        <ul className="ad-prices">
          {thing.drafts.map((draft) => (
            <li key={draft.spotId}>
              {thing.spots.find((one) => one.id === draft.spotId)?.label ?? "Spot"} · from {formatUsd(draft.reserveCents)}{" "}
              · step {formatUsd(draft.stepCents)}
            </li>
          ))}
        </ul>
        {closes && <p className="sl-plan-note">Closes {new Date(closes).toLocaleString()}.</p>}
        {(thing.worn.by || thing.worn.where || thing.worn.when) && (
          <p className="sl-plan-note">
            {[thing.worn.by, thing.worn.where, thing.worn.when].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="sl-plan-note">
          {thing.noLockup
            ? "The winning bids are paid to your wallet as soon as the auction closes."
            : "After the auction, show the thing in use with the logos on it. Winners get 72 hours to check it, then you are paid."}
        </p>
      </div>

      {wrongWallet && (
        <p className="bad">
          This auction is set up for the wallet {shortWallet(thing.sellerWallet!)}. Sign in with that wallet to publish
          it.
        </p>
      )}
      {thing.drafts.length === 0 && <p className="muted">Nothing to publish yet: the prices are not set.</p>}
      {problem && <p className="bad">{problem}</p>}

      <div className="sl-card sl-publish">
        <b>{thing.drafts.length === 1 ? "1 by auction" : `${thing.drafts.length} by auction`}</b>
        <span>Then we check it and put it on the Market</span>
        <button type="button" className="sl-btn dark" disabled={!ready || publishing} onClick={onPublish}>
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>
    </>
  );
}
