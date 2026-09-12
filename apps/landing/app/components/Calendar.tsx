"use client";

import { endDate, isWithin, type CalendarDay } from "@oxar/core";

// Сетка выровнена по дням недели: день месяца сам по себе ничего не говорит, а
// «свободны ли выходные» - говорит.
//
// Свободные дни без подложки: двадцать восемь залитых кружков рябят и не дают
// увидеть главное - где начинается и кончается выбранный срок. Подложка есть
// только у выбранного отрезка, и она непрерывная, а не из отдельных кружков.

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Понедельник - ноль: неделя в календаре начинается с него, а в JS с воскресенья. */
function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function monthSpan(days: CalendarDay[]): string {
  const names = [
    ...new Set(
      days.map((day) =>
        new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "long",
          timeZone: "UTC",
        }),
      ),
    ),
  ];
  return names.join(" - ");
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

  const last = chosen ? endDate(chosen, termDays) : "";

  return (
    <div className="cal">
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
          const marks = [
            inTerm ? "in" : "",
            day.date === chosen ? "start" : "",
            inTerm && day.date === last ? "end" : "",
            day.taken ? "taken" : "",
            !day.taken && !day.canStart ? "tight" : "",
          ].filter(Boolean);

          return (
            <button
              key={day.date}
              type="button"
              className={["cal-day", ...marks].join(" ")}
              disabled={!day.canStart}
              onClick={() => onPick(day.date)}
              aria-pressed={day.date === chosen}
              title={
                day.taken
                  ? `${day.date} - booked`
                  : day.canStart
                    ? day.date
                    : `${day.date} - not enough free days from here`
              }
            >
              <span className="cal-num">{Number(day.date.slice(8))}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
