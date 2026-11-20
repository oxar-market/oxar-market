"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import { loadThingProof, type ThingProof } from "@/lib/listing";
import type { Story } from "@/lib/story";
import { Gallery } from "../gallery.tsx";

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

/**
 * Места одной таблицей. Два режима: «Winners» - строка на место, победитель
 * и цена, нажал - раскрываются все ставки на это место; «All bids» - все
 * ставки торга по времени, перебитые тоже.
 */
export function StorySpots({
  story,
  labelOf,
  refundedAt,
}: {
  story: Story;
  labelOf: (code: string) => string;
  refundedAt: string | null;
}) {
  const [all, setAll] = useState(false);
  const winnerOf = new Map(story.winners.map((one) => [one.spot, one]));
  const bidOn = new Set(story.rounds.map((one) => one.spot));
  const tag = (won: boolean, sold: boolean) =>
    won ? (refundedAt ? "Won, refunded" : "Won") : sold ? "Outbid, refunded" : "Refunded";
  // Все ставки по времени, новые сверху: у каждой - место и чем кончилась.
  const timeline = story.rounds
    .flatMap((round) => round.steps.map((step, index) => ({ ...step, spot: round.spot, won: round.won && index === 0, sold: round.won })))
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="sx-section">
      <header className="sx-spots-head">
        <h2>{all ? "Every bid" : story.total === 1 ? "The spot" : "The spots"}</h2>
        <div className="sx-toggle" role="group" aria-label="Show">
          <button type="button" className={all ? "" : "on"} aria-pressed={!all} onClick={() => setAll(false)}>
            Winners
          </button>
          <button type="button" className={all ? "on" : ""} aria-pressed={all} onClick={() => setAll(true)}>
            All bids <span>{story.bids}</span>
          </button>
        </div>
      </header>

      {all ? (
        <ol className="sx-all">
          {timeline.map((step, index) => (
            <li key={index} className={step.won ? "won" : ""}>
              <span className="sx-r-amt">{formatUsd(step.amountCents)}</span>
              <span className="sx-who">
                <b>{step.brand}</b>
                <span>
                  {labelOf(step.spot)} · {day(step.at)}
                </span>
              </span>
              <span className="sx-r-tag">{tag(step.won, step.sold)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="sx-spots">
          {story.rounds.map((round) => {
            const winner = winnerOf.get(round.spot);
            return (
              // Место одно - его ставки раскрыты сразу: прятать единственную
              // историю за нажатием незачем.
              <details key={round.spot} className="sx-spot" open={story.rounds.length === 1 || undefined}>
                <summary>
                  <span className="sx-logo">{winner?.mediaUrl && <img src={winner.mediaUrl} alt="" />}</span>
                  <span className="sx-who">
                    <b>{winner?.brand ?? "No winner"}</b>
                    <span>
                      {labelOf(round.spot)} · {plural(round.steps.length, "bid", "bids")}
                      {refundedAt && winner && " · refunded"}
                    </span>
                  </span>
                  <span className="sx-amt">{winner ? formatUsd(winner.amountCents) : "-"}</span>
                </summary>
                <ol>
                  {round.steps.map((step, index) => (
                    <li key={index} className={round.won && index === 0 ? "won" : ""}>
                      <span className="sx-r-amt">{formatUsd(step.amountCents)}</span>
                      <span className="sx-r-who">{step.brand}</span>
                      <span className="sx-r-tag">{tag(round.won && index === 0, round.won)}</span>
                    </li>
                  ))}
                </ol>
              </details>
            );
          })}
          {story.unsold
            .filter((code) => !bidOn.has(code))
            .map((code) => (
              <div key={code} className="sx-spot off">
                <span className="sx-logo" />
                <span className="sx-who">
                  <b>{labelOf(code)}</b>
                  <span>No bids</span>
                </span>
                <span className="sx-amt">-</span>
              </div>
            ))}
        </div>
      )}
    </section>
  );
}

/** Пруф под вещью: превью во весь экран по тапу, заметка и ссылки. */
export function StoryProof({
  thingId,
  proof,
  onProof,
}: {
  thingId: string;
  proof: ThingProof | null | undefined;
  onProof: (proof: ThingProof | null) => void;
}) {
  useEffect(() => {
    void loadThingProof(thingId).then(onProof);
  }, [thingId, onProof]);

  if (!proof || (proof.photos.length === 0 && !proof.note)) return null;
  return (
    <section className="sx-section sx-proof-block">
      <h2>Proof</h2>
      {proof.photos.length > 0 && <Gallery urls={proof.photos} listClass="sx-proof" itemClass="sx-proof-item" />}
      {proof.note && <p className="sx-sub">{proof.note}</p>}
      {proof.links
        .filter((link) => link.startsWith("https://"))
        .map((link) => (
          <a key={link} className="sx-link" href={link} target="_blank" rel="noreferrer">
            {link.replace(/^https:\/\//, "")}
          </a>
        ))}
    </section>
  );
}

/**
 * Как собирались деньги: сумма лидирующих ставок по времени ступенькой, точка
 * на каждую ставку - красная, если ставка в итоге забрала место. Одна ставка -
 * одна ступенька, много - живая кривая; подписи - снаружи рисунка, чтобы на
 * телефоне не мельчали вместе с ним.
 */
export function StoryChart({ story, closedAt }: { story: Story; closedAt: number }) {
  const pot = story.pot;
  if (pot.length === 0) return null;
  const W = 800;
  const H = 180;
  const PAD = 8;
  const start = Date.parse(pot[0]!.at);
  const end = Math.max(closedAt, Date.parse(pot.at(-1)!.at));
  const span = Math.max(end - start, 1);
  const top = Math.max(...pot.map((one) => one.cents), 1);
  const x = (ms: number) => PAD + ((ms - start) / span) * (W - PAD * 2);
  const y = (cents: number) => H - PAD - (cents / top) * (H - PAD * 2);

  let line = `M ${x(start)} ${y(0)}`;
  for (const point of pot) line += ` H ${x(Date.parse(point.at))} V ${y(point.cents)}`;
  line += ` H ${x(end)}`;
  const area = `${line} V ${y(0)} H ${x(start)} Z`;
  const days = Math.max(1, Math.round(span / 86_400_000));

  return (
    <section className="sx-section sx-chart-block">
      <h2>How the money came in</h2>
      <p className="sx-sub">
        {formatUsd(pot.at(-1)!.cents)} in {plural(days, "day", "days")}, {plural(pot.length, "bid", "bids")}.
      </p>
      <div className="sx-chart">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Total bid over time">
          <path className="sx-chart-area" d={area} />
          <path className="sx-chart-line" d={line} />
          {pot.map((point, index) => (
            <circle key={index} className={point.won ? "won" : ""} cx={x(Date.parse(point.at))} cy={y(point.cents)} r={point.won ? 5 : 3.5} />
          ))}
        </svg>
        <div className="sx-chart-axis">
          <span>{day(start)}</span>
          <span>{day(end)}</span>
        </div>
      </div>
    </section>
  );
}
