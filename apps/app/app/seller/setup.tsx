"use client";

import { useState } from "react";
import type { PricingThing, SpotPlan } from "@/lib/seller";
import { Bar } from "./parts.tsx";

/** Значения по умолчанию: те же, что у первой футболки. */
const DEFAULT_RESERVE = "10.00";
const DEFAULT_STEP = "5.00";
const DEFAULT_DAY = "8.00";
const DEFAULT_TERM = "3";
/** Аукцион по умолчанию - неделя от ближайшего полудня. */
const WEEK = 7 * 86_400_000;

type Draft = {
  kind: "auction" | "rent";
  reserve: string;
  step: string;
  opens: string;
  closes: string;
  perDay: string;
  term: string;
  from: string;
  until: string;
};

/**
 * Цены по местам: аукцион или аренда по дням у каждого своя. Умолчания
 * стоят сразу - продавец меняет только то, что хочет, а не заполняет форму
 * с нуля.
 */
export function SetUpSpots({
  thing,
  onBack,
  onPublish,
  publishing,
  failed,
}: {
  thing: PricingThing;
  onBack: () => void;
  onPublish: (plans: { spotId: string; plan: SpotPlan }[]) => void;
  publishing: boolean;
  failed: boolean;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    thing.spots.map((_, index) => fresh(index < 2 ? "auction" : "rent")),
  );

  function patch(index: number, change: Partial<Draft>) {
    setDrafts((was) => was.map((one, at) => (at === index ? { ...one, ...change } : one)));
  }

  const auctions = drafts.filter((one) => one.kind === "auction").length;
  const rents = drafts.length - auctions;
  const plans = drafts.map((one, index) => ({ spotId: thing.spots[index]!.id, plan: toPlan(one) }));
  const valid = plans.every((one) => one.plan !== null);

  return (
    <>
      <Bar title="Set up spots" onBack={onBack} />

      <div className="sl-card sl-thing-card">
        <div className="sl-mini">
          {thing.cover && <img src={thing.cover} alt="" />}
          {thing.spots.map((spot, index) =>
            spot.rect ? (
              <span
                key={spot.id}
                style={{
                  left: `${spot.rect.x * 100}%`,
                  top: `${spot.rect.y * 100}%`,
                  width: `${spot.rect.w * 100}%`,
                  height: `${spot.rect.h * 100}%`,
                }}
              >
                {index + 1}
              </span>
            ) : null,
          )}
        </div>
        <div>
          <h2>{thing.title}</h2>
          <p>
            {thing.spots.length === 1 ? "1 spot" : `${thing.spots.length} spots`}. Defaults
            are set, change what you need.
          </p>
        </div>
      </div>

      {drafts.map((one, index) => (
        <div className="sl-card sl-plan" key={thing.spots[index]!.id}>
          <div className="sl-plan-head">
            <h3>{thing.spots[index]!.label}</h3>
            <div className="sl-kind">
              {(["auction", "rent"] as const).map((kind) => (
                <button
                  type="button"
                  key={kind}
                  className={one.kind === kind ? "on" : ""}
                  onClick={() => patch(index, { kind })}
                >
                  {kind === "auction" ? "Auction" : "Rent by day"}
                </button>
              ))}
            </div>
          </div>

          {one.kind === "auction" ? (
            <>
              <Money label="Reserve" value={one.reserve} onChange={(reserve) => patch(index, { reserve })} />
              <Money label="Min step" value={one.step} onChange={(step) => patch(index, { step })} />
              <When label="Opens" value={one.opens} onChange={(opens) => patch(index, { opens })} />
              <When label="Closes" value={one.closes} onChange={(closes) => patch(index, { closes })} />
              <p className="sl-plan-note">
                Runs {runDays(one)} days. Highest bid at the close gets printed,
                no approval step.
              </p>
            </>
          ) : (
            <>
              <Money label="Price per day" value={one.perDay} onChange={(perDay) => patch(index, { perDay })} />
              <label className="sl-field">
                Min term
                <span className="sl-input">
                  <input
                    inputMode="numeric"
                    value={one.term}
                    onChange={(event) => patch(index, { term: event.target.value.replace(/\D/g, "") })}
                  />
                  days
                </span>
              </label>
              <div className="sl-field wide">
                Available
                {/* Строка как на борде, а выбор даты - системный: левая
                    половина правит начало, правая - конец. */}
                <span className="sl-input soft sl-when">
                  From {dayLabel(one.from)}, {one.until ? `until ${dayLabel(one.until)}` : "no end date"}
                  <input
                    className="sl-pick half"
                    type="date"
                    aria-label="Available from"
                    value={one.from}
                    onChange={(event) => patch(index, { from: event.target.value })}
                  />
                  <input
                    className="sl-pick half end"
                    type="date"
                    aria-label="Available until"
                    value={one.until}
                    onChange={(event) => patch(index, { until: event.target.value })}
                  />
                </span>
              </div>
              <p className="sl-plan-note">
                You see the artwork and approve each request before money
                moves.
              </p>
            </>
          )}
        </div>
      ))}

      {drafts.length > 1 && (
        <button
          type="button"
          className="sl-copy"
          onClick={() => setDrafts((was) => was.map(() => ({ ...was[0]! })))}
        >
          Copy spot 1 to all spots
        </button>
      )}

      {failed && <p className="bad">Could not save the prices. Try again.</p>}

      <div className="sl-card sl-publish">
        <b>
          {auctions} by auction · {rents} for rent
        </b>
        <span>You can edit until a spot opens</span>
        <button
          type="button"
          className="sl-btn dark"
          disabled={!valid || publishing}
          onClick={() => onPublish(plans as { spotId: string; plan: SpotPlan }[])}
        >
          {publishing ? "Publishing…" : "Publish"}
        </button>
      </div>
    </>
  );
}

