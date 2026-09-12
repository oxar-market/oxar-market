import type { PlacementKind } from "@oxar/core";

// Витрина публичная: RLS отдаёт анониму только проверенных продавцов, активные
// листинги и занятые даты без данных покупателя. Заявку он может только
// создать. Поэтому ходим в REST Supabase прямо из браузера, без своего бэкенда.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function headers() {
  return {
    apikey: anonKey ?? "",
    Authorization: `Bearer ${anonKey ?? ""}`,
    "Content-Type": "application/json",
  };
}

export type Offer = {
  id: string;
  kind: PlacementKind;
  price_cents: number;
  term_days: number;
  seller: {
    x_handle: string;
    display_name: string;
    follower_count: number;
    is_org: boolean;
  };
};

export async function offersFor(kind: PlacementKind): Promise<Offer[]> {
  if (!url || !anonKey) return [];

  const select =
    "id,kind,price_cents,term_days,seller:sellers(x_handle,display_name,follower_count,is_org)";
  const response = await fetch(
    `${url}/rest/v1/listings?select=${select}&active=is.true&kind=eq.${kind}&order=price_cents.desc`,
    { headers: headers() },
  );

  if (!response.ok) return [];
  return (await response.json()) as Offer[];
}

export type BusyRange = { start_date: string; end_date: string };

export async function busyRanges(listingId: string): Promise<BusyRange[]> {
  if (!url || !anonKey) return [];

  const response = await fetch(
    `${url}/rest/v1/listing_busy?select=start_date,end_date&listing_id=eq.${listingId}`,
    { headers: headers() },
  );

  if (!response.ok) return [];
  return (await response.json()) as BusyRange[];
}

export type PlacementRequest = {
  listing_id: string;
  buyer_handle: string;
  buyer_contact: string | null;
  creative_text: string | null;
  start_date: string;
  end_date: string;
  price_cents: number;
};

export async function requestPlacement(
  request: PlacementRequest,
): Promise<"created" | "error"> {
  if (!url || !anonKey) return "error";

  const response = await fetch(`${url}/rest/v1/bookings`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=minimal" },
    // Статус задаём здесь же: RLS не даст вставить ничего, кроме requested,
    // то есть покупатель не может сам себе одобрить бронь.
    body: JSON.stringify({ ...request, status: "requested" }),
  });

  return response.ok ? "created" : "error";
}

/** Конец срока включительно: старт 10-го на 7 дней - это по 16-е. */
export function endDate(start: string, days: number): string {
  const date = new Date(`${start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Дни, с которых можно начать. День свободен, если весь срок от него не
 * пересекается ни с одной занятой бронью.
 */
export function upcomingDays(
  count: number,
  termDays: number,
  busy: BusyRange[],
): { date: string; label: string; free: boolean }[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const taken = new Set<string>();
  for (const range of busy) {
    for (
      const day = new Date(`${range.start_date}T00:00:00Z`);
      day <= new Date(`${range.end_date}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      taken.add(day.toISOString().slice(0, 10));
    }
  }

  const days = [];
  for (let i = 1; i <= count; i += 1) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() + i);

    let free = true;
    for (let offset = 0; offset < termDays; offset += 1) {
      const inTerm = new Date(date);
      inTerm.setUTCDate(inTerm.getUTCDate() + offset);
      if (taken.has(inTerm.toISOString().slice(0, 10))) {
        free = false;
        break;
      }
    }

    days.push({
      date: date.toISOString().slice(0, 10),
      label: String(date.getUTCDate()),
      free,
    });
  }

  return days;
}
