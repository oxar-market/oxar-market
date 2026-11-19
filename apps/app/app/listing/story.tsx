"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import { loadThingProof, type ThingProof } from "@/lib/listing";
import type { Story } from "@/lib/story";

/**
 * Закрытый торг - не пустая витрина, а история: сколько собрали, как шли
 * ставки, кто забрал места и чем закончилось. Цифры и шаги считаются из
 * ставок и лотов; этап пруфа отмечен, только когда пруф правда есть.
 */

const day = (at: number | string) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Цифры итога - справа в шапке, вместо часов. */
export function StoryStats({ story, closedAt }: { story: Story; closedAt: number }) {
  const cells: [string, string][] = [
    ["Raised", formatUsd(story.raisedCents)],
    ["Spots sold", `${story.sold} of ${story.total}`],
    ["Bidders", String(story.bidders)],
    ["Ended", day(closedAt)],
  ];
  return (
    <dl className="st-stats">
      {cells.map(([label, value]) => (
        <div key={label}>
          <dt className="lt-cap">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Шаги торга с галочками: что уже было и когда. */
export function StoryTimeline({
  openedAt,
  closedAt,
  bids,
  proof,
}: {
  openedAt: number | null;
  closedAt: number;
  bids: number;
  proof: ThingProof | null | undefined;
}) {
  const steps: { label: string; note: string; done: boolean }[] = [
    { label: "Opened", note: openedAt ? day(openedAt) : "", done: true },
    { label: "Bidding", note: `${bids} ${bids === 1 ? "bid" : "bids"}`, done: bids > 0 },
    { label: "Closed", note: day(closedAt), done: true },
    {
      label: "Logos shown",
      note: proof ? (proof.provedAt ? `Proof ${day(proof.provedAt)}` : "Proof posted") : "No proof yet",
      done: Boolean(proof),
    },
  ];
  return (
    <div className="st-timeline">
      <span className="lt-cap">How it went</span>
      <ol>
        {steps.map((step) => (
          <li key={step.label} className={step.done ? "done" : ""}>
            <i aria-hidden>{step.done ? "✓" : ""}</i>
            <b>{step.label}</b>
            <span>{step.note}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Подиум, битвы за места и пруф - под торгом, перед «About». */
export function StoryBody({
  thingId,
  story,
  labelOf,
  onProof,
}: {
  thingId: string;
  story: Story;
  labelOf: (code: string) => string;
  onProof: (proof: ThingProof | null) => void;
}) {
  const [proof, setProof] = useState<ThingProof | null>(null);
  useEffect(() => {
    void loadThingProof(thingId).then((one) => {
      setProof(one);
      onProof(one);
    });
  }, [thingId, onProof]);

  return (
    <section className="st-body">
      {/* Один победитель - он и так в итогах справа, подиум из одного места ни к чему. */}
      {story.podium.length > 1 && (
        <>
          <h2>Top spots</h2>
          <div className="st-podium">
            {story.podium.map((one, index) => (
              <article key={one.spot} className="lt-card st-place">
                <span className={index === 0 ? "st-rank first" : "st-rank"}>#{index + 1}</span>
                <span className="st-who">
                  {one.mediaUrl && <img src={one.mediaUrl} alt="" />}
                  <b>{one.brand}</b>
                </span>
                <span className="st-amt">{formatUsd(one.amountCents)}</span>
                <span className="muted small">{labelOf(one.spot)}</span>
              </article>
            ))}
          </div>
        </>
      )}

      {story.battles.length > 0 && (
        <>
          <h2>Battles for spots</h2>
          <div className="st-battles">
            {story.battles.slice(0, 4).map((battle) => (
              <article key={battle.spot} className="lt-card st-battle">
                <header>
                  <b>{labelOf(battle.spot)}</b>
                  <span className="muted small">
                    {battle.steps.length} bids · {battle.brands} {battle.brands === 1 ? "bidder" : "bidders"}
                  </span>
                </header>
                <ol>
                  {battle.steps.map((step, index) => (
                    <li key={index} className={index === battle.steps.length - 1 ? "won" : ""}>
                      <span className="st-step-amt">{formatUsd(step.amountCents)}</span>
                      <span className="st-step-who">{step.brand}</span>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </>
      )}

      {proof && (proof.photos.length > 0 || proof.links.length > 0) && (
        <>
          <h2>Proof</h2>
          <article className="lt-card st-proof">
            {proof.photos.length > 0 && (
              <div className="st-proof-photos">
                {proof.photos.map((url) => (
                  <img key={url} src={url} alt="" />
                ))}
              </div>
            )}
            {proof.note && <p>{proof.note}</p>}
            {proof.links
              .filter((link) => link.startsWith("https://"))
              .map((link) => (
                <a key={link} href={link} target="_blank" rel="noreferrer">
                  {link.replace(/^https:\/\//, "")}
                </a>
              ))}
          </article>
        </>
      )}
    </section>
  );
}
