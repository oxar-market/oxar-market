"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@oxar/core";
import type { HeldRow } from "@/lib/auction";
import { loadWinners, type Winner } from "@/lib/winners";
import { WornInfo } from "./worn.tsx";

/**
 * Последний закрытый торг одной карточкой: что продавали, сколько собрали и
 * чьи логотипы будут на вещи. Стоит там, где живого торга нет, - на маркете и
 * на вкладке Auction, - чтобы пауза между торгами не выглядела пустой.
 */
export function LastAuction({ held, onOpen }: { held: HeldRow; onOpen: () => void }) {
  const [winners, setWinners] = useState<Winner[]>([]);
  useEffect(() => {
    void loadWinners(held.thingId).then((all) =>
      setWinners(all.filter((one) => one.status === "won" && one.closesAt.slice(0, 10) === held.closesAt.slice(0, 10))),
    );
  }, [held]);

  return (
    <div className="last-card">
      <span className="case-pill">LAST AUCTION</span>
      <div className="last-head">
        <h2 className="hero-name">{held.title}</h2>
        <p className="hero-who">
          Closed {new Date(held.closesAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ·{" "}
          {formatUsd(held.raisedCents)} raised
          {winners.length > 0 && ` · ${winners.length} ${winners.length === 1 ? "logo" : "logos"} going on it`}
        </p>
      </div>
      {winners.length > 0 && (
        <div className="last-logos" aria-label="Winning logos">
          {winners.map((one) => (
            <img key={one.lotId} src={one.mediaUrl} alt={one.brand} title={one.brand} />
          ))}
        </div>
      )}
      <WornInfo thingId={held.thingId} />
      <button type="button" className="primary wide" onClick={onOpen}>
        See results
      </button>
    </div>
  );
}
