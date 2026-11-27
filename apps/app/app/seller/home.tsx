"use client";

import { useEffect, useState } from "react";
import { closeDay, formatUsd, originalUrl, SALE_STEPS, saleStage, type SaleAction } from "@oxar/core";
import type { DealToRate, Score, SellerThing } from "@/lib/seller";
import { downloadLogos, loadWinners, type Winner } from "@/lib/winners";
import { FOLLOW } from "../_site/data.ts";
import { clock, shortDay as day } from "./parts.tsx";

/**
 * Вкладка Sales: сверху «Do this now» - по строке на дело продавца, ниже
 * его торги строками. Строка раскрывается в шаг из пяти (Set up, Live,
 * Print, Proof, Paid) и одну кнопку - один выбор на шаг. Шаг считает
 * saleStage в core; скачаны ли логотипы, база не знает - помним на этом
 * устройстве.
 *
 * Своей вещи продавец больше не заводит: торг готовим мы, и новая вещь -
 * это заявка на /sell или сообщение нам.
 */
export function SellerHome({
  score,
  toRate,
  things,
  now,
  onSign,
  onOpen,
  onRate,
  onReviews,
  proof,
}: {
  score: Score;
  toRate: DealToRate[];
  things: SellerThing[];
  now: number;
  /** Подготовленный нами торг: проверить и подписать. */
  onSign: (thingId: string) => void;
  /** Страница торга - та же, что у покупателей. */
  onOpen: (thingId: string) => void;
  onRate: (deal: DealToRate) => void;
  onReviews: () => void;
  /** Форма пруфа вещи - с кошельком и подписью продавца. */
  proof: (thing: SellerThing) => React.ReactNode;
}) {
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  useEffect(() => {
    setDownloaded(new Set(things.filter((one) => window.localStorage.getItem(LOGOS + one.id)).map((one) => one.id)));
  }, [things]);
  const [opened, setOpened] = useState<string | null>(null);

  const rows = things
    .map((thing) => ({ thing, stage: saleStage({ ...thing, downloaded: downloaded.has(thing.id) }) }))
    // Дело за продавцом - наверх, дальше свежие.
    .reverse()
    .sort((a, b) => Number(red(b.stage.action)) - Number(red(a.stage.action)));
  const todo = rows.filter((one) => red(one.stage.action));

  function open(thingId: string) {
    setOpened(thingId);
    requestAnimationFrame(() =>
      document.getElementById(`sale-${thingId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }

  return (
    <div className="yo-sale">
      {(todo.length > 0 || toRate.length > 0) && (
        <section className="yo-todo">
          <span className="yo-up yo-mute">Do this now</span>
          {todo.map(({ thing, stage }) => (
            <div key={thing.id} className="yo-todo-r">
              <i />
              <div>
                <b>{todoLine(thing, stage.action!)}</b>
                <span className="yo-mute">{todoHint(thing, stage.action!)}</span>
              </div>
              {stage.action === "sign" ? (
                <button type="button" className="yo-btn" onClick={() => onSign(thing.id)}>
                  Review and sign
                </button>
              ) : (
                <button type="button" className="yo-btn ghost" onClick={() => open(thing.id)}>
                  Open
                </button>
              )}
            </div>
          ))}
          {toRate[0] && (
            <div className="yo-todo-r">
              <i />
              <div>
                <b>{toRate.length === 1 ? "Rate the winner" : `Rate ${toRate.length} winners`}</b>
                <span className="yo-mute">
                  {toRate[0].title} · {toRate[0].line}
                </span>
              </div>
              <button type="button" className="yo-btn" onClick={() => onRate(toRate[0]!)}>
                Rate
              </button>
            </div>
          )}
        </section>
      )}

      <section className="yo-list">
        <div className="yo-list-h yo-up yo-mute">
          <span>Your auctions</span>
          <span>Status</span>
          <span className="yo-r">Money</span>
        </div>
        {rows.length === 0 && (
          <p className="yo-mute yo-list-empty">
            Nothing here yet. Once we set up your auction, it shows up here to check and sign.
          </p>
        )}
        {rows.map(({ thing, stage }) => {
          const on = opened === thing.id;
          return (
            <div key={thing.id} id={`sale-${thing.id}`} className={on ? "yo-it open" : "yo-it"}>
              <button
                type="button"
                className="yo-it-r"
                aria-expanded={on}
                onClick={() => setOpened(on ? null : thing.id)}
              >
                <span>
                  {thing.title}
                  <small>{subline(thing, stage.step)}</small>
                </span>
                <span className={red(stage.action) ? "yo-red" : undefined}>
                  {stage.action === "proof" && thing.proofBy ? `Proof due ${day(thing.proofBy)}` : stage.status}
                </span>
                <span className="yo-r">
                  {thing.raisedCents > 0 && !thing.refunded ? formatUsd(thing.raisedCents) : <span className="yo-mute">-</span>}
                </span>
              </button>
              {on && (
                <div className="yo-it-more">
                  <p className="yo-step yo-up yo-mute">
                    {stage.status === "Paid"
                      ? "Done · paid out"
                      : stage.status === "Refunded"
                        ? "Ended · refunded"
                        : `Step ${stage.step} of ${SALE_STEPS.length} · ${SALE_STEPS[stage.step - 1]}`}
                  </p>
                  <div className="yo-bar">
                    <i style={{ width: `${(stage.step / SALE_STEPS.length) * 100}%` }} />
                  </div>
                  <Step
                    thing={thing}
                    action={stage.action}
                    status={stage.status}
                    now={now}
                    onSign={() => onSign(thing.id)}
                    onOpen={() => onOpen(thing.id)}
                    onDownloaded={() => {
                      window.localStorage.setItem(LOGOS + thing.id, "1");
                      setDownloaded((was) => new Set(was).add(thing.id));
                    }}
                    proof={proof}
                  />
                </div>
              )}
            </div>
          );
        })}
      </section>

      <p className="yo-sale-foot yo-up">
        <a className="yo-link" href="/sell">
          + List another thing
        </a>
        {score.deals > 0 && (
          <span className="yo-mute">
            {score.rating === null ? "New seller" : `★ ${score.rating.toFixed(1)}`} · {score.deals}{" "}
            {score.deals === 1 ? "deal" : "deals"} ·{" "}
            <button type="button" className="yo-link" onClick={onReviews}>
              Reviews
            </button>
          </span>
        )}
      </p>
    </div>
  );
}

/** Скачал логотипы вещи на этом устройстве - печать позади, дальше пруф. */
const LOGOS = "oxar.logos.";

/** Ход за продавцом: подписать, напечатать, прислать пруф. Открыть торг - не дело. */
function red(action: SaleAction | null): boolean {
  return action === "sign" || action === "download" || action === "proof";
}

function todoLine(thing: SellerThing, action: SaleAction): string {
  if (action === "sign") return `Sign the ${thing.title} auction`;
  if (action === "download") return `Print ${plural(thing.wonSpots, "logo")} for ${thing.title}`;
  return `Post proof for ${thing.title}${thing.proofBy ? ` by ${day(thing.proofBy)}` : ""}`;
}

function todoHint(thing: SellerThing, action: SaleAction): string {
  if (action === "sign") return `We set it up. Check it and sign${thing.opensAt ? `, it goes live ${day(thing.opensAt)}` : ""}.`;
  if (action === "download") return "Download them and put them on the thing.";
  return "A photo of the thing in use, with the logos on it.";
}

function subline(thing: SellerThing, step: number): string {
  if (step === 1) return `${plural(thing.spots, "spot")}${thing.opensAt ? ` · goes live ${day(thing.opensAt)}` : ""}`;
  if (thing.state === "live" || thing.state === "reviewing") {
    return `${thing.bidSpots} of ${plural(thing.spots, "spot")} bid${thing.closesAt ? ` · closes ${day(thing.closesAt)}` : ""}`;
  }
  if (thing.wonSpots > 0) return `${thing.wonSpots} of ${plural(thing.spots, "spot")} sold`;
  return plural(thing.spots, "spot");
}

/** Тело раскрытой строки: что на шаге и одна кнопка, если ход за продавцом. */
function Step({
  thing,
  action,
  status,
  now,
  onSign,
  onOpen,
  onDownloaded,
  proof,
}: {
  thing: SellerThing;
  action: SaleAction | null;
  status: string;
  now: number;
  onSign: () => void;
  onOpen: () => void;
  onDownloaded: () => void;
  proof: (thing: SellerThing) => React.ReactNode;
}) {
  // Логотипы своего торга: у вещи могли быть и прошлые закрытия.
  const [logos, setLogos] = useState<Winner[] | null>(null);
  const [zipping, setZipping] = useState<"idle" | "busy" | "failed">("idle");
  const [proving, setProving] = useState(false);
  const wantLogos = action === "download" || action === "proof";
  useEffect(() => {
    if (!wantLogos) return;
    void loadWinners(thing.id).then((all) =>
      setLogos(all.filter((one) => one.status === "won" && (!thing.wonAt || closeDay(one.closesAt) === closeDay(thing.wonAt)))),
    );
  }, [thing.id, thing.wonAt, wantLogos]);

  async function download() {
    if (!logos?.length) return;
    setZipping("busy");
    const done = await downloadLogos(thing.title, logos);
    setZipping(done ? "idle" : "failed");
    if (done) onDownloaded();
  }

  if (action === "sign") {
    return (
      <>
        <p>Spots, starting prices and dates are set. One signature in your wallet puts it live.</p>
        <p className="yo-acts">
          <button type="button" className="yo-btn" onClick={onSign}>
            Review and sign
          </button>
        </p>
      </>
    );
  }

  if (action === "open") {
    return (
      <>
        <p className="yo-mute">
          {status === "In review"
            ? "Published. We check it before it shows on the site."
            : thing.closesAt
              ? `Closes in ${clock(Date.parse(thing.closesAt) - now)}. ${thing.bidSpots} of ${plural(thing.spots, "spot")} have bids.`
              : "Bidding is open."}
        </p>
        <p className="yo-acts">
          <button type="button" className="yo-btn" onClick={onOpen}>
            Open auction
          </button>
        </p>
      </>
    );
  }

  if (action === "download") {
    return (
      <>
        {logos && logos.length > 0 && (
          <div className="yo-logos">
            {logos.map((one) => (
              <img key={one.lotId} src={originalUrl(one.mediaUrl)} alt={one.brand} loading="lazy" />
            ))}
          </div>
        )}
        <p className="yo-acts">
          <button type="button" className="yo-btn" disabled={!logos?.length || zipping === "busy"} onClick={() => void download()}>
            {zipping === "busy" ? "Packing…" : "Download all logos"}
          </button>
        </p>
        {zipping === "failed" && <p className="yo-bad">Could not fetch every logo. Try again.</p>}
        <p className="yo-mute">
          {thing.lockup
            ? `Print them on the thing. Next step: a photo of it in use${thing.proofBy ? ` by ${day(thing.proofBy)}` : ""}.`
            : "Print them on the thing. The winning bids are already in your wallet."}
        </p>
      </>
    );
  }

  if (action === "proof") {
    return (
      <>
        <p className="yo-mute">
          Post a photo of the thing in use{thing.proofBy ? ` by ${day(thing.proofBy)}` : ""}. Each spot pays out when its
          winner checks it, or 72 hours later.{" "}
          <button type="button" className="yo-link" disabled={zipping === "busy"} onClick={() => void download()}>
            {zipping === "busy" ? "Packing…" : "Download logos again"}
          </button>
        </p>
        {zipping === "failed" && <p className="yo-bad">Could not fetch every logo. Try again.</p>}
        {proving ? (
          <div className="yo-proof">{proof(thing)}</div>
        ) : (
          <p className="yo-acts">
            <button type="button" className="yo-btn" onClick={() => setProving(true)}>
              Upload proof
            </button>
          </p>
        )}
      </>
    );
  }

  return <p className="yo-mute">{quiet(thing, status)}</p>;
}

/** Ход не за продавцом: что происходит словами. */
function quiet(thing: SellerThing, status: string): React.ReactNode {
  switch (status) {
    case "Setting up":
      return "We are building the listing, usually within a day.";
    case "Draft":
      return (
        <>
          Not set up yet.{" "}
          <a className="yo-link" href={FOLLOW} target="_blank" rel="noreferrer">
            Message us on X
          </a>{" "}
          and we finish it with you.
        </>
      );
    case "Not approved":
      return `Not approved: ${thing.declinedReason ?? ""}`;
    case "No bids":
      return "The auction closed without bids.";
    case "Proof sent":
      return "Winners have 72 hours to check the photo. Each spot pays out when its winner confirms, or after that.";
    case "Proof missed":
      return "No proof came by the deadline, so the winning bids went back to the winners.";
    case "Refunded":
      return "The winning bids went back to the winners.";
    case "Paid":
      return `${formatUsd(thing.raisedCents)} in winning bids, paid to your wallet minus the OXAR fee.`;
    default:
      return status;
  }
}

function plural(count: number, word: string): string {
  return `${count} ${count === 1 ? word : `${word}s`}`;
}
