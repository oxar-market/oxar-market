"use client";

import { endDate, isWithin, type CalendarDay } from "@oxar/core";

// Сетка выровнена по дням недели: день месяца сам по себе ничего не говорит, а
// «свободны ли выходные» - говорит.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Понедельник - ноль: неделя в календаре начинается с него, а в JS с воскресенья. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function monthLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

export function Calendar({
  days,
  termDays,
  chosen,
  onPick,
}: {
  days: CalendarDay[];
  termDays: number;
  chosen: string;
  onPick: (date: string) => void;
}) {
  const first = days[0];
  if (!first) return null;

  const last = endDate(chosen || first.date, termDays);
  const months = [...new Set(days.map((day) => monthLabel(day.date)))];

  return (
    <div className="cal">
      <div className="cal-head">
        <span className="cal-month">{months.join(" - ")}</span>
        <span className="cal-legend">
          <span className="cal-dot busy" aria-hidden /> taken
        </span>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((name) => (
          <span key={name} className="cal-weekday">
            {name}
          </span>
        ))}

        {/* Пустые клетки до первого дня окна, иначе столбцы врут о днях недели */}
        {Array.from({ length: weekdayIndex(first.date) }, (_, i) => (
          <span key={`pad-${i}`} className="cal-pad" aria-hidden />
        ))}

        {days.map((day) => {
          const inTerm = chosen ? isWithin(day.date, chosen, last) : false;
          const state = day.taken
            ? "taken"
            : day.date === chosen
              ? "start"
              : inTerm
                ? "span"
                : day.canStart
                  ? "free"
                  : "tight";

          return (
            <button
              key={day.date}
              type="button"
              className={`cal-day ${state}`}
              disabled={!day.canStart}
              onClick={() => onPick(day.date)}
              aria-pressed={day.date === chosen}
              title={
                day.taken
                  ? `${day.date} - taken`
                  : day.canStart
                    ? day.date
                    : `${day.date} - not enough free days from here`
              }
            >
              {Number(day.date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
