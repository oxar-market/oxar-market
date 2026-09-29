"use client";

import { useState } from "react";
import type { PricingThing, SpotPlan } from "@/lib/seller";
import { Bar } from "./parts.tsx";

/** Значения по умолчанию: те же, что у первой футболки. */
const DEFAULT_RESERVE = "10.00";
const DEFAULT_STEP = "5.00";
/** Аукцион по умолчанию - неделя от ближайшего полудня. */
const WEEK = 7 * 86_400_000;

type Draft = {
  reserve: string;
  step: string;
  opens: string;
  closes: string;
};

/**
 * Цены по местам. Пока только аукцион: аренду по дням программа не
 * держит - эскроу для неё нет, - поэтому вкладка видна, но выключена и на
 * наведение говорит «Coming soon». Кнопка, которая ничего не делает, хуже
 * честно выключенной.
 *
 * Умолчания стоят сразу - продавец меняет только то, что хочет.
 */
export function SetUpSpots({
  thing,
  onBack,
  onPublish,
  publishing,
  failed,
  problem,
  onDelete,
}: {
  thing: PricingThing;
  onBack: () => void;
  /** Удалить вещь целиком - пока торг не открыт. */
  onDelete: () => Promise<boolean>;
  onPublish: (plans: { spotId: string; plan: SpotPlan }[]) => void;
  publishing: boolean;
  failed: boolean;
  /** Почему не открылись аукционы: нет кошелька, SOL или сети. */
  problem?: string;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => thing.spots.map(fresh));
  // Удаление в два касания: первое спрашивает, второе удаляет.
  const [removing, setRemoving] = useState<"idle" | "ask" | "busy" | "failed">("idle");

  function patch(index: number, change: Partial<Draft>) {
    setDrafts((was) => was.map((one, at) => (at === index ? { ...one, ...change } : one)));
  }

  const plans = drafts.map((one, index) => ({ spotId: thing.spots[index]!.id, plan: toPlan(one) }));
  const valid = plans.every((one) => one.plan !== null);

  return (
    <>
      <Bar title="Set up spots" onBack={onBack} />

      <div className="sl-card sl-thing-card">
        <div className="sl-mini">
          {thing.cover && <img src={thing.cover} alt="" />}
          {thing.spots.map((spot, index) =>
            // Обложка - первый снимок: на ней только его места.
            spot.rect && spot.photo === 0 ? (
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
              <button type="button" className="on">
                Auction
              </button>
              <button type="button" disabled className="soon" data-tip="Coming soon">
                Rent by day
              </button>
            </div>
          </div>

          <Money label="Reserve" value={one.reserve} onChange={(reserve) => patch(index, { reserve })} />
          <Money label="Min step" value={one.step} onChange={(step) => patch(index, { step })} />
          <When label="Opens" value={one.opens} onChange={(opens) => patch(index, { opens })} />
          <When label="Closes" value={one.closes} onChange={(closes) => patch(index, { closes })} />
          <p className="sl-plan-note">
            Runs {runDays(one)} days. Highest bid at the close gets printed,
            no approval step.
          </p>
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
      {problem && <p className="bad">{problem}</p>}

      <div className="sl-card sl-publish">
        <b>{drafts.length === 1 ? "1 by auction" : `${drafts.length} by auction`}</b>
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

      {/* Где потом брать то, что печатать: продавцу это нужно знать заранее. */}
      <p className="sl-plan-note">
        When the auction ends, the winning logos wait for you in Your things -
        tap this thing to open and save them.
      </p>

      <button
        type="button"
        className="sl-copy"
        disabled={removing === "busy" || publishing}
        onClick={async () => {
          if (removing !== "ask") return setRemoving("ask");
          setRemoving("busy");
          if (!(await onDelete())) setRemoving("failed");
        }}
      >
        {removing === "ask"
          ? "Tap again to delete this thing"
          : removing === "busy"
            ? "Deleting…"
            : "Delete this thing"}
      </button>
      {removing === "failed" && <p className="bad">Could not delete it. Try again.</p>}
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

function fresh(): Draft {
  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  if (noon.getTime() < Date.now()) noon.setDate(noon.getDate() + 1);
  const closes = new Date(noon.getTime() + WEEK);
  return {
    reserve: DEFAULT_RESERVE,
    step: DEFAULT_STEP,
    opens: local(noon),
    closes: local(closes),
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

function cents(value: string): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) : null;
}

function runDays(one: Draft): number {
  return Math.max(0, Math.round((Date.parse(one.closes) - Date.parse(one.opens)) / 86_400_000));
}

function toPlan(one: Draft): SpotPlan | null {
  const reserve = cents(one.reserve);
  const step = cents(one.step);
  const opens = Date.parse(one.opens);
  const closes = Date.parse(one.closes);
  // Программа не примет торг длиннее 30 дней и закрытый в прошлом.
  if (!reserve || !step || !(closes > opens) || closes < Date.now() || closes - opens > 30 * 86_400_000) {
    return null;
  }
  return {
    kind: "auction",
    reserveCents: reserve,
    stepCents: step,
    opensAt: new Date(opens).toISOString(),
    closesAt: new Date(closes).toISOString(),
  };
}
