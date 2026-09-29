"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import { loadWinners, type Winner } from "@/lib/winners";

/**
 * Логотипы, которые печатать: по месту - бренд, сумма и сам файл. Открыть
 * файл - в новой вкладке, оттуда его и сохраняют.
 */
export function Winners({ thingId }: { thingId: string }) {
  const [list, setList] = useState<Winner[] | null>(null);
  useEffect(() => {
    void loadWinners(thingId).then(setList);
  }, [thingId]);

  if (list === null) return null;
  if (list.length === 0) return <p className="muted">No winning bids on this thing.</p>;

  return (
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
  );
}
