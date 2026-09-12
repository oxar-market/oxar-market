import type { DayRange, PlacementKind, Pricing } from "@oxar/core";

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
  /** term - цена за весь срок, daily - за сутки. См. @oxar/core. */
  pricing: Pricing;
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
    "id,kind,pricing,price_cents,term_days,seller:sellers(x_handle,display_name,follower_count,is_org)";
  const response = await fetch(
    `${url}/rest/v1/listings?select=${select}&active=is.true&kind=eq.${kind}&order=price_cents.desc`,
    { headers: headers() },
  );

  if (!response.ok) return [];
  return (await response.json()) as Offer[];
}

type BusyRow = { start_date: string; end_date: string };

/** Занятые отрезки листинга, без данных покупателя: их не отдаёт и сама view. */
export async function busyRanges(listingId: string): Promise<DayRange[]> {
  if (!url || !anonKey) return [];

  const response = await fetch(
    `${url}/rest/v1/listing_busy?select=start_date,end_date&listing_id=eq.${listingId}`,
    { headers: headers() },
  );

  if (!response.ok) return [];
  const rows = (await response.json()) as BusyRow[];
  return rows.map((row) => ({ startDate: row.start_date, endDate: row.end_date }));
}

export type PlacementRequest = {
  listing_id: string;
  buyer_handle: string;
  buyer_contact: string | null;
  creative_url: string | null;
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
