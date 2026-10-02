"use client";

import { useEffect, useState } from "react";
import { arbiterSplit, formatUsd } from "@oxar/core";
import { decideDispute, loadAwaitingProof, loadDisputes, moveProof, type AwaitingProof, type Dispute } from "@/lib/arbiter";
import { photoUrl } from "@/lib/seller";
import { spotName } from "@/lib/auction";

/**
 * Арбитр: споры по местам и сроки пруфа. Подпись - Phantom с ключом админа
 * программы; без него программа отклонит и решение, и перенос.
 */
export function Disputes({ onCount }: { onCount?: (open: number) => void }) {
  const [disputes, setDisputes] = useState<Dispute[] | null>(null);
  const [waiting, setWaiting] = useState<AwaitingProof[] | null>(null);
  function reload() {
    void loadDisputes().then((list) => {
      setDisputes(list);
      onCount?.(list.filter((one) => one.lot && one.sellerBps === null).length);
    });
    void loadAwaitingProof().then(setWaiting);
  }
  useEffect(reload, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="sl-head">
        <h2>Disputes</h2>
        <span>{disputes?.filter((one) => one.lot && one.sellerBps === null).length ?? ""}</span>
      </div>
      {disputes?.length === 0 && <p className="muted">No disputes.</p>}
      {(disputes ?? []).map((one) => (
        <DisputeCard key={one.lotId} dispute={one} onDone={reload} />
      ))}

      <div className="sl-head">
        <h2>Waiting for proof</h2>
        <span>{waiting?.length ?? ""}</span>
      </div>
      {waiting?.length === 0 && <p className="muted">Nothing is waiting for proof.</p>}
      {(waiting ?? []).map((one) => (
        <MoveCard key={one.sale.toBase58()} sale={one} onDone={reload} />
      ))}
    </>
  );
}

function DisputeCard({ dispute, onDone }: { dispute: Dispute; onDone: () => void }) {
  const [percent, setPercent] = useState("50");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const settled = !dispute.lot || !dispute.sale;
  const top = dispute.lot?.topBid ?? 0n;
  // USDC - шесть знаков, цент - это десять тысяч базовых единиц.
  const usd = (units: bigint) => formatUsd(Number(units / 10_000n));
  const preview = (bps: number) => {
    if (!dispute.sale) return "";
    const split = arbiterSplit(top, bps, dispute.sale.feeBps);
    return `seller ${usd(split.toSeller)} · fee ${usd(split.fee)} · winner ${usd(split.toWinner)}`;
  };
  const bps = Math.round(Number(percent) * 100);
  const valid = Number.isFinite(bps) && bps >= 0 && bps <= 10_000;

  async function decide(share: number) {
    setBusy(true);
    setProblem("");
    const result = await decideDispute(dispute, share);
    setBusy(false);
    if (result.ok) onDone();
    else setProblem(result.why);
  }

  return (
    <div className="sl-card ad-card">
      <h3>
        {spotName(dispute.spot)} · {dispute.thing}
      </h3>
      <p className="muted">
        Bid {formatUsd(dispute.cents)} · disputed {new Date(dispute.createdAt).toLocaleString("en-US")}
      </p>
      <p>
        <b>Winner says:</b> {dispute.reason}
      </p>
      {dispute.proof && (
        <>
          <div className="ad-photos">
            {dispute.proof.photos.map((path) => (
              <a className="sl-photo" key={path} href={photoUrl(path)} target="_blank" rel="noreferrer">
                <img src={photoUrl(path)} alt="" />
              </a>
            ))}
          </div>
          {dispute.proof.links.map((link) => (
            <a key={link} className="win-link" href={link} target="_blank" rel="noreferrer">
              {link}
            </a>
          ))}
          {dispute.proof.note && <p className="muted">{dispute.proof.note}</p>}
        </>
      )}
      {settled ? (
        <p className="muted">
          {dispute.sellerBps === null
            ? "Settled without a decision: 30 days passed and the bid went back to the winner."
            : `Decided: ${dispute.sellerBps / 100}% to the seller.`}
        </p>
      ) : (
        <>
          <button type="button" className="sl-btn dark" disabled={busy} onClick={() => decide(10_000)}>
            All to seller · {preview(10_000)}
          </button>
          <button type="button" className="sl-btn light" disabled={busy} onClick={() => decide(0)}>
            All to winner · {preview(0)}
          </button>
          <label className="sl-field">
            Or split: percent to the seller
            <span className="sl-input">
              <input inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value.replace(/[^\d.]/g, ""))} />
            </span>
          </label>
          {valid && <p className="muted">{preview(bps)}</p>}
          <button type="button" className="sl-btn light" disabled={busy || !valid} onClick={() => decide(bps)}>
            Split {valid ? `${bps / 100}% / ${100 - bps / 100}%` : ""}
          </button>
          <p className="muted">Signed in Phantom with the program admin key.</p>
        </>
      )}
      {problem && <p className="bad">{problem}</p>}
    </div>
  );
}

function MoveCard({ sale, onDone }: { sale: AwaitingProof; onDone: () => void }) {
  const current = new Date(sale.chain.proofDeadline * 1000);
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const next = day ? Date.parse(`${day}T23:59`) : NaN;
  const later = Number.isFinite(next) && next / 1000 > sale.chain.proofDeadline;

  return (
    <div className="sl-card ad-card">
      <h3>{sale.thing}</h3>
      <p className="muted">
        Proof due {current.toLocaleString("en-US")}. Move it later if the event moved; never earlier.
      </p>
      <label className="sl-field">
        New proof day
        <span className="sl-input">
          <input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
        </span>
      </label>
      <button
        type="button"
        className="sl-btn light"
        disabled={busy || !later}
        onClick={async () => {
          setBusy(true);
          setProblem("");
          const result = await moveProof(sale.sale, next);
          setBusy(false);
          if (result.ok) onDone();
          else setProblem(result.why);
        }}
      >
        Move the proof deadline
      </button>
      {problem && <p className="bad">{problem}</p>}
    </div>
  );
}
