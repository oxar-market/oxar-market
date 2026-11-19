"use client";

import { useEffect } from "react";
import { formatUsd } from "@oxar/core";
import { loadThingProof, type ThingProof } from "@/lib/listing";
import type { Story } from "@/lib/story";
import { Media } from "../gallery.tsx";

/**
 * Закрытый торг - не пустая витрина, а история, рассказанная крупным шрифтом
 * без карточек: сколько собрали, кто забрал места, где за место боролись и
 * чем кончилось. Цифры и шаги считаются из ставок и лотов; шаг пруфа
 * отмечен, только когда пруф правда есть.
 */

const day = (at: number | string) =>
  new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Итог одной фразой и путь торга - сразу под названием. */
export function StoryHero({
  story,
  openedAt,
  closedAt,
  proof,
  refundedAt,
}: {
  story: Story;
  openedAt: number | null;
  closedAt: number;
  proof: ThingProof | null | undefined;
  /** Деньги вернули мимо программы - последний шаг «Refunded», а не пруф. */
  refundedAt: string | null;
}) {
  const path: { label: string; when: string; done: boolean }[] = [
    { label: "Opened", when: openedAt ? day(openedAt) : "", done: true },
    { label: "First bid", when: story.firstBidAt ? day(story.firstBidAt) : "", done: Boolean(story.firstBidAt) },
    { label: "Closed", when: day(closedAt), done: true },
    refundedAt
      ? { label: "Refunded", when: day(refundedAt), done: true }
      : {
          label: "Logos shown",
          when: proof ? (proof.provedAt ? day(proof.provedAt) : "") : "Waiting for proof",
          done: Boolean(proof),
        },
  ];
  return (
    <section className="sx-hero">
      <p className="sx-kicker">
        Auction closed{openedAt ? ` · ${day(openedAt)} to ${day(closedAt)}` : ` · ${day(closedAt)}`}
      </p>
      <p className="sx-big">{formatUsd(story.raisedCents)}</p>
      <p className="sx-line">
        raised from <b>{plural(story.bidders, "bidder", "bidders")}</b> across{" "}
        <b>{plural(story.bids, "bid", "bids")}</b>.{" "}
        {story.total === 1 ? (
          story.sold ? "The spot found its brand." : "The spot went unsold."
        ) : (
          <>
            <b>
              {story.sold} of {story.total}
            </b>{" "}
            spots found a brand.
          </>
        )}
        {refundedAt && " In the end every winning bid was refunded."}
      </p>
      <ol className="sx-path">
        {path.map((step) => (
          <li key={step.label} className={step.done ? "done" : ""}>
            <i aria-hidden />
            <b>{step.label}</b>
            <span>{step.when}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Кто забрал места, самая жаркая борьба и пруф - под вещью. */
export function StoryBody({
  thingId,
  story,
  labelOf,
  proof,
  onProof,
  refundedAt,
}: {
  thingId: string;
  story: Story;
  labelOf: (code: string) => string;
  proof: ThingProof | null | undefined;
  onProof: (proof: ThingProof | null) => void;
  refundedAt: string | null;
}) {
  useEffect(() => {
    void loadThingProof(thingId).then(onProof);
  }, [thingId, onProof]);

  return (
    <div className="sx-body">
      <section className="sx-section">
        <h2>{story.total === 1 ? "Who took the spot" : "Who took the spots"}</h2>
        <ol className="sx-winners">
          {story.winners.map((one, index) => (
            <li key={one.spot}>
              <span className="sx-n">{String(index + 1).padStart(2, "0")}</span>
              <span className="sx-logo">{one.mediaUrl && <img src={one.mediaUrl} alt="" />}</span>
              <span className="sx-who">
                <b>{one.brand}</b>
                <span>
                  {labelOf(one.spot)}
                  {refundedAt && " · refunded"}
                </span>
              </span>
              <span className="sx-amt">{formatUsd(one.amountCents)}</span>
            </li>
          ))}
          {story.unsold.map((code) => (
            <li key={code} className="off">
              <span className="sx-n">-</span>
              <span className="sx-logo" />
              <span className="sx-who">
                <b>{labelOf(code)}</b>
                <span>No brand this time</span>
              </span>
              <span className="sx-amt">-</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Все ставки по местам, и перебитые тоже: кто и сколько давал, и что
          их деньги вернулись. Перебитым программа вернула ставку сразу. */}
      {story.rounds.length > 0 && (
        <section className="sx-section">
          <h2>Every bid</h2>
          <p className="sx-sub">
            {plural(story.bids, "bid", "bids")} from {plural(story.bidders, "bidder", "bidders")}. An outbid bid went
            straight back to its wallet.
          </p>
          <div className="sx-rounds">
            {story.rounds.map((round) => (
              <section key={round.spot} className="sx-round">
                <header>
                  <b>{labelOf(round.spot)}</b>
                  <span>{plural(round.steps.length, "bid", "bids")}</span>
                </header>
                <ol>
                  {round.steps.map((step, index) => {
                    const won = round.won && index === 0;
                    return (
                      <li key={index} className={won ? "won" : ""}>
                        <span className="sx-r-amt">{formatUsd(step.amountCents)}</span>
                        <span className="sx-r-who">{step.brand}</span>
                        <span className="sx-r-tag">
                          {won ? (refundedAt ? "Won, refunded" : "Won") : round.won ? "Outbid, refunded" : "Refunded"}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </section>
      )}

      {proof && (proof.photos.length > 0 || proof.note) && (
        <section className="sx-section">
          <h2>Proof</h2>
          {proof.photos.length > 0 && (
            <div className="sx-proof">
              {proof.photos.map((url) => (
                <Media key={url} src={url} play />
              ))}
            </div>
          )}
          {proof.note && <p className="sx-sub">{proof.note}</p>}
          {proof.links
            .filter((link) => link.startsWith("https://"))
            .map((link) => (
              <a key={link} className="sx-link" href={link} target="_blank" rel="noreferrer">
                {link.replace(/^https:\/\//, "")}
              </a>
            ))}
        </section>
      )}
    </div>
  );
}
