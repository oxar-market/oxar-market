/**
 * Календарь размещения. Товар измеряется сутками, поэтому здесь нет ни часов,
 * ни зон: дата - это строка YYYY-MM-DD, и арифметика идёт по UTC, иначе
 * переход на летнее время сдвигал бы границы срока.
 *
 * Два разных состояния дня, которые легко спутать. `taken` - день уже кем-то
 * занят. `canStart` - с этого дня влезает весь срок. День может быть свободен,
 * но не годиться под старт, потому что срок налезает на чужую бронь дальше.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MS_IN_DAY = 86_400_000;

export type DayRange = { startDate: string; endDate: string };

export type CalendarDay = {
  date: string;
  /** День внутри чьей-то брони. Кем именно - витрине не показывают. */
  taken: boolean;
  /** С этого дня срок укладывается целиком. */
  canStart: boolean;
};

/** Последний день срока, включительно: старт 10-го на 7 дней - это по 16-е. */
export function endDate(startDate: string, days: number): string {
  assertDay(startDate);
  assertCount(days, "days");
  return toDay(parse(startDate) + (days - 1) * MS_IN_DAY);
}

/** Попадает ли день в отрезок, границы включительно. */
export function isWithin(date: string, from: string, to: string): boolean {
  assertDay(date);
  assertDay(from);
  assertDay(to);
  const at = parse(date);
  return at >= parse(from) && at <= parse(to);
}

export function calendarDays(args: {
  /** Первый день окна. */
  from: string;
  /** Сколько дней показываем. */
  count: number;
  /** Срок размещения - от него зависит, годится ли день под старт. */
  termDays: number;
  busy: DayRange[];
}): CalendarDay[] {
  assertDay(args.from);
  assertCount(args.count, "count");
  assertCount(args.termDays, "termDays");

  const taken = new Set<string>();
  for (const range of args.busy) {
    assertDay(range.startDate);
    assertDay(range.endDate);
    for (let at = parse(range.startDate); at <= parse(range.endDate); at += MS_IN_DAY) {
      taken.add(toDay(at));
    }
  }

  const start = parse(args.from);
  const days: CalendarDay[] = [];
  for (let i = 0; i < args.count; i += 1) {
    const at = start + i * MS_IN_DAY;
    let canStart = true;
    // Срок считаем за пределами окна тоже: бронь на день после окна всё равно
    // мешает начать внутри него.
    for (let offset = 0; offset < args.termDays; offset += 1) {
      if (taken.has(toDay(at + offset * MS_IN_DAY))) {
        canStart = false;
        break;
      }
    }
    days.push({ date: toDay(at), taken: taken.has(toDay(at)), canStart });
  }

  return days;
}

function parse(day: string): number {
  return Date.parse(`${day}T00:00:00Z`);
}

function toDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function assertDay(value: string): void {
  if (!DAY.test(value) || Number.isNaN(parse(value))) {
    throw new Error(`${value} is not a YYYY-MM-DD day`);
  }
}

function assertCount(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive whole number`);
  }
}
