"use client";

import { useEffect, useState } from "react";
import { publishCost, type PublishCost } from "@oxar/core";
import type { PricingThing, SpotPlan, Worn } from "@/lib/seller";
import { spotsPerSale } from "@/lib/publish";
import { rentPerByte } from "@/lib/chain";
import { Bar, SpotMark } from "./parts.tsx";

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
  onRename,
}: {
  thing: PricingThing;
  onBack: () => void;
  /** Удалить вещь целиком - пока торг не открыт. */
  onDelete: () => Promise<boolean>;
  /** Переименовать вещь - пока торг не открыт. */
  onRename: (name: string) => Promise<boolean>;
  onPublish: (plans: { spotId: string; plan: SpotPlan }[], worn: Worn) => void;
  publishing: boolean;
  failed: boolean;
  /** Почему не открылись аукционы: нет кошелька, SOL или сети. */
  problem?: string;
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => thing.spots.map(fresh));
  const [name, setName] = useState(thing.title);
  const [saved, setSaved] = useState(thing.title);
  const [naming, setNaming] = useState<"idle" | "failed">("idle");
  // Удаление в два касания: первое спрашивает, второе удаляет.
  const [removing, setRemoving] = useState<"idle" | "ask" | "busy" | "failed">("idle");

  function patch(index: number, change: Partial<Draft>) {
    setDrafts((was) => was.map((one, at) => (at === index ? { ...one, ...change } : one)));
  }

  const plans = drafts.map((one, index) => ({ spotId: thing.spots[index]!.id, plan: toPlan(one) }));
  // Кто носит вещь, где и когда: без этого покупатель места не знает,
  // кто увидит его логотип, и публиковать нельзя.
  const [worn, setWorn] = useState<Worn>(thing.worn);
  // «Когда» выбирают в календаре: первый день и, если вещь носят несколько
  // дней, последний. В базу уходит текстом, как его читают покупатели.
  // Носить вещь с логотипами можно только после торга: раньше дня закрытия
  // календарь дней не даёт.
  const [days, setDays] = useState({ from: "", to: "" });
  const closesOn = drafts.map((one) => one.closes.slice(0, 10)).sort().at(-1) ?? "";
  const early = days.from !== "" && days.from < closesOn;
  function pickDays(next: { from: string; to: string }) {
    const to = next.to && next.to > next.from ? next.to : "";
    setDays({ from: next.from, to });
    setWorn({ ...worn, when: next.from ? dayRange(next.from, to) : thing.worn.when });
  }
  const described = [worn.by, worn.where, worn.when].every((one) => one.trim().length > 0) && !early;
  const valid = plans.every((one) => one.plan !== null);
  // Ставка залога - из сети: пока не пришла, стоимость не пишем, чтобы не
  // показать устаревшую.
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    void rentPerByte().then(setRate, () => setRate(null));
  }, []);
  const cost =
    valid && rate !== null
      ? publishCost(spotsPerSale(plans.map((one) => (one.plan as { closesAt: string }).closesAt)), rate)
      : null;

  return (
    <>
      <Bar title="Set up spots" onBack={onBack} step="3 of 3" />

      <div className="sl-card sl-thing-card">
        <div>
          {/* Название - продавца: правится здесь, пока торг не открыт. */}
          <input
            className="sl-name"
            aria-label="Name of the thing"
            value={name}
            maxLength={60}
            onChange={(event) => {
              setName(event.target.value);
              setNaming("idle");
            }}
            onBlur={async () => {
              const next = name.trim();
              if (!next || next === saved) return setName(saved);
              if (await onRename(next)) setSaved(next);
              else setNaming("failed");
            }}
          />
          {naming === "failed" && <p className="bad">Could not rename it. Try again.</p>}
          <p>
            {thing.spots.length === 1 ? "1 spot" : `${thing.spots.length} spots`}. Defaults
            are set, change what you need.
          </p>
        </div>
        {/* Все снимки вещи, на каждом - его места, как их разметили. */}
        <div className="sl-minis">
          {(thing.photos.length ? thing.photos : [thing.cover]).map((url, at) => (
            <div className="sl-mini" key={url ?? at}>
              {url && <img src={url} alt="" />}
              {thing.spots.map((spot, index) =>
                spot.rect && spot.photo === at ? (
                  <SpotMark key={spot.id} rect={spot.rect} outline={spot.outline} number={index + 1} />
                ) : null,
              )}
            </div>
          ))}
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
            Runs {runDays(one)} days. Highest bid at the close wins the spot,
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

      <div className="sl-card sl-plan">
        <div className="sl-plan-head">
          <h3>Who, where and when</h3>
        </div>
        <Text label="Who has it" value={worn.by} example="Our founder" onChange={(by) => setWorn({ ...worn, by })} />
        <Text label="Where" value={worn.where} example="Demo Day, Kyiv" onChange={(where) => setWorn({ ...worn, where })} />
        <Day
          label="When"
          value={days.from}
          shown={days.from ? dayRange(days.from, "") : worn.when || "Pick a day"}
          min={closesOn}
          onChange={(from) => pickDays({ from, to: days.to })}
        />
        <Day
          label="Last day (optional)"
          value={days.to}
          shown={days.to ? dayRange(days.to, "") : "One day"}
          min={days.from || closesOn}
          disabled={!days.from}
          onChange={(to) => pickDays({ from: days.from, to })}
        />
        {early && <p className="bad sl-plan-note">Pick a day after the auction closes - the logos are printed after it.</p>}
        <Note
          label="What makes it special (optional)"
          value={worn.about}
          example="Worn on stage during the pitch, in front of 300 founders"
          onChange={(about) => setWorn({ ...worn, about })}
        />
        <p className="sl-plan-note">Bidders see this before they bid. Who, where and when are needed to publish.</p>
      </div>

      {failed && <p className="bad">Could not save the prices. Try again.</p>}
      {problem && <p className="bad">{problem}</p>}

      {/* Сколько нужно на кошельке - на самой кнопке; здесь - что из этого вернётся. */}
      {cost && (
        <p className="sl-plan-note">
          Most of it comes back: {sol(cost.backLamports)} SOL is a deposit that returns to your
          wallet when the auction ends. Only {sol(cost.keptLamports)} SOL pays the network.
        </p>
      )}

      <div className="sl-card sl-publish">
        <b>{drafts.length === 1 ? "1 by auction" : `${drafts.length} by auction`}</b>
        <span>Then we review it and put it on the Market, usually within a day</span>
        <button
          type="button"
          className="sl-btn dark"
          disabled={!valid || !described || publishing}
          onClick={() => onPublish(plans as { spotId: string; plan: SpotPlan }[], worn)}
        >
          {publishing ? "Publishing…" : cost ? `Publish · ${sol(cost.totalLamports)} SOL` : "Publish"}
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

function Text({
  label,
  value,
  example,
  onChange,
}: {
  label: string;
  value: string;
  example: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="sl-field wide">
      {label}
      <span className="sl-input">
        <input value={value} maxLength={120} placeholder={example} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

/** Абзац, а не строка: особенность рассказывают парой предложений. */
function Note({
  label,
  value,
  example,
  onChange,
}: {
  label: string;
  value: string;
  example: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="sl-field wide">
      {label}
      <span className="sl-input tall">
        <textarea rows={3} value={value} maxLength={300} placeholder={example} onChange={(event) => onChange(event.target.value)} />
      </span>
    </label>
  );
}

/**
 * Поле даты невидимо и лежит поверх подписи. Телефон по касанию открывает
 * календарь сам, а десктопный браузер - только по своей иконке справа,
 * которой не видно. Поэтому календарь открываем клику по любому месту поля.
 */
function openPicker(event: React.MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker();
  } catch {
    // Старый браузер без showPicker: остаётся его собственное поведение.
  }
}

/** День из календаря: подпись словами, под ней невидимое поле даты. */
function Day({
  label,
  value,
  shown,
  min,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  shown: string;
  min: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="sl-field">
      {label}
      <span className={value ? "sl-input soft sl-when" : "sl-input soft sl-when empty"}>
        {shown}
        <input
          className="sl-pick"
          type="date"
          value={value}
          min={min}
          disabled={disabled}
          onClick={openPicker}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

/**
 * «October 10», «October 12 - 14», «October 30 - November 2». Год - только
 * если не текущий: событие через месяц читается без него.
 */
function dayRange(from: string, to: string): string {
  const a = new Date(`${from}T12:00`);
  const b = to ? new Date(`${to}T12:00`) : null;
  const year = (b ?? a).getFullYear() === new Date().getFullYear() ? "" : `, ${(b ?? a).getFullYear()}`;
  const month = (at: Date) => at.toLocaleDateString("en-US", { month: "long" });
  if (!b) return `${month(a)} ${a.getDate()}${year}`;
  if (b.getMonth() === a.getMonth() && b.getFullYear() === a.getFullYear()) {
    return `${month(a)} ${a.getDate()} - ${b.getDate()}${year}`;
  }
  return `${month(a)} ${a.getDate()} - ${month(b)} ${b.getDate()}${year}`;
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
          onClick={openPicker}
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

// Четыре знака: с тремя части не складывались в сумму на кнопке.
const sol = (lamports: number) => (lamports / 1e9).toFixed(4);

/**
 * Во что обойдётся публикация - честно: залог за места вернётся после
 * торга, а аккаунт торга и подписи уходят сети.
 */
export function costLine(cost: PublishCost): string {
  return `Publishing needs about ${sol(cost.totalLamports)} SOL in your wallet. ${sol(cost.backLamports)} SOL of it is a deposit that comes back to you when the auction ends; ${sol(cost.keptLamports)} SOL pays the network and does not come back.`;
}