function Money({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="sl-field">
      {label}
      <span className="sl-input">
        $
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/[^\d.]/g, ""))}
        />
      </span>
    </label>
  );
}

function When({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="sl-field">
      {label}
      <span className="sl-input soft sl-when">
        {whenLabel(value)}
        <input
          className="sl-pick"
          type="datetime-local"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function fresh(kind: "auction" | "rent"): Draft {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  if (noon.getTime() < Date.now()) noon.setDate(noon.getDate() + 1);
  const closes = new Date(noon.getTime() + WEEK);
  return {
    kind,
    reserve: DEFAULT_RESERVE,
    step: DEFAULT_STEP,
    opens: local(noon),
    closes: local(closes),
    perDay: DEFAULT_DAY,
    term: DEFAULT_TERM,
    from: local(noon).slice(0, 10),
    until: "",
  };
}

/** Время для поля datetime-local: в часах человека, без зоны. */
function local(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** «Mon Sep 28, 12:00» - так время торга написано на борде. */
function whenLabel(value: string): string {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return "Pick a time";
  const day = at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = at.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

/** «Sep 28» из «2026-09-28»: день без часового пояса. */
function dayLabel(value: string): string {
  const [year, month, date] = value.split("-").map(Number);
  if (!year || !month || !date) return "-";
  return new Date(year, month - 1, date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function cents(value: string): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
}

function runDays(one: Draft): number {
  return Math.max(0, Math.round((Date.parse(one.closes) - Date.parse(one.opens)) / 86_400_000));
}

function toPlan(one: Draft): SpotPlan | null {
  if (one.kind === "auction") {
    const reserve = cents(one.reserve);
    const step = cents(one.step);
    const opens = Date.parse(one.opens);
    const closes = Date.parse(one.closes);
    // Программа не примет торг длиннее 30 дней и закрытый в прошлом.
    if (!reserve || !step || !(closes > opens) || closes - opens > 30 * 86_400_000) return null;
    return {
      kind: "auction",
      reserveCents: reserve,
      stepCents: step,
      opensAt: new Date(opens).toISOString(),
      closesAt: new Date(closes).toISOString(),
    };
  }
  const perDay = cents(one.perDay);
  const term = Number(one.term);
  if (!perDay || !(term >= 1 && term <= 365) || !one.from) return null;
  if (one.until && one.until <= one.from) return null;
  return {
    kind: "rent",
    perDayCents: perDay,
    minDays: term,
    availableFrom: one.from,
    availableUntil: one.until || null,
  };
}
