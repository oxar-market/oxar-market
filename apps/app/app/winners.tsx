"use client";

import { useEffect, useState } from "react";
import { closeDay, formatUsd, originalUrl, shortWallet } from "@oxar/core";
import {
  downloadLogos,
  loadBidPhotos,
  loadWinners,
  type BidPhoto,
  type Winner,
} from "@/lib/winners";

/**
 * Логотипы, которые печатать: по месту - бренд, сумма и сам файл. Открыть
 * файл - в новой вкладке; все разом - архивом, для типографии.
 */
export function Winners({
  thingId,
  title,
  closesAt,
}: {
  thingId: string;
  title: string;
  /** Какой торг: день закрытия. Пусто - все торги вещи. */
  closesAt?: string;
}) {
  const [list, setList] = useState<Winner[] | null>(null);
  const [zipping, setZipping] = useState<"idle" | "busy" | "failed">("idle");
  useEffect(() => {
    void loadWinners(thingId).then((all) =>
      // Печатать - победителей одного торга, а не всех торгов вещи за всё
      // время: у футболки были и прошлые закрытия, их логотипы уже не нужны.
      setList(closesAt ? all.filter((one) => closeDay(one.closesAt) === closeDay(closesAt)) : all),
    );
  }, [thingId, closesAt]);

  if (list === null) return null;
  if (list.length === 0) return <p className="muted">No winning bids on this thing.</p>;

  async function download() {
    setZipping("busy");
    const done = await downloadLogos(title, list!);
    setZipping(done ? "idle" : "failed");
  }

  return (
    <>
      <button type="button" className="sl-btn win-zip" disabled={zipping === "busy"} onClick={() => void download()}>
        {zipping === "busy" ? "Packing…" : `Download all logos (.zip, ${list.length})`}
      </button>
      {zipping === "failed" && <p className="bad">Could not fetch every logo. Try again.</p>}
      <div className="sl-card win-list">
        {list.map((one) => (
          <div className="win-row" key={one.lotId}>
            <a className="win-logo" href={originalUrl(one.mediaUrl)} target="_blank" rel="noreferrer">
              {/* Оригинал, а не копия сайта: копию кладёт сам участник, и смотреть
                  надо то, что уйдёт в печать. */}
              <img src={originalUrl(one.mediaUrl)} alt={one.brand} />
            </a>
            <div className="win-info">
              <b>
                {one.spot} · {one.brand}
              </b>
              <small className="muted">
                {one.status === "won" ? "Won" : "Leading now"} · {formatUsd(one.amountCents)} ·{" "}
                {shortWallet(one.wallet)}
              </small>
            </div>
            {/* В печать - оригинал, а не лёгкая копия сайта. */}
            <a className="sl-pill" href={originalUrl(one.mediaUrl)} target="_blank" rel="noreferrer" download>
              Open logo
            </a>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Фото всех ставок вещи: что каждый участник загрузил со ставкой, по местам,
 * от большей ставки к меньшей. Показываем оригиналы - ровно то, что прислали.
 */
export function BidPhotos({ thingId, title }: { thingId: string; title: string }) {
  const [list, setList] = useState<BidPhoto[] | null>(null);
  // Какой архив собирается: все ставки или только верхние на местах.
  const [zipping, setZipping] = useState<"all" | "top" | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    void loadBidPhotos(thingId).then(setList);
  }, [thingId]);

  if (list === null) return null;
  if (list.length === 0) return <p className="muted">No bids on this thing yet.</p>;

  // Верхняя ставка места: после закрытия - победитель, пока торг идёт - лидер.
  const top = list.filter((one) => one.tag !== "outbid");
  const live = top.some((one) => one.tag === "leading");

  async function download(which: "all" | "top") {
    setZipping(which);
    setFailed(false);
    const done = await downloadLogos(
      `${title} - ${which === "all" ? "all bids" : live ? "leaders" : "winners"}`,
      which === "all" ? list! : top,
    );
    setZipping(null);
    setFailed(!done);
  }

  return (
    <>
      <div className="win-zips">
        <button type="button" className="sl-btn win-zip" disabled={zipping !== null} onClick={() => void download("all")}>
          {zipping === "all" ? "Packing…" : `Download all photos (.zip, ${list.length})`}
        </button>
        {top.length > 0 && (
          <button type="button" className="sl-btn win-zip" disabled={zipping !== null} onClick={() => void download("top")}>
            {zipping === "top" ? "Packing…" : `Download ${live ? "leaders" : "winners"} only (.zip, ${top.length})`}
          </button>
        )}
      </div>
      {failed && <p className="bad">Could not fetch every photo. Try again.</p>}
      <div className="sl-card win-list">
        {list.map((one) => (
          <div className="win-row" key={`${one.at}${one.wallet}${one.amountCents}`}>
            <a className="win-logo" href={originalUrl(one.mediaUrl)} target="_blank" rel="noreferrer">
              <img src={originalUrl(one.mediaUrl)} alt={one.brand} loading="lazy" />
            </a>
            <div className="win-info">
              <b>
                {one.spot} · {one.brand}
              </b>
              <small className="muted">
                {TAG[one.tag]} · {formatUsd(one.amountCents)} ·{" "}
                {new Date(one.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·{" "}
                {shortWallet(one.wallet)}
              </small>
            </div>
            <a className="sl-pill" href={originalUrl(one.mediaUrl)} target="_blank" rel="noreferrer" download>
              Open photo
            </a>
          </div>
        ))}
      </div>
    </>
  );
}

const TAG: Record<BidPhoto["tag"], string> = { won: "Won", leading: "Leading now", outbid: "Outbid" };
