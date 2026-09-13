"use client";

import { useState } from "react";
import { endDate, formatUsd } from "@oxar/core";
import {
  cancelLot,
  lotBidsForSeller,
  openLot,
  type LotBid,
  type MyListing,
  type MyLot,
} from "@/lib/seller";
import { Ban, Gavel } from "./icons";
import { Notice } from "./Notice";

// Торги по одному месту. Раньше это был отдельный список внизу кабинета, и
// продавцу приходилось держать в голове, какой лот к какому месту относится.
// Теперь торг живёт внутри своего места: там же, где его цена и кнопки.
//
// Ставки с контактом и креативом отдаёт база через функцию, которая проверяет,
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

/** Торги этого места: что идёт сейчас, чем кончились прошлые, как открыть новый. */
export function SpotAuctions({
  listing,
  lots,
  onChanged,
}: {
  listing: MyListing;
  lots: MyLot[];
  onChanged: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const open = lots.filter((lot) => lot.status === "open");
  const past = lots.filter((lot) => lot.status !== "open");

  return (
    <div className="desk-auction">
      {open.map((lot) => (
        <Running key={lot.id} lot={lot} onChanged={onChanged} onError={setError} />
      ))}

      {past.map((lot) => (
        <Finished key={lot.id} lot={lot} />
      ))}

      {error && <Notice tone="error">{error}</Notice>}

      {opening ? (
        <OpenLot
          listing={listing}
          onOpened={() => {
            setOpening(false);
            onChanged();
          }}
          onCancel={() => setOpening(false)}
        />
      ) : (
        <button type="button" className="desk-more" onClick={() => setOpening(true)}>
          <Gavel />
          Start an auction on these dates
        </button>
      )}
    </div>
  );
}

/** Идущий торг: срок приёма ставок, резерв и сами ставки по запросу. */
function Running({
  lot,
  onChanged,
  onError,
}: {
  lot: MyLot;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [bids, setBids] = useState<LotBid[] | null>(null);
  const [shown, setShown] = useState(false);

  async function show() {
    setShown(!shown);
    if (!bids) setBids(await lotBidsForSeller(lot.id));
  }

  return (
    <div className="desk-lot">
      <div className="desk-lines">
        <strong className="small">
          On auction: {day(lot.start_date)} - {day(lot.end_date)}
        </strong>
        <span className="muted small">
          bidding until {moment(lot.closes_at)} · reserve{" "}
          {formatUsd(lot.reserve_cents)}
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
        {/* «Cancel» здесь ничего не говорило: отменяется не правка, а сам торг,
            и ставки при этом пропадают. Поэтому подпись прямая. */}
        <button
          type="button"
          className="desk-icon"
          aria-label="Stop the bidding"
          title="Stop the bidding - bids are dropped"
          onClick={async () => {
            const result = await cancelLot(lot.id);
            if (result === "error") onError("Could not stop that auction.");
            onChanged();
          }}
        >
          <Ban />
        </button>
      </div>
    </div>
  );
}

/** Закрытый торг: одна строка истории, без кнопок. */
function Finished({ lot }: { lot: MyLot }) {
  return (
    <p className="muted small">
      {day(lot.start_date)} - {day(lot.end_date)}:{" "}
      {lot.status === "sold"
        ? "sold, the winner has the spot"
        : lot.status === "unsold"
          ? `closed without a bid above ${formatUsd(lot.reserve_cents)}`
          : "bidding stopped"}
    </p>
  );
}

/**
 * Открыть торг на это место. Выбора места здесь нет: форма раскрывается внутри
 * него, и селект был бы вторым способом сказать то же самое.
 */
function OpenLot({
  listing,
  onOpened,
  onCancel,
}: {
  listing: MyListing;
  onOpened: () => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState("");
  const [days, setDays] = useState(String(DEFAULT_TERM_DAYS));
  const [reserve, setReserve] = useState("");
  const [closes, setCloses] = useState("");
  const [error, setError] = useState("");

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
      listing_id: listing.id,
      start_date: start,
      end_date: endDate(start, term),
      reserve_cents: Math.round(dollars * 100),
      closes_at: new Date(closes).toISOString(),
    });

    if (result === "done") {
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
    <form className="desk-edit" onSubmit={submit} noValidate>
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

      <div className="desk-acts">
        <button type="submit" className="primary">
          Open the lot
        </button>
        <button type="button" className="desk-no" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <p className="muted small">
        The winner gets the spot for these dates. You agreed to sell by opening
        the lot, so bidding cannot end in a change of mind - only the creative is
        still yours to refuse.
      </p>
    </form>
  );
}
