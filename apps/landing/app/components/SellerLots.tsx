"use client";

import { useCallback, useEffect, useState } from "react";
import { endDate, formatUsd, placementSpec } from "@oxar/core";
import {
  cancelLot,
  lotBidsForSeller,
  myLots,
  openLot,
  type LotBid,
  type MyListing,
  type MyLot,
} from "@/lib/seller";
import { closeDueLots } from "@/lib/auctions";
import { Notice } from "./Notice";

// Аукционы продавца: что выставлено на торг, какие ставки пришли и чем кончилось.
//
// Ставки со контактом и креативом отдаёт база через функцию, которая проверяет,
// чей это лот: публично видны только сумма и хэндл.

const DEFAULT_TERM_DAYS = 7;

function day(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function moment(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SellerLots({ listings }: { listings: MyListing[] }) {
  const [lots, setLots] = useState<MyLot[] | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    // Сначала закрываем то, у чего вышел срок: продавец должен видеть исход,
    // а не висящий торг.
    await closeDueLots();
    setLots(await myLots());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const byId = new Map(listings.map((listing) => [listing.id, listing]));

  return (
    <>
      <section className="req-row">
        <span className="field-label">Auctions</span>
        {lots === null && <p className="muted small">Loading…</p>}
        {lots?.length === 0 && (
          <p className="muted small">
            Nothing on auction. Put a week up for bidding below.
          </p>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {lots?.map((lot) => (
          <Lot
            key={lot.id}
            lot={lot}
            label={
              byId.has(lot.listing_id)
                ? placementSpec(byId.get(lot.listing_id)!.kind).label
                : "Spot"
            }
            onChanged={reload}
            onError={setError}
          />
        ))}
      </section>

      <OpenLot listings={listings} onOpened={reload} />
    </>
  );
}

function Lot({
  lot,
  label,
  onChanged,
  onError,
}: {
  lot: MyLot;
  label: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [bids, setBids] = useState<LotBid[] | null>(null);
  const [shown, setShown] = useState(false);

  const running = lot.status === "open";

  async function show() {
    setShown(!shown);
    if (!bids) setBids(await lotBidsForSeller(lot.id));
  }

  return (
    <div className="desk-item">
      <div className="desk-lines">
        <strong>
          {label} · {day(lot.start_date)} - {day(lot.end_date)}
        </strong>
        <span className="muted small">
          {running
            ? `bidding until ${moment(lot.closes_at)} · reserve ${formatUsd(lot.reserve_cents)}`
            : lot.status === "sold"
              ? "sold - the winner has the spot"
              : lot.status === "unsold"
                ? `closed without a bid above ${formatUsd(lot.reserve_cents)}`
                : "cancelled"}
        </span>

        {shown && bids?.length === 0 && (
          <span className="muted small">No bids yet.</span>
        )}
        {shown &&
          bids?.map((bid) => (
            <span key={bid.id} className="muted small">
              @{bid.bidder_handle} · {formatUsd(bid.amount_cents)}
              {bid.bidder_contact ? ` · ${bid.bidder_contact}` : ""}
              {bid.creative_text ? ` · ${bid.creative_text}` : ""}
              {bid.creative_url ? (
                <>
                  {" · "}
                  <a href={bid.creative_url} target="_blank" rel="noreferrer">
                    creative
                  </a>
                </>
              ) : null}
            </span>
          ))}
      </div>

      <div className="desk-acts">
        <button type="button" className="desk-no" onClick={show}>
          {shown ? "Hide bids" : "Bids"}
        </button>
        {running && (
          <button
            type="button"
            className="desk-no"
            onClick={async () => {
              const result = await cancelLot(lot.id);
              if (result === "error") onError("Could not cancel that lot.");
              onChanged();
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function OpenLot({
  listings,
  onOpened,
}: {
  listings: MyListing[];
  onOpened: () => void;
}) {
  const [listingId, setListingId] = useState("");
  const [start, setStart] = useState("");
  const [days, setDays] = useState(String(DEFAULT_TERM_DAYS));
  const [reserve, setReserve] = useState("");
  const [closes, setCloses] = useState("");
  const [error, setError] = useState("");

  if (listings.length === 0) {
    return (
      <section className="req-row">
        <span className="field-label">Put a spot up for bidding</span>
        <p className="muted small">List a spot first, then it can go to auction.</p>
      </section>
    );
  }

  const chosen = listingId || listings[0]!.id;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!start) {
      setError("Pick the first day of the placement.");
      return;
    }
    const term = Number(days);
    if (!Number.isInteger(term) || term < 1 || term > 90) {
      setError("Days: a whole number, 1 to 90.");
      return;
    }
    const dollars = Number(reserve.replace(",", "."));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError("Reserve price in dollars, like 250.");
      return;
    }
    if (!closes) {
      setError("Pick when bidding closes.");
      return;
    }

    const result = await openLot({
      listing_id: chosen,
      start_date: start,
      end_date: endDate(start, term),
      reserve_cents: Math.round(dollars * 100),
      closes_at: new Date(closes).toISOString(),
    });

    if (result === "done") {
      setReserve("");
      setStart("");
      setCloses("");
      onOpened();
      return;
    }
    setError(
      result === "overlap"
        ? "Those dates are already on auction."
        : result === "too_late"
          ? "Bidding has to close at least a day before the placement starts."
          : "Could not open that lot. Try again.",
    );
  }

  return (
    <form className="req-row desk-add" onSubmit={submit} noValidate>
      <span className="field-label">Put a spot up for bidding</span>

      <label>
        Spot
        <select value={chosen} onChange={(event) => setListingId(event.target.value)}>
          {listings.map((listing) => (
            <option key={listing.id} value={listing.id}>
              {placementSpec(listing.kind).label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Placement starts
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
      </label>

      <label>
        Days
        <input
          value={days}
          onChange={(event) => setDays(event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
        />
      </label>

      <label>
        Reserve price, $
        <input
          value={reserve}
          onChange={(event) => setReserve(event.target.value.replace(/[^\d.,]/g, ""))}
          placeholder="250"
          inputMode="decimal"
        />
      </label>

      <label>
        Bidding closes
        <input
          type="datetime-local"
          value={closes}
          onChange={(event) => setCloses(event.target.value)}
        />
      </label>

      {error && <Notice tone="error">{error}</Notice>}

      <button type="submit" className="primary">
        Open the lot
      </button>
      <p className="muted small">
        The winner gets the spot for these dates. You agreed to sell by opening
        the lot, so bidding cannot end in a change of mind - only the creative is
        still yours to refuse.
      </p>
    </form>
  );
}
