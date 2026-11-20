"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";
import type { Anchor } from "@oxar/stage";
import { formatUsd } from "@oxar/core";
import { loadThingProof, type ThingProof } from "@/lib/listing";
import { reachOf, type Story } from "@/lib/story";
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
 * Кто увидел вещь: охват крупно, цена тысячи показов за весь торг и самая
 * дешёвая тысяча у бренда. Только цифра из статистики постов - пока охват не
 * посчитан, блока нет.
 */
export function StoryReach({ story, reach, checked }: { story: Story; reach: number | null; checked: boolean }) {
  const counted = checked ? reach : null;
  if (!counted || story.winners.length === 0) return null;
  const view = reachOf(story, counted);
  const cheapest = Math.min(...view.brands.map((one) => one.cpmCents ?? Infinity));

  return (
    <section className="sx-section sx-reach">
      <h2>Who saw it</h2>
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
    </section>
  );
}

/**
 * Выноски на вещи: карточка победителя на каждое проданное место, слева и
 * справа от вещи, и тонкая линия от карточки к самому месту. Сцена отдаёт,
 * где места на экране, - линии едут за местами, пока вещь крутят, а место,
 * ушедшее за вещь, гасит свою линию и бледнеет карточкой. Наведи - все
 * ставки на место; нажми - вещь доворачивается к нему.
 *
 * Линии и точки двигаются напрямую в DOM, без перерисовки React: камера
 * шлёт места на каждом кадре, пока вещь крутится.
 */
/** Место видно, если смотрит на камеру хотя бы так - иначе оно за вещью. */
const SEEN = 0.12;

