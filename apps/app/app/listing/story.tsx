"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import { loadThingProof, type ThingProof } from "@/lib/listing";
import { leadersAt, reachOf, type Story } from "@/lib/story";
import { mosaic } from "@/lib/mosaic";
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
 * Кто увидел вещь и что бренды получили за деньги: охват крупно, цена тысячи
 * показов, и полоса на бренд - сколько отдал и почём вышла тысяча показов.
 * Нажал на бренд - его место выделено на вещи. Охват - только из статистики
 * постов; пока его нет, остаются полосы.
 */
export function StoryReach({
  story,
  reach,
  checked,
  labelOf,
  picked,
  onPick,
}: {
  story: Story;
  reach: number | null;
  checked: boolean;
  labelOf: (code: string) => string;
  picked: string | null;
  onPick: (code: string) => void;
}) {
  if (story.winners.length === 0) return null;
  // Только цифра из статистики постов: оценку без источника на витрину не
  // выносим - пока охват не посчитан, остаются полосы брендов.
  const counted = checked ? reach : null;
  const view = reachOf(story, counted);
  const most = Math.max(...view.brands.map((one) => one.amountCents), 1);
  const cheapest = Math.min(...view.brands.map((one) => one.cpmCents ?? Infinity));

  return (
    <section className="sx-section sx-chart-block sx-reach">
      <h2>{counted ? "Who saw it" : view.brands.length === 1 ? "The brand on it" : "The brands on it"}</h2>
      {counted ? (
        <>
          <p className="sx-reach-big">
            {counted.toLocaleString("en-US")}
            <span>people saw the logos</span>
          </p>
          <dl className="sx-reach-stats">
            <div>
              <dt>Per 1,000 views</dt>
              <dd>{formatUsd(view.cpmCents ?? 0)}</dd>
            </div>
            <div>
              <dt>Brands on it</dt>
              <dd>{view.brands.length}</dd>
            </div>
            <div>
              <dt>Cheapest spot</dt>
              <dd>{formatUsd(cheapest)} / 1k</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className="sx-sub">
          {view.brands.length > 1 && "The bigger the tile, the more the brand paid. "}Reach is being counted.
        </p>
      )}
      <BrandMosaic brands={view.brands} labelOf={labelOf} picked={picked} onPick={onPick} />
    </section>
  );
}

/**
 * Мозаика брендов: плитка на бренд, площадь - его ставка. Наведи или нажми -
 * плитка выделена, под мозаикой - бренд, место, сумма и цена тысячи
 * показов, а на вещи - его место.
 */
function BrandMosaic({
  brands,
  labelOf,
  picked,
  onPick,
}: {
  brands: { spot: string; brand: string; amountCents: number; mediaUrl: string; cpmCents: number | null }[];
  labelOf: (code: string) => string;
  picked: string | null;
  onPick: (code: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const W = 160;
  const H = 90;
  const tiles = mosaic(
    brands.map((one) => one.amountCents),
    W,
    H,
  );
  const shown = brands.find((one) => one.spot === (hover ?? picked));
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;

  return (
    <>
      <div className={brands.length === 1 ? "sx-mosaic one" : "sx-mosaic"} onMouseLeave={() => setHover(null)}>
        {brands.map((one, index) => {
          const tile = tiles[index]!;
          return (
            <button
              type="button"
              key={one.spot}
              className={one.spot === (hover ?? picked) ? "sx-tile on" : "sx-tile"}
              style={{ left: pct(tile.x, W), top: pct(tile.y, H), width: pct(tile.w, W), height: pct(tile.h, H) }}
              onMouseEnter={() => setHover(one.spot)}
              onClick={() => onPick(one.spot)}
              aria-label={`${one.brand}, ${labelOf(one.spot)}, ${formatUsd(one.amountCents)}`}
            >
              {one.mediaUrl ? <img src={one.mediaUrl} alt="" /> : <b>{one.brand}</b>}
              <span className="sx-tile-cap">
                {one.brand} · {formatUsd(one.amountCents)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="sx-mosaic-detail">
        {shown ? (
          <>
            <b>{shown.brand}</b> · {labelOf(shown.spot)} · {formatUsd(shown.amountCents)}
            {shown.cpmCents !== null && <> · {formatUsd(shown.cpmCents)} per 1,000 views</>}
          </>
        ) : (
          "Tap a logo to see its spot on the thing."
        )}
      </p>
    </>
  );
}


/**
 * Перемотка торга на самой вещи: шаг - ставка. Тянешь ползунок или жмёшь
 * play - на вещи логотипы тогдашних лидеров, сверху сумма на тот момент и
 * кто что взял последней ставкой. Шаги идут по ставкам, а не по часам:
 * ставки сбиваются в кучи, и по часам ползунок полз бы по пустоте.
 */
export function StoryReplay({
  bids,
  spotOf,
  onTime,
}: {
  bids: { id: string; lot_id: string; amount_cents: number; created_at: string; brand: string }[];
  spotOf: (lotId: string) => string;
  onTime: (at: number | null) => void;
}) {
  const steps = [...bids].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const last = steps.length;
  const [at, setAt] = useState(last);
  const [playing, setPlaying] = useState(false);

  // Шаг 0 - до первой ставки, шаг k - после k-й, последний - итог.
  const go = (k: number) => {
    setAt(k);
    onTime(k >= last ? null : k === 0 ? Date.parse(steps[0]!.created_at) - 1 : Date.parse(steps[k - 1]!.created_at));
  };

  useEffect(() => {
    if (!playing) return;
    if (at >= last) {
      setPlaying(false);
      return;
    }
    const tick = setTimeout(() => go(at + 1), steps.length > 20 ? 450 : 800);
    return () => clearTimeout(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, at, last]);

  // Уходим со страницы - вещь возвращается к итогу.
  useEffect(() => () => onTime(null), [onTime]);

  if (last === 0) return null;
  const moment = at === 0 ? null : steps[at - 1]!;
  const leading = leadersAt(steps, moment ? moment.created_at : new Date(0).toISOString());
  const total = Object.values(leading).reduce((sum, one) => sum + one.amount_cents, 0);
  const when = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <section className="sx-section sx-replay">
      <header className="sx-replay-head">
        <h2>Replay the auction</h2>
        <button
          type="button"
          className="sx-play"
          onClick={() => {
            if (playing) return setPlaying(false);
            if (at >= last) go(0);
            setPlaying(true);
          }}
        >
          {playing ? "Pause" : at >= last ? "Play from the start" : "Play"}
        </button>
      </header>

      <p className="sx-replay-now">
        <b>{formatUsd(total)}</b>
        <span>{moment ? `on the table · ${when(moment.created_at)}` : "No bids yet"}</span>
      </p>

      <div className="sx-track">
        {steps.map((one, index) => (
          <i
            key={one.id}
            className={index < at ? "past" : ""}
            style={{ left: `${((index + 1) / last) * 100}%` }}
            title={`${one.brand} · ${spotOf(one.lot_id)} · ${formatUsd(one.amount_cents)}`}
          />
        ))}
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={at}
          aria-label="Replay the auction bid by bid"
          onChange={(event) => {
            setPlaying(false);
            go(Number(event.target.value));
          }}
        />
      </div>

      <p className="sx-replay-last">
        {moment ? (
          <>
            <b>{moment.brand}</b> took the lead on {spotOf(moment.lot_id).startsWith("Spot ") ? "" : "the "}
            {spotOf(moment.lot_id)} with {formatUsd(moment.amount_cents)}
            {at >= last && ". The last bid."}
          </>
        ) : (
          "The thing before the first bid."
        )}
      </p>
    </section>
  );
}
