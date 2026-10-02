"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import { downloadLogos, loadHouseThings, loadWinners, type HouseThing, type Winner } from "@/lib/winners";
import { Thumb } from "./seller/parts.tsx";

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
      setList(closesAt ? all.filter((one) => one.closesAt.slice(0, 10) === closesAt.slice(0, 10)) : all),
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
            <a className="win-logo" href={one.mediaUrl} target="_blank" rel="noreferrer">
              <img src={one.mediaUrl} alt={one.brand} />
            </a>
            <div className="win-info">
              <b>
                {one.spot} · {one.brand}
              </b>
              <small className="muted">
                {one.status === "won" ? "Won" : "Leading now"} · {formatUsd(one.amountCents)} ·{" "}
                {one.wallet.slice(0, 4)}…{one.wallet.slice(-4)}
              </small>
            </div>
            <a className="sl-pill" href={one.mediaUrl} target="_blank" rel="noreferrer" download>
              Open logo
            </a>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Наши вещи: что печатать. Пока торг идёт - лидеры, после закрытия -
 * победители. Живёт у продавца - вещи записаны на того, кто их печатает.
 */
export function HouseLogos() {
  const [things, setThings] = useState<HouseThing[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void loadHouseThings().then(setThings);
  }, []);
  if (things.length === 0) return null;
  return (
    <>
      <div className="sl-head">
        <h2>Our things - logos</h2>
        <span>{things.length}</span>
      </div>
      {/* Строкой, свежие сверху: торгов станет десять и больше, и столбик
          кнопок читался бы хуже списка. Логотипы раскрываются под строкой. */}
      <div className="sl-card sl-things">
        {things.map((one) => (
          <div key={one.id}>
            <button
              type="button"
              className="sl-thing"
              aria-expanded={open === one.id}
              onClick={() => setOpen(open === one.id ? null : one.id)}
            >
              <Thumb src={one.cover} />
              <span className="sl-thing-name">{one.title}</span>
              <span className={`sl-state ${one.open ? "live" : "idle"}`}>
                <i />
                {one.open ? "LIVE" : "ENDED"}
              </span>
              <span className="sl-thing-sub">
                {one.open ? "Leaders now" : "Winners"} · closes{" "}
                {new Date(one.closesAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </button>
            {open === one.id && (
              <div className="ad-house-logos">
                <Winners thingId={one.id} title={one.title} closesAt={one.closesAt} />
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