export function StoryCallouts({
  story,
  labelOf,
  picked,
  onPick,
  sink,
  refundedAt,
}: {
  story: Story;
  labelOf: (code: string) => string;
  picked: string | null;
  onPick: (code: string) => void;
  sink: RefObject<((anchors: Anchor[]) => void) | null>;
  refundedAt: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const lines = useRef(new Map<string, SVGLineElement>());
  const dots = useRef(new Map<string, HTMLElement>());
  const last = useRef<Anchor[] | null>(null);
  // Сторона и порядок карточек - по тому, где места на экране: карточка
  // встаёт с той стороны вещи, где её место, сверху вниз как места. Пока
  // вещь крутят, карточки стоят; остановилась - перестраиваются под ракурс.
  const [layout, setLayout] = useState<{ left: string[]; right: string[] } | null>(null);
  const placed = useRef(layout);
  placed.current = layout;
  const settle = useRef<number | undefined>(undefined);
  const rounds = new Map(story.rounds.map((one) => [one.spot, one]));
  const winners = story.winners;

  const arrange = (anchors: Anchor[]) => {
    const canvas = box.current?.parentElement?.querySelector("canvas");
    const middle = (canvas?.clientWidth ?? 0) / 2;
    const spots = winners
      .map((one) => anchors.find((a) => a.code === one.spot))
      .filter((one) => one !== undefined)
      .sort((a, b) => a.x - b.x);
    // Колонки не перекашиваем: с каждой стороны хотя бы треть карточек, а
    // лишние уходят с той стороны, что ближе к середине.
    const n = spots.length;
    const least = n <= 1 ? 0 : Math.max(1, Math.floor(n / 2) - 1);
    const k = Math.min(Math.max(spots.filter((one) => one.x < middle).length, least), n - least);
    // В колонке сначала видимые места сверху вниз, ушедшие за вещь - под ними.
    const byY = (list: Anchor[]) =>
      list.sort((a, b) => Number(a.facing <= SEEN) - Number(b.facing <= SEEN) || a.y - b.y).map((one) => one.code);
    return { left: byY(spots.slice(0, k)), right: byY(spots.slice(k)) };
  };

  const draw = () => {
    const anchors = last.current;
    const root = box.current;
    const canvas = root?.parentElement?.querySelector("canvas");
    if (!anchors || !root || !canvas) return;
    const o = root.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    const at = new Map(anchors.map((one) => [one.code, one]));
    for (const one of winners) {
      const spot = at.get(one.spot);
      const card = cards.current.get(one.spot);
      const line = lines.current.get(one.spot);
      const dot = dots.current.get(one.spot);
      if (!spot || !card || !line || !dot) continue;
      const px = c.left - o.left + spot.x;
      const py = c.top - o.top + spot.y;
      const r = card.getBoundingClientRect();
      const fromLeft = r.left + r.width / 2 < px + o.left;
      const cx = (fromLeft ? r.right : r.left) - o.left;
      const cy = r.top - o.top + r.height / 2;
      const seen = spot.facing > SEEN;
      line.setAttribute("x1", String(cx));
      line.setAttribute("y1", String(cy));
      line.setAttribute("x2", String(px));
      line.setAttribute("y2", String(py));
      line.style.opacity = seen ? "1" : "0";
      dot.style.transform = `translate(${px}px, ${py}px)`;
      dot.style.opacity = seen ? "1" : "0";
      card.classList.toggle("away", !seen);
    }
  };

  useEffect(() => {
    sink.current = (anchors) => {
      last.current = anchors;
      if (!placed.current) {
        setLayout(arrange(anchors));
        return;
      }
      draw();
      window.clearTimeout(settle.current);
      settle.current = window.setTimeout(() => {
        const next = arrange(anchors);
        const now = placed.current;
        if (now && next.left.join() === now.left.join() && next.right.join() === now.right.join()) return;
        // Карточки переезжают плавно, где браузер это умеет.
        if (document.startViewTransition) document.startViewTransition(() => flushSync(() => setLayout(next)));
        else setLayout(next);
      }, 350);
    };
    return () => {
      sink.current = null;
      window.clearTimeout(settle.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winners.length]);

  // Карточки встали - дорисовать линии к последним известным местам.
  useLayoutEffect(() => {
    draw();
    const redraw = () => draw();
    window.addEventListener("resize", redraw);
    return () => window.removeEventListener("resize", redraw);
  });

  const card = (code: string) => {
    const one = winners.find((w) => w.spot === code)!;
    const round = rounds.get(code);
    return (
      <button
        type="button"
        key={code}
        className={picked === code ? "sx-co on" : "sx-co"}
        style={{ viewTransitionName: `sx-co-${winners.indexOf(one)}` }}
        ref={(el) => {
          if (el) cards.current.set(code, el);
          else cards.current.delete(code);
        }}
        onClick={() => onPick(code)}
      >
        <span className="sx-co-logo">{one.mediaUrl && <img src={one.mediaUrl} alt="" />}</span>
        <span className="sx-co-text">
          <b>{one.brand}</b>
          <span>
            {labelOf(code)}
            {round && ` · ${plural(round.steps.length, "bid", "bids")}`}
          </span>
        </span>
        <em>{formatUsd(one.amountCents)}</em>
        {round && round.steps.length > 1 && (
          <span className="sx-co-pop" role="tooltip">
            {round.steps.map((step, index) => (
              <span key={index} className={index === 0 ? "won" : ""}>
                <i>{step.brand}</i>
                <b>{formatUsd(step.amountCents)}</b>
                <small>{index === 0 ? (refundedAt ? "refunded" : "won") : "outbid"}</small>
              </span>
            ))}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="sx-callouts" ref={box}>
      <svg className="sx-co-lines" aria-hidden>
        {winners.map((one) => (
          <line
            key={one.spot}
            className={picked === one.spot ? "on" : ""}
            ref={(el) => {
              if (el) lines.current.set(one.spot, el);
              else lines.current.delete(one.spot);
            }}
          />
        ))}
      </svg>
      {winners.map((one) => (
        <i
          key={one.spot}
          className={picked === one.spot ? "sx-co-dot on" : "sx-co-dot"}
          ref={(el) => {
            if (el) dots.current.set(one.spot, el);
            else dots.current.delete(one.spot);
          }}
        />
      ))}
      {layout && (
        <div className="sx-co-cols">
          <div className="sx-co-col left">{layout.left.map(card)}</div>
          <div className="sx-co-col right">{layout.right.map(card)}</div>
        </div>
      )}
    </div>
  );
}

